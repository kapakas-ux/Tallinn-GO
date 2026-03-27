import https from 'https';
https.get('https://transport.tallinn.ee/gps.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(data);
  });
});
