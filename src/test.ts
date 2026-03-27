async function run() {
  const r = await fetch('https://transport.tallinn.ee/data/routes.txt');
  const t = await r.text();
  const lines = t.split('\n');
  const header = lines[0].split(';').map(h => h.toUpperCase());
  
  const fld: Record<string, number> = {};
  for (let i = 0; i < header.length; i++) {
    fld[header[i]] = i;
  }
  
  let currentRouteNum = '';
  const routeStopsMap: Record<string, any[]> = {};
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) continue;
    
    const parts = line.split(';').map(p => p.trim().replace(/"/g, ''));
    
    if (parts.length < 5) continue;
    
    const routeNum = parts[fld['ROUTENUM']];
    if (routeNum && routeNum !== '-') {
      currentRouteNum = routeNum;
    }
    
    const routeName = parts[fld['ROUTENAME']];
    const routeStops = parts[fld['ROUTESTOPS']];
    
    if (currentRouteNum === '42' && routeStops) {
      console.log('Found routeStops for 42:', routeName, routeStops.substring(0, 20));
    }
  }
}
run();
