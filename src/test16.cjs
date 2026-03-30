async function test() {
  const routesData = await new Promise((resolve) => {
    require('https').get('https://transport.tallinn.ee/data/routes.txt', (res) => {
      let d = '';
      res.on('data', (chunk) => d += chunk);
      res.on('end', () => resolve(d));
    });
  });
  
  const lines = routesData.split('\n');
  let delim = ';';
  const header = lines[0].split(delim).map(h => h.trim().toUpperCase());
  const fld = {};
  for (let i = 0; i < header.length; i++) fld[header[i]] = i;
  
  console.log(fld);
}
test();
