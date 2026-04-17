const query = `{ routes(name: "4") { gtfsId shortName patterns { directionId headsign stops { gtfsId name } trips { gtfsId } } } }`;
fetch('https://api.peatus.ee/routing/v1/routers/estonia/index/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query })
}).then(r => r.json()).then(d => {
  if (d.errors) { console.log('ERRORS:', d.errors.length); return; }
  const routes = d.data?.routes || [];
  console.log('Routes:', routes.length);
  for (const r of routes.slice(0, 2)) {
    console.log(`  Route: ${r.gtfsId} ${r.shortName}`);
    for (const p of (r.patterns || []).slice(0, 2)) {
      const trips = p.trips || [];
      console.log(`    Pattern: dir=${p.directionId} hs=${p.headsign} trips=${trips.length} first=${trips[0]?.gtfsId}`);
    }
  }
  // Now test fetching stoptimes for a single trip
  const firstTrip = routes[0]?.patterns?.[0]?.trips?.[0]?.gtfsId;
  if (firstTrip) {
    const q2 = `{ trip(id: "${firstTrip}") { stoptimes { stop { name } scheduledDeparture } } }`;
    return fetch('https://api.peatus.ee/routing/v1/routers/estonia/index/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q2 })
    }).then(r2 => r2.json()).then(d2 => {
      const st = d2.data?.trip?.stoptimes || [];
      console.log(`\nTrip ${firstTrip}: ${st.length} stoptimes`);
      st.slice(0, 5).forEach(s => {
        const h = Math.floor(s.scheduledDeparture / 3600);
        const m = Math.floor((s.scheduledDeparture % 3600) / 60);
        console.log(`  ${s.stop.name} -> ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
      });
    });
  }
}).catch(e => console.error(e));
