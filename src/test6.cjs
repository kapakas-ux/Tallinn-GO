const https = require('https');

https.get('https://transport.tallinn.ee/data/routes.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    console.log(lines[0]);
    
    const checkStops = ['11801-1', '11802-1', '11803-1', '11803-2', '11804-1', '11805-1', '11806-1'];
    for (const line of lines) {
      for (const id of checkStops) {
        if (line.includes(id)) {
          console.log(`Found ${id} in route:`, line.split(';')[0], line.split(';')[1], line.split(';')[2]);
        }
      }
    }
  });
});
