// Quick exploration of wss://api.ridango.com/rt-ws/vehicle-status
import WebSocket from 'ws';

const ws = new WebSocket('wss://api.ridango.com/rt-ws/vehicle-status');

ws.on('open', () => {
  console.log('Connected! Sending subscription...');
  ws.send(JSON.stringify({
    regionId: 32,
    topLeftCoordinates: { longitude: 0, latitude: 180 },
    bottomRightCoordinates: { longitude: 180, latitude: -180 }
  }));
});

ws.on('message', (data) => {
  const text = data.toString();
  console.log(`\n=== Message (${text.length} bytes) ===`);
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      console.log(`Array of ${parsed.length} items`);
      // Show first 3 items in detail
      parsed.slice(0, 3).forEach((item, i) => {
        console.log(`\n--- Item ${i} ---`);
        console.log(JSON.stringify(item, null, 2));
      });
      // Show unique keys across all items
      const allKeys = new Set();
      parsed.forEach(item => Object.keys(item).forEach(k => allKeys.add(k)));
      console.log('\nAll keys:', [...allKeys].join(', '));
      
      // Show unique trip.icon values
      const icons = new Set(parsed.map(v => v.trip?.icon).filter(Boolean));
      console.log('Vehicle types:', [...icons].join(', '));
      
      // Show unique routeShortName values
      const lines = new Set(parsed.map(v => v.trip?.routeShortName).filter(Boolean));
      console.log(`Lines (${lines.size}):`, [...lines].sort().join(', '));
    } else {
      console.log(JSON.stringify(parsed, null, 2));
    }
  } catch {
    console.log(text.substring(0, 500));
  }
  
  // Close after first message
  if (text.includes('connectionEstablished')) {
    console.log('Waiting for vehicle data...');
    return;
  }
  ws.close();
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('Error:', err.message);
});

// Timeout after 15s
setTimeout(() => { console.log('Timeout'); process.exit(1); }, 15000);
