fetch('https://gis.ee/tallinn/gps.php', { method: 'OPTIONS' })
.then(res => {
  console.log('CORS:', res.headers.get('access-control-allow-origin'));
})
.catch(console.error);
