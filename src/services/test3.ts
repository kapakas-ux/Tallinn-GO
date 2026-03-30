import { fetchStops } from './transportService.ts';

async function test() {
  const stops = await fetchStops();
  const s1 = stops.find(s => s.id === '10710-1');
  const s2 = stops.find(s => s.id === '10709-1');
  const s3 = stops.find(s => s.id === '11801-1');
  const s4 = stops.find(s => s.id === '11802-1');
  const s5 = stops.find(s => s.id === '11803-1');
  const s6 = stops.find(s => s.id === '11803-2');
  console.log('10710-1:', s1);
  console.log('10709-1:', s2);
  console.log('11801-1:', s3);
  console.log('11802-1:', s4);
  console.log('11803-1:', s5);
  console.log('11803-2:', s6);
}

test();
