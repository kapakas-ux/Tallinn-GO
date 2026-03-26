const axios = require('axios');
axios.get('https://transport.tallinn.ee/gps.txt').then(res => console.log(res.data.substring(0, 200))).catch(err => console.error(err.message));
