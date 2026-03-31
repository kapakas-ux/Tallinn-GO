fetch('https://gis.ee/tallinn/assets/index-BV79ESRt.js')
.then(res => res.text())
.then(text => {
  const idx = text.indexOf('gps.php');
  console.log(text.substring(Math.max(0, idx - 500), idx + 500));
})
.catch(console.error);
