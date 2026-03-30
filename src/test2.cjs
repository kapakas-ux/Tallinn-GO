const https = require('https');

https.get('https://transport.tallinn.ee/data/stops.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    for (const line of lines) {
      const parts = line.split(';');
      if (parts.length > 3) {
        const lat = parseInt(parts[2]) / 100000;
        const lng = parseInt(parts[3]) / 100000;
        if (lat > 59.438 && lat < 59.445 && lng > 24.775 && lng < 24.790) {
          console.log(line);
        }
      }
    }
  });
});
