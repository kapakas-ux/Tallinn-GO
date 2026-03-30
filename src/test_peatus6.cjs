const https = require('https');

https.get('https://peatus.ee/reitti/gtfs/gtfs.zip', (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  let data = [];
  res.on('data', (chunk) => data.push(chunk));
  res.on('end', () => console.log('Data start:', Buffer.concat(data).toString('utf8').substring(0, 500)));
}).on('error', (e) => console.error(e));
