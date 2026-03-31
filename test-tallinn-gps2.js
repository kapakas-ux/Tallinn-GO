fetch('https://transport.tallinn.ee/gps.txt')
.then(res => res.text())
.then(text => {
  const lines = text.split('\n');
  const types = new Set(lines.map(l => l.split(',')[0]));
  console.log('Types:', Array.from(types));
})
.catch(console.error);
