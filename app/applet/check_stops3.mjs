import https from 'https';
https.get('https://transport.tallinn.ee/data/stops.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    console.log('12303:', lines.filter(l => l.includes('12303')));
  });
});
