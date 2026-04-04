const https = require('https');
https.get('https://gis.ee/tallinn/gps.php', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { console.log(data.substring(0, 1000)); });
});
