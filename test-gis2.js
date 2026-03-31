fetch('https://gis.ee/tallinn/')
.then(res => res.text())
.then(text => console.log(text.substring(1000, 2000)))
.catch(console.error);
