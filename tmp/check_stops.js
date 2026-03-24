const https = require('https');
https.get('https://transport.tallinn.ee/data/stops.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    console.log('Jaanika:', lines.filter(l => l.toLowerCase().includes('jaanika')));
    console.log('Paberi:', lines.filter(l => l.toLowerCase().includes('paberi')));
  });
});