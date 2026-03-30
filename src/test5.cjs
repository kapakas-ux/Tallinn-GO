const https = require('https');

async function test() {
  const data = await new Promise((resolve) => {
    https.get('https://transport.tallinn.ee/data/routes.txt', (res) => {
      let d = '';
      res.on('data', (chunk) => d += chunk);
      res.on('end', () => resolve(d));
    });
  });
  
  const lines = data.split('\n');
  const usedStops = new Set();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) continue;
    const parts = line.split(';');
    if (parts.length > 5) {
      const routeStops = parts[5];
      if (routeStops) {
        const stops = routeStops.split(',').filter(Boolean);
        for (const stop of stops) {
          usedStops.add(stop);
        }
      }
    }
  }
  
  const checkStops = ['11801-1', '11802-1', '11803-1', '11803-2', '11804-1', '11805-1', '11806-1'];
  for (const id of checkStops) {
    console.log(`${id}: in usedStopsSet=${usedStops.has(id)}`);
  }
}

test();
