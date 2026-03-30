const https = require('https');

https.get('https://transport.tallinn.ee/data/stops.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    for (const line of lines) {
      if (line.includes('10710-') || line.includes('Poska') || line.includes('Reidi')) {
        console.log(line);
      }
    }
  });
});
