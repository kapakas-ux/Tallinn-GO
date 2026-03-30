async function test() {
  const routesData = await new Promise((resolve) => {
    require('https').get('https://transport.tallinn.ee/data/routes.txt', (res) => {
      let d = '';
      res.on('data', (chunk) => d += chunk);
      res.on('end', () => resolve(d));
    });
  });
  
  const stopsData = await new Promise((resolve) => {
    require('https').get('https://transport.tallinn.ee/data/stops.txt', (res) => {
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

  const stopsLines = stopsData.split('\n');
  const sHeader = stopsLines[0].split(';').map(h => h.replace(/^\uFEFF/, '').trim().toUpperCase());
  const sFld = {};
  for (let i = 0; i < sHeader.length; i++) sFld[sHeader[i]] = i;

  const rawStops = [];
  const internalMap = {};
  const siriMap = {};

  const idCol = sFld['STOPID'] !== undefined ? sFld['STOPID'] : sFld['ID'];
  const siriCol = sFld['STOPCODE'] !== undefined ? sFld['STOPCODE'] : sFld['SIRIID'];
  const nameCol = sFld['STOPNAME'] !== undefined ? sFld['STOPNAME'] : sFld['NAME'];
  const latCol = sFld['STOPLAT'] !== undefined ? sFld['STOPLAT'] : sFld['LAT'];
  const lngCol = sFld['STOPLON'] !== undefined ? sFld['STOPLON'] : sFld['LNG'];

  for (let i = 1; i < stopsLines.length; i++) {
    const line = stopsLines[i];
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(';').map(p => p.trim().replace(/"/g, ''));
    
    const internalId = parts[idCol];
    const siriId = parts[siriCol];
    const name = parts[nameCol];
    const latStr = parts[latCol];
    const lngStr = parts[lngCol];
    
    if (!internalId || !latStr || !lngStr) continue;
    
    const lat = parseInt(latStr, 10) / 100000;
    const lng = parseInt(lngStr, 10) / 100000;
    
    let highQualityName = name;
    if (highQualityName && (/^[\d\s,\-:]+$/.test(highQualityName) || (highQualityName.includes('-') && !/[a-zA-ZäöüõÄÖÜÕ]/.test(highQualityName)))) {
      highQualityName = null;
    }
    
    if (highQualityName) {
      const normId = internalId.replace(/^0+/, '');
      const baseId = internalId.split('-')[0];
      internalMap[internalId] = highQualityName;
      internalMap[normId] = highQualityName;
      internalMap[baseId] = highQualityName;
      if (siriId && siriId !== '0') siriMap[siriId] = highQualityName;
    }
    
    rawStops.push({ internalId, siriId, lat, lng, initialName: highQualityName });
  }

  const finalStops = [];
  for (const raw of rawStops) {
    if (usedStopsSet.size > 0 && !usedStopsSet.has(raw.internalId)) {
      const forceInclude = ['10709-1'].includes(raw.internalId);
      if (!forceInclude) continue;
    }
    
    let finalName = raw.initialName;
    if (raw.internalId === '10710-1' || raw.internalId === '10709-1') {
      finalName = 'Pikksilma';
    } else {
      const isBadName = (n) => !n || /^[\d\s,\-:]+$/.test(n) || (n.includes('-') && !/[a-zA-ZäöüõÄÖÜÕ]/.test(n));
      if (isBadName(finalName)) {
        const id = raw.internalId;
        const normId = id.replace(/^0+/, '');
        const baseId = id.split('-')[0];
        const siriId = raw.siriId;
        
        finalName = internalMap[id] || internalMap[normId] || internalMap[baseId] || 
                    (siriId ? (siriMap[siriId] || siriMap[siriId.replace(/^0+/, '')]) : null);
        
        if (isBadName(finalName)) {
          let nearestDist = 0.0025;
          let nearestName = null;
          const rawBaseId = raw.internalId.split('-')[0];
          const rawPrefix = rawBaseId.length >= 4 ? rawBaseId.substring(0, rawBaseId.length - 1) : null;

          for (const other of rawStops) {
            if (other === raw || isBadName(other.initialName)) continue;
            const dLat = Math.abs(other.lat - raw.lat);
            const dLng = Math.abs(other.lng - raw.lng) * 0.5;
            let dist = Math.sqrt(dLat * dLat + dLng * dLng);
            
            const otherBaseId = other.internalId.split('-')[0];
            const otherPrefix = otherBaseId.length >= 4 ? otherBaseId.substring(0, otherBaseId.length - 1) : null;
            if (rawPrefix && otherPrefix && rawPrefix === otherPrefix) dist = dist * 0.8;
            
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestName = other.initialName;
            }
          }
          if (nearestName) finalName = nearestName;
        }
        if (isBadName(finalName)) finalName = raw.internalId;
      }
    }
    
    finalStops.push({
      id: raw.internalId,
      name: finalName || raw.internalId,
      lat: raw.lat,
      lng: raw.lng
    });
  }

  const checkStops = ['11801-1', '11802-1', '11803-1', '11803-2', '11804-1', '11805-1', '11806-1'];
  for (const id of checkStops) {
    const s = finalStops.find(s => s.id === id);
    console.log(`${id}:`, s ? `${s.name} (${s.lat}, ${s.lng})` : 'NOT FOUND');
  }
}

test();
