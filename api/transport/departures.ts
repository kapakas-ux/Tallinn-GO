import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { stopId, siriId } = req.query;
  if (!stopId) return res.status(400).json({ error: "stopId is required" });

  const cleanStopId = String(stopId).trim();
  const cleanSiriId = siriId ? String(siriId).trim() : cleanStopId;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Referer': 'https://transport.tallinn.ee/'
  };

  try {
    // Attempt 1: without time parameter
    const siriUrl = `https://transport.tallinn.ee/siri-stop-departures.php?stopid=${cleanSiriId}`;
    const siriResponse = await axios.get(siriUrl, { headers, responseType: 'text', timeout: 8000 });

    const siriLines = siriResponse.data ? siriResponse.data.split('\n').filter((l: string) => l.trim().length > 0) : [];
    if (siriLines.length > 1) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(siriResponse.data);
    }

    // Attempt 2: with timestamp
    const timestamp = Math.floor(Date.now() / 1000);
    const resp2 = await axios.get(`${siriUrl}&time=${timestamp}`, { headers, responseType: 'text', timeout: 8000 });
    if (resp2.data && resp2.data.split('\n').length > 1) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(resp2.data);
    }

    // Attempt 3: with time=0
    const resp3 = await axios.get(`${siriUrl}&time=0`, { headers, responseType: 'text', timeout: 8000 });
    if (resp3.data && resp3.data.split('\n').length > 1) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(resp3.data);
    }

    // Attempt 4: start of day
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfDayTs = Math.floor(startOfDay.getTime() / 1000);
    const resp4 = await axios.get(`${siriUrl}&time=${startOfDayTs}`, { headers, responseType: 'text', timeout: 8000 });
    if (resp4.data && resp4.data.split('\n').length > 1) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(resp4.data);
    }

    // Attempt 5: a- prefix
    try {
      const respA = await axios.get(`https://transport.tallinn.ee/siri-stop-departures.php?stopid=a-${cleanStopId}`, { headers, responseType: 'text', timeout: 5000 });
      if (respA.data && respA.data.split('\n').length > 1) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(respA.data);
      }
    } catch {}

    // Ridango fallback
    const ridangoIds = [cleanSiriId, cleanStopId.split('-')[0]];
    for (const ridId of ridangoIds) {
      try {
        const ridangoRes = await axios.get(`https://api.ridango.com/v2/6/stop-departures?stop_id=${ridId}`, { timeout: 5000 });
        if (ridangoRes.data?.departures?.length > 0) {
          const serverTimeUnix = Math.floor(Date.now() / 1000);
          let siriText = `1,${ridId},0,0,${serverTimeUnix},0\n\n`;
          ridangoRes.data.departures.forEach((d: any) => {
            const type = d.vehicle_type === 'tram' ? 'tram' : (d.vehicle_type === 'trolley' ? 'trolley' : 'bus');
            const depTime = new Date(d.expected_time || d.scheduled_time);
            const expectedTimeUnix = Math.floor(depTime.getTime() / 1000);
            const schedTime = new Date(d.scheduled_time || d.expected_time);
            const scheduledTimeUnix = Math.floor(schedTime.getTime() / 1000);
            let line = d.route_code || '';
            if (line.includes('.')) line = line.split('.')[0];
            siriText += `${type},${line},${expectedTimeUnix},${scheduledTimeUnix},${d.destination || ''}\n`;
          });
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          return res.send(siriText);
        }
      } catch {}
    }

    // iil.pilet.ee fallback
    for (const ridId of ridangoIds) {
      try {
        const piletRes = await axios.get(`https://iil.pilet.ee/api/v1/stops/${ridId}/departures`, { timeout: 5000 });
        if (piletRes.data?.departures?.length > 0) {
          const serverTimeUnix = Math.floor(Date.now() / 1000);
          let siriText = `1,${ridId},0,0,${serverTimeUnix},0\n\n`;
          piletRes.data.departures.forEach((d: any) => {
            const type = d.vehicle_type === 'tram' ? 'tram' : (d.vehicle_type === 'trolley' ? 'trolley' : 'bus');
            const depTime = new Date(d.expected_time || d.scheduled_time);
            const expectedTimeUnix = Math.floor(depTime.getTime() / 1000);
            const schedTime = new Date(d.scheduled_time || d.expected_time);
            const scheduledTimeUnix = Math.floor(schedTime.getTime() / 1000);
            let line = d.route_code || '';
            if (line.includes('.')) line = line.split('.')[0];
            siriText += `${type},${line},${expectedTimeUnix},${scheduledTimeUnix},${d.destination || ''}\n`;
          });
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          return res.send(siriText);
        }
      } catch {}
    }

    // Return what Siri gave us
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(siriResponse.data);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch departures", details: error.message });
  }
}
