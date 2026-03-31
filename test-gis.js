fetch('https://gis.ee/tallinn/')
.then(res => res.text())
.then(text => console.log(text.substring(0, 1000)))
.catch(console.error);
