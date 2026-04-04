import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import cors from "cors";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Enable CORS for native app access
  app.use(cors({
    origin: (origin, callback) => {
      // Allow all origins
      callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  }));

  // Manual fallback for CORS headers to ensure they are always present
  app.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${origin}`);
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString(), env: process.env.NODE_ENV });
  });

  let cachedStopsTxt: string | null = null;
  let stopsTxtCacheTime = 0;

  // Proxy for Tallinn transport data
  app.get("/api/transport/stops", async (req, res) => {
    const now = Date.now();
    if (cachedStopsTxt && (now - stopsTxtCacheTime < 24 * 60 * 60 * 1000)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(cachedStopsTxt);
    }

    console.log("GET /api/transport/stops - Fetching from Tallinn...");
    const urls = [
      "https://transport.tallinn.ee/data/stops.txt"
    ];

    let lastError = null;
    for (const url of urls) {
      try {
        console.log(`Attempting to fetch stops from: ${url}`);
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          validateStatus: (status) => status === 200,
          maxRedirects: 5
        });
        
        const buffer = Buffer.from(response.data);
        console.log(`Successfully fetched stops.txt from ${url}, buffer length: ${buffer.length}`);
        
        if (buffer.length < 100) {
          console.warn(`Buffer from ${url} is too small, skipping...`);
          continue;
        }

        // Robust encoding detection
        let text = '';
        // Check for UTF-16 BOMs
        if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
          text = new TextDecoder('utf-16le').decode(buffer);
        } else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
          text = new TextDecoder('utf-16be').decode(buffer);
        } else if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
          text = new TextDecoder('utf-8').decode(buffer);
        } else {
          // Try UTF-8 first, then Windows-1257 (Baltic), then ISO-8859-1
          try {
            const decoder = new TextDecoder('utf-8', { fatal: true });
            text = decoder.decode(buffer);
          } catch (e) {
            try {
              text = new TextDecoder('windows-1257').decode(buffer);
            } catch (e2) {
              text = new TextDecoder('iso-8859-1').decode(buffer);
            }
          }
        }

        // Clean up text: remove nulls, BOMs, and trim
        text = text.replace(/\0/g, '').replace(/^\uFEFF/, '').trim();
        
        if (text.length < 100) {
          console.warn(`Decoded text from ${url} is too short, skipping...`);
          continue;
        }

        console.log(`Decoded stops.txt from ${url}. First 100 chars: ${text.substring(0, 100)}`);
        
        cachedStopsTxt = text;
        stopsTxtCacheTime = now;
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(text);
      } catch (error: any) {
        console.error(`Error fetching stops from ${url}:`, error.message);
        lastError = error;
      }
    }

    if (cachedStopsTxt) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(cachedStopsTxt);
    }

    res.status(500).json({ error: "Failed to fetch stops from all sources", details: lastError?.message });
  });

  let cachedRoutesTxt: string | null = null;
  let routesTxtCacheTime = 0;

  let cachedParsedRoutes: any = null;
  let parsedRoutesCacheTime = 0;

  app.get("/api/transport/parsed-routes", async (req, res) => {
    const now = Date.now();
    if (cachedParsedRoutes && (now - parsedRoutesCacheTime < 24 * 60 * 60 * 1000)) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.json(cachedParsedRoutes);
    }

    console.log("Fetching and parsing routes from Tallinn API...");
    const url = `https://transport.tallinn.ee/data/routes.txt?t=${Date.now()}`;
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const buffer = Buffer.from(response.data);
      let text = '';
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch (e) {
        try {
          text = new TextDecoder('windows-1257').decode(buffer);
        } catch (e2) {
          text = new TextDecoder('iso-8859-1').decode(buffer);
        }
      }

      const lines = text.split(/\r?\n/);
      
      const routesMap: Record<string, string> = {};
      const routeStopsMap: Record<string, { name: string, stops: string[] }[]> = {};
      const usedStopsSet = new Set<string>();
      const stopModesMap: Record<string, Set<string>> = {};

      if (lines.length > 0) {
        let delim = ';';
        if (lines[0].includes(';')) delim = ';';
        else if (lines[0].includes(',')) delim = ',';
        else if (lines[0].includes('\t')) delim = '\t';
        
        const header = lines[0].split(delim).map(h => h.trim().toUpperCase());
        const fld: Record<string, number> = {};
        for (let i = 0; i < header.length; i++) {
          fld[header[i]] = i;
        }
        
        let currentRouteNum = '';
        let currentTransport = '';
        let currentRouteName = '';
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line || line.trim().length === 0 || line.startsWith('#')) continue;
          
          const parts = line.split(delim);
          
          const rawRouteNum = parts[fld['ROUTENUM']];
          const rawTransport = parts[fld['TRANSPORT']];
          const rawRouteName = parts[fld['ROUTENAME']];
          const rawRouteStops = parts[fld['ROUTESTOPS']];
          
          const routeNum = rawRouteNum ? rawRouteNum.trim().replace(/"/g, '') : undefined;
          const transport = rawTransport ? rawTransport.trim().replace(/"/g, '') : undefined;
          const routeName = rawRouteName ? rawRouteName.trim().replace(/"/g, '') : undefined;
          const routeStops = rawRouteStops ? rawRouteStops.trim().replace(/"/g, '') : undefined;
          
          if (routeNum && routeNum !== '-') {
            currentRouteNum = routeNum;
          }
          if (transport && transport !== '-') {
            currentTransport = transport;
          }
          if (routeName && routeName !== '-') {
            currentRouteName = routeName;
          }
          
          if (currentRouteNum && currentRouteName) {
            routesMap[currentRouteNum] = currentRouteName;
            const normNum = currentRouteNum.replace(/^0+/, '');
            if (normNum && normNum !== currentRouteNum) routesMap[normNum] = currentRouteName;
          }
          
          if (routeStops) {
            const stops = routeStops.split(',').filter(Boolean);
            for (const stop of stops) {
              const normStop = stop.replace(/^0+/, '');
              usedStopsSet.add(stop);
              usedStopsSet.add(normStop);
              
              if (currentTransport) {
                let mode = currentTransport.toLowerCase();
                if (mode === 'nightbus') mode = 'bus';
                
                if (!stopModesMap[stop]) stopModesMap[stop] = new Set();
                if (!stopModesMap[normStop]) stopModesMap[normStop] = new Set();
                
                stopModesMap[stop].add(mode);
                stopModesMap[normStop].add(mode);
              }
            }
            if (currentRouteNum && currentRouteName) {
              if (!routeStopsMap[currentRouteNum]) {
                routeStopsMap[currentRouteNum] = [];
              }
              routeStopsMap[currentRouteNum].push({ name: currentRouteName, stops });
              
              const normNum = currentRouteNum.replace(/^0+/, '');
              if (normNum && normNum !== currentRouteNum) {
                if (!routeStopsMap[normNum]) {
                  routeStopsMap[normNum] = [];
                }
                routeStopsMap[normNum].push({ name: currentRouteName, stops });
              }
            }
          }
        }
      }

      // Convert Sets to Arrays for JSON serialization
      const stopModesMapArray: Record<string, string[]> = {};
      for (const [key, set] of Object.entries(stopModesMap)) {
        stopModesMapArray[key] = Array.from(set);
      }

      cachedParsedRoutes = {
        routesMap,
        routeStopsMap,
        usedStopsArray: Array.from(usedStopsSet),
        stopModesMap: stopModesMapArray
      };
      parsedRoutesCacheTime = now;
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.json(cachedParsedRoutes);
    } catch (error: any) {
      console.error(`Error fetching/parsing routes:`, error.message);
      if (cachedParsedRoutes) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.json(cachedParsedRoutes);
      }
      res.status(500).json({ error: "Failed to fetch/parse routes", details: error.message });
    }
  });

  app.get("/api/transport/routes", async (req, res) => {
    const now = Date.now();
    if (cachedRoutesTxt && (now - routesTxtCacheTime < 24 * 60 * 60 * 1000)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(cachedRoutesTxt);
    }

    console.log("Fetching routes from Tallinn API...");
    const url = `https://transport.tallinn.ee/data/routes.txt?t=${Date.now()}`;
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const buffer = Buffer.from(response.data);
      let text = '';
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch (e) {
        try {
          text = new TextDecoder('windows-1257').decode(buffer);
        } catch (e2) {
          text = new TextDecoder('iso-8859-1').decode(buffer);
        }
      }
      
      cachedRoutesTxt = text;
      routesTxtCacheTime = now;
      
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(text);
    } catch (error: any) {
      console.error(`Error fetching routes from ${url}:`, error.message);
      if (cachedRoutesTxt) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(cachedRoutesTxt);
      }
      res.status(500).json({ error: "Failed to fetch routes", details: error.message });
    }
  });

  app.get("/api/transport/departures", async (req, res) => {
    const { stopId, siriId, time } = req.query;
    if (!stopId) return res.status(400).json({ error: "stopId is required" });
    
    const cleanStopId = String(stopId).trim();
    const cleanSiriId = siriId ? String(siriId).trim() : cleanStopId;
    
    try {
      // Try Siri API first with siriId
      // First attempt: without time parameter (real-time)
      let siriUrl = `https://transport.tallinn.ee/siri-stop-departures.php?stopid=${cleanSiriId}`;
      
      console.log(`Proxying departures request to Siri API (Attempt 1): ${siriUrl}`);
      const siriResponse = await axios.get(siriUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Referer': 'https://transport.tallinn.ee/'
        },
        responseType: 'text',
        timeout: 8000
      });
      
      console.log(`Siri API response for ${cleanSiriId}: status ${siriResponse.status}, length ${siriResponse.data.length}`);
      if (siriResponse.data) {
        console.log(`Siri API data preview: ${siriResponse.data.substring(0, 200).replace(/\n/g, '\\n')}`);
      }
      
      // If Siri API returns data, use it
      const siriLines = siriResponse.data ? siriResponse.data.split('\n').filter((l: string) => l.trim().length > 0) : [];
      const isSiriEmpty = siriLines.length <= 1;
      
      if (!isSiriEmpty) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(siriResponse.data);
      }

      // Second attempt: with current timestamp as cache buster
      const timestamp = Math.floor(Date.now() / 1000);
      let siriUrlWithTime = `${siriUrl}&time=${timestamp}`;
      console.log(`Siri empty, trying with timestamp: ${siriUrlWithTime}`);
      const siriResponseWithTime = await axios.get(siriUrlWithTime, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Referer': 'https://transport.tallinn.ee/'
        },
        responseType: 'text',
        timeout: 8000
      });
      
      if (siriResponseWithTime.data && siriResponseWithTime.data.split('\n').length > 1) {
        console.log(`Siri API success with timestamp for ${cleanSiriId}`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(siriResponseWithTime.data);
      }

      // Third attempt: with time=0 (sometimes returns full schedule)
      let siriUrlTime0 = `${siriUrl}&time=0`;
      console.log(`Siri empty, trying with time=0: ${siriUrlTime0}`);
      const siriResponseTime0 = await axios.get(siriUrlTime0, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Referer': 'https://transport.tallinn.ee/'
        },
        responseType: 'text',
        timeout: 8000
      });
      
      if (siriResponseTime0.data && siriResponseTime0.data.split('\n').length > 1) {
        console.log(`Siri API success with time=0 for ${cleanSiriId}`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(siriResponseTime0.data);
      }

      // Fourth attempt: with start of day timestamp
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startOfDayTs = Math.floor(startOfDay.getTime() / 1000);
      let siriUrlStartOfDay = `${siriUrl}&time=${startOfDayTs}`;
      console.log(`Siri empty, trying with start of day: ${siriUrlStartOfDay}`);
      const siriResponseStartOfDay = await axios.get(siriUrlStartOfDay, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Referer': 'https://transport.tallinn.ee/'
        },
        responseType: 'text',
        timeout: 8000
      });
      
      if (siriResponseStartOfDay.data && siriResponseStartOfDay.data.split('\n').length > 1) {
        console.log(`Siri API success with start of day for ${cleanSiriId}`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(siriResponseStartOfDay.data);
      }

      // Fifth attempt: try with 'a-' prefix (seen in some URLs)
      let siriUrlA = `https://transport.tallinn.ee/siri-stop-departures.php?stopid=a-${cleanStopId}`;
      console.log(`Siri empty, trying with a- prefix: ${siriUrlA}`);
      try {
        const siriResponseA = await axios.get(siriUrlA, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Referer': 'https://transport.tallinn.ee/'
          },
          responseType: 'text',
          timeout: 5000
        });
        if (siriResponseA.data && siriResponseA.data.split('\n').length > 1) {
          console.log(`Siri API success with a- prefix for ${cleanStopId}`);
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          return res.send(siriResponseA.data);
        }
      } catch (e) {
        console.log(`Siri with a- prefix also failed`);
      }

      // Try Ridango API as a fallback
      console.log(`Siri API returned empty for ${cleanSiriId}, trying Ridango fallback...`);
      
      // Ridango can use either the internal ID or the Siri ID
      const ridangoIds = [cleanSiriId, cleanStopId.split('-')[0]];
      for (const ridId of ridangoIds) {
        const ridangoUrl = `https://api.ridango.com/v2/6/stop-departures?stop_id=${ridId}`;
        try {
          console.log(`Attempting Ridango with ID: ${ridId}`);
          const ridangoRes = await axios.get(ridangoUrl, { timeout: 5000 });
          if (ridangoRes.data && ridangoRes.data.departures && ridangoRes.data.departures.length > 0) {
            console.log(`Ridango fallback successful for ${ridId}, found ${ridangoRes.data.departures.length} departures`);
            const serverTimeUnix = Math.floor(Date.now() / 1000);
            let siriText = `1,${ridId},0,0,${serverTimeUnix},0\n\n`;
            ridangoRes.data.departures.forEach((d: any) => {
              const type = d.vehicle_type === 'tram' ? 'tram' : (d.vehicle_type === 'trolley' ? 'trolley' : 'bus');
              const depTime = new Date(d.expected_time || d.scheduled_time);
              const expectedTimeUnix = Math.floor(depTime.getTime() / 1000);
              const schedTime = new Date(d.scheduled_time || d.expected_time);
              const scheduledTimeUnix = Math.floor(schedTime.getTime() / 1000);
              
              // Clean up route code (sometimes it's like "6.486")
              let line = d.route_code || '';
              if (line.includes('.')) {
                line = line.split('.')[0];
              }
              
              // Format: type, line, expectedTime, scheduledTime, destination
              siriText += `${type},${line},${expectedTimeUnix},${scheduledTimeUnix},${d.destination || ''}\n`;
            });
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send(siriText);
          }
        } catch (ridangoErr: any) {
          console.error(`Ridango fallback failed for ${ridId}:`, ridangoErr.message);
        }
      }
      
      // Try iil.pilet.ee API as another fallback
      console.log(`Ridango fallback failed or empty, trying iil.pilet.ee fallback...`);
      for (const ridId of ridangoIds) {
        const piletUrl = `https://iil.pilet.ee/api/v1/stops/${ridId}/departures`;
        try {
          console.log(`Attempting iil.pilet.ee with ID: ${ridId}`);
          const piletRes = await axios.get(piletUrl, { timeout: 5000 });
          if (piletRes.data && piletRes.data.departures && piletRes.data.departures.length > 0) {
            console.log(`iil.pilet.ee fallback successful for ${ridId}, found ${piletRes.data.departures.length} departures`);
            const serverTimeUnix = Math.floor(Date.now() / 1000);
            let siriText = `1,${ridId},0,0,${serverTimeUnix},0\n\n`;
            piletRes.data.departures.forEach((d: any) => {
              const type = d.vehicle_type === 'tram' ? 'tram' : (d.vehicle_type === 'trolley' ? 'trolley' : 'bus');
              const depTime = new Date(d.expected_time || d.scheduled_time);
              const expectedTimeUnix = Math.floor(depTime.getTime() / 1000);
              const schedTime = new Date(d.scheduled_time || d.expected_time);
              const scheduledTimeUnix = Math.floor(schedTime.getTime() / 1000);
              
              // Clean up route code
              let line = d.route_code || '';
              if (line.includes('.')) {
                line = line.split('.')[0];
              }
              
              // Format: type, line, expectedTime, scheduledTime, destination
              siriText += `${type},${line},${expectedTimeUnix},${scheduledTimeUnix},${d.destination || ''}\n`;
            });
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send(siriText);
          }
        } catch (piletErr: any) {
          console.error(`iil.pilet.ee fallback failed for ${ridId}:`, piletErr.message);
        }
      }

      // If everything failed, return whatever Siri gave us (likely empty)
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(siriResponse.data);
    } catch (error: any) {
      console.error(`Error fetching departures for stop ${cleanStopId}:`, error.message);
      res.status(500).json({ error: "Failed to fetch departures", details: error.message });
    }
  });

  app.get("/api/transport/gps", async (req, res) => {
    try {
      const response = await axios.get("https://transport.tallinn.ee/gps.txt", {
        responseType: 'text',
        timeout: 5000
      });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(response.data);
    } catch (error: any) {
      console.error("Error fetching gps.txt:", error.message);
      res.status(500).json({ error: "Failed to fetch gps data" });
    }
  });

  app.get("/api/transport/vehicles", async (req, res) => {
    try {
      const response = await axios.get("https://gis.ee/tallinn/gps.php", {
        responseType: 'json',
        timeout: 5000
      });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.json(response.data);
    } catch (error: any) {
      console.error("Error fetching vehicles from gis.ee:", error.message);
      res.status(500).json({ error: "Failed to fetch vehicles data" });
    }
  });

  let cachedPeatusStops: any = null;
  let peatusStopsCacheTime = 0;

  app.get("/api/transport/peatus/stops", async (req, res) => {
    const now = Date.now();
    // Cache for 24 hours
    if (cachedPeatusStops && (now - peatusStopsCacheTime < 24 * 60 * 60 * 1000)) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.json(cachedPeatusStops);
    }

    try {
      const query = '{ stops { gtfsId name lat lon code desc zoneId parentStation { name } routes { mode } } }';
      const response = await axios.post("https://api.peatus.ee/routing/v1/routers/estonia/index/graphql", { query }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      });
      
      cachedPeatusStops = response.data;
      peatusStopsCacheTime = now;
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.json(cachedPeatusStops);
    } catch (error: any) {
      console.error("Error fetching from Peatus GraphQL:", error.message);
      if (cachedPeatusStops) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.json(cachedPeatusStops);
      }
      res.status(500).json({ error: "Failed to fetch from Peatus GraphQL" });
    }
  });

  app.post("/api/transport/peatus/graphql", async (req, res) => {
    try {
      const response = await axios.post("https://api.peatus.ee/routing/v1/routers/estonia/index/graphql", req.body, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.json(response.data);
    } catch (error: any) {
      console.error("Error fetching from Peatus GraphQL:", error.message);
      res.status(500).json({ error: "Failed to fetch from Peatus GraphQL" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
