const https = require('https');

const options = {
  hostname: 'peatus.ee',
  path: '/gtfs/stops.txt',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
};

https.get(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Location:', res.headers.location);
}).on('error', (e) => console.error(e));
