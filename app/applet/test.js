import https from 'https';
import http from 'http';

https.get('https://transport.tallinn.ee/data/stops.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
    if (data.length > 500) {
      console.log("STOPS:", data.substring(0, 500));
      res.destroy();
    }
  });
});

http.get('http://transport.tallinn.ee/gps.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
    if (data.length > 500) {
      console.log("GPS:", data.substring(0, 500));
      res.destroy();
    }
  });
});
