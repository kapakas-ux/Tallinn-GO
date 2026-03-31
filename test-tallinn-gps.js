fetch('https://transport.tallinn.ee/gps.txt')
.then(res => res.text())
.then(text => console.log(text.substring(0, 500)))
.catch(console.error);
