const https = require('https');

const options = {
  hostname: 'api.peatus.ee',
  path: '/realtime/vehicle-positions/v1/',
  method: 'GET',
  headers: {
    'digitransit-subscription-key': 'c7143fd8a1d841dd89a40bf8072ff73d'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, data.substring(0, 200)));
});

req.on('error', error => console.error(error));
req.end();
