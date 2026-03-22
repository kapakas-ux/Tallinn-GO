const axios = require('axios');
axios.get('https://transport.tallinn.ee/data/stops.txt').then(res => {
  const lines = res.data.split('\n');
  const match = lines.find(l => l.includes('55182'));
  console.log('stops.txt match:', match);
});
axios.get('https://transport.tallinn.ee/data/routes.txt').then(res => {
  const lines = res.data.split('\n');
  const match = lines.find(l => l.includes('55182'));
  console.log('routes.txt match:', match);
});
