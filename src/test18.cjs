const https = require('https');

https.get('https://transport.tallinn.ee/data/stops.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    console.log(lines[0]);
    console.log(lines[1]);
  });
});
