fetch('https://gis.ee/tallinn/assets/index-BV79ESRt.js')
.then(res => res.text())
.then(text => {
  const urls = text.match(/https?:\/\/[^\s"']+/g) || [];
  console.log(urls.filter(u => !u.includes('w3.org') && !u.includes('mapbox')));
})
.catch(console.error);
