fetch('https://gis.ee/tallinn/gps.php')
.then(res => res.json())
.then(data => console.log(JSON.stringify(data.features[0], null, 2)))
.catch(console.error);
