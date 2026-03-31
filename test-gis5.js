fetch('https://gis.ee/tallinn/gps.php')
.then(res => res.text())
.then(text => console.log(text.substring(0, 500)))
.catch(console.error);
