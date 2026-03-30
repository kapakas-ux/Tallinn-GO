const https = require('https');

https.get('https://transport.tallinn.ee/data/routes.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('11801-1')) {
        console.log('---');
        console.log(lines[i-1]);
        console.log(lines[i]);
      }
    }
  });
});
