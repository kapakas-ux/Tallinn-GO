import https from 'https';

https.get('https://transport.tallinn.ee/data/stops.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    const matches = lines.filter(l => l.includes('Zoo') || l.includes('Looga') || l.includes('822'));
    console.log(matches.join('\n'));
  });
});
