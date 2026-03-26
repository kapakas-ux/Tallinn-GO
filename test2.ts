import { fetchRoutes, routeStopsMap } from './src/services/transportService';

async function run() {
  await fetchRoutes();
  console.log(Object.keys(routeStopsMap).length);
  console.log(routeStopsMap['1']);
}
run();
