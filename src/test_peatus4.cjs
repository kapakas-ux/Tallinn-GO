const https = require('https');

https.get('https://peatus.ee/reitti/gtfs/gtfs.zip', (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  res.destroy();
}).on('error', (e) => console.error(e));
