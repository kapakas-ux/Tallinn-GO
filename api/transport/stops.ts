import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const urls = ["https://transport.tallinn.ee/data/stops.txt"];
  let lastError: any = null;

  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        validateStatus: (status) => status === 200,
        maxRedirects: 5
      });

      const buffer = Buffer.from(response.data);
      if (buffer.length < 100) continue;

      let text = '';
      if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        text = new TextDecoder('utf-16le').decode(buffer);
      } else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
        text = new TextDecoder('utf-16be').decode(buffer);
      } else if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        text = new TextDecoder('utf-8').decode(buffer);
      } else {
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        } catch {
          try {
            text = new TextDecoder('windows-1257').decode(buffer);
          } catch {
            text = new TextDecoder('iso-8859-1').decode(buffer);
          }
        }
      }

      text = text.replace(/\0/g, '').replace(/^\uFEFF/, '').trim();
      if (text.length < 100) continue;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.send(text);
    } catch (error: any) {
      lastError = error;
    }
  }

  res.status(500).json({ error: "Failed to fetch stops from all sources", details: lastError?.message });
}
