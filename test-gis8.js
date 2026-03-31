fetch('https://gis.ee/tallinn/gps.php')
.then(res => res.json())
.then(data => {
  const types = new Set(data.features.map(f => f.properties.type));
  console.log('Types:', Array.from(types));
  console.log('Total features:', data.features.length);
})
.catch(console.error);
