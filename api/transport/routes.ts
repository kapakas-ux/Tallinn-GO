import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = `https://transport.tallinn.ee/data/routes.txt?t=${Date.now()}`;
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,et;q=0.8',
        'Referer': 'https://transport.tallinn.ee/',
      }
    });
    const buffer = Buffer.from(response.data);
    let text = '';
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      try {
        text = new TextDecoder('windows-1257').decode(buffer);
      } catch {
        text = new TextDecoder('iso-8859-1').decode(buffer);
      }
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(text);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch routes", details: error.message });
  }
}
