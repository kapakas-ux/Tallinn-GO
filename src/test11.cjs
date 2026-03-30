const https = require('https');

https.get('https://transport.tallinn.ee/data/routes.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    
    for (const line of lines) {
      if (line.includes('11801-1')) {
        console.log(line);
      }
    }
  });
});
