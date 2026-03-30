import { fetchStops, usedStopsSet, fetchRoutes } from './transportService.ts';

async function test() {
  await fetchRoutes();
  const stops = await fetchStops();
  
  const checkStops = ['11801-1', '11802-1', '11803-1', '11803-2', '11804-1', '11805-1', '11806-1'];
  for (const id of checkStops) {
    console.log(`${id}: in usedStopsSet=${usedStopsSet.has(id)}, in stops array=${stops.some(s => s.id === id)}`);
  }
}

test();
