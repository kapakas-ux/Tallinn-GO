const https = require('https');

https.get('https://peatus.ee/reitti/gtfs/stops.txt', (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
    if (data.length > 1000) res.destroy(); // just get the start
  });
  res.on('close', () => console.log('Data start:', data.substring(0, 500)));
}).on('error', (e) => console.error(e));
