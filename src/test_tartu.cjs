const https = require('https');
https.get('https://tartu.ee/et/avatud-andmed', (res) => {
  console.log('statusCode:', res.statusCode);
  console.log('headers:', res.headers);
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log(data.substring(0, 1000)));
}).on('error', (e) => {
  console.error(e);
});
