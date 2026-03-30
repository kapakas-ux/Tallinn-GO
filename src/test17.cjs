async function test() {
  const routesData = await new Promise((resolve) => {
    require('https').get('https://transport.tallinn.ee/data/routes.txt', (res) => {
      let d = '';
      res.on('data', (chunk) => d += chunk);
      res.on('end', () => resolve(d));
    });
  });
  
  const usedStopsSet = new Set();
  const lines = routesData.split('\n');
  let delim = ';';
  const header = lines[0].split(delim).map(h => h.trim().toUpperCase());
  const fld = {};
  for (let i = 0; i < header.length; i++) fld[header[i]] = i;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) continue;
    const parts = line.split(delim).map(p => p.trim().replace(/"/g, ''));
    const routeStops = parts[fld['ROUTESTOPS']];
    if (routeStops) {
      const stops = routeStops.split(',').filter(Boolean);
      for (const stop of stops) usedStopsSet.add(stop);
    }
  }

  console.log('usedStopsSet size:', usedStopsSet.size);
  const checkStops = ['11801-1', '11802-1', '11803-1', '11803-2', '11804-1', '11805-1', '11806-1'];
  for (const id of checkStops) {
    console.log(`${id}:`, usedStopsSet.has(id));
  }
}

test();
