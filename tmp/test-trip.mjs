// First find a valid stop and its departures
const stopsQ = `{ stops { gtfsId name } }`;
const stopsRes = await fetch('https://api.peatus.ee/routing/v1/routers/estonia/index/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: stopsQ }),
});
const stopsData = await stopsRes.json();
// Find Mere puiestee
const mereStop = stopsData.data.stops.find(s => s.name.includes('Mere pui'));
console.log('Found stop:', mereStop?.gtfsId, mereStop?.name);

const query = `{
  stop(id: "${mereStop.gtfsId}") {
    stoptimesWithoutPatterns(numberOfDepartures: 1) {
      scheduledDeparture
      serviceDay
      trip {
        gtfsId
        route { shortName }
        stoptimes {
          stop { gtfsId name }
          scheduledArrival
          scheduledDeparture
        }
      }
    }
  }
}`;

const res = await fetch('https://api.peatus.ee/routing/v1/routers/estonia/index/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const data = await res.json();
if (data.errors) {
  console.log('ERRORS:', JSON.stringify(data.errors, null, 2));
} else {
  console.log('RAW:', JSON.stringify(data.data, null, 2).slice(0, 500));
  const stop = data.data.stop;
  if (!stop) { console.log('Stop not found'); process.exit(1); }
  const st = stop.stoptimesWithoutPatterns[0];
  console.log('Trip:', st.trip.gtfsId, 'Route:', st.trip.route.shortName);
  console.log('ServiceDay:', st.serviceDay, 'SchedDep:', st.scheduledDeparture);
  console.log('Stoptimes count:', st.trip.stoptimes.length);
  console.log('First 5 stoptimes:');
  st.trip.stoptimes.slice(0, 5).forEach((s, i) => {
    const arrMin = Math.floor(s.scheduledArrival / 60);
    const arrH = Math.floor(arrMin / 60);
    const arrM = arrMin % 60;
    console.log(`  ${i}: ${s.stop.name} (${s.stop.gtfsId}) - arr ${arrH}:${String(arrM).padStart(2,'0')}, dep ${Math.floor(s.scheduledDeparture/60/60)}:${String(Math.floor(s.scheduledDeparture/60)%60).padStart(2,'0')}`);
  });
}
