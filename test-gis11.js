fetch('https://gis.ee/tallinn/gps.php')
.then(res => res.json())
.then(data => console.log(data.features.find(f => f.properties.speed !== undefined)))
.catch(console.error);
