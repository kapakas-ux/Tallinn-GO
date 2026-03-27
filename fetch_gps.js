const https = require('https');
https.get('https://transport.tallinn.ee/gps.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(data.split('\n').slice(0, 10).join('\n'));
  });
});
