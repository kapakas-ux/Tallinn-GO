fetch('https://gis.ee/tallinn/gps.php')
.then(res => res.json())
.then(data => {
  const types = new Set(data.features.map(f => f.properties.type));
  console.log('Types:', Array.from(types));
  const lines = data.features.filter(f => f.properties.type === 10).map(f => f.properties.line);
  console.log('Train lines:', Array.from(new Set(lines)));
})
.catch(console.error);
