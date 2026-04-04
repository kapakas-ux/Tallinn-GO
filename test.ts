import fetch from 'node-fetch';

async function test() {
  try {
    const res = await fetch('https://peatus.ee/api/v1/graphql', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost',
        'Access-Control-Request-Method': 'POST'
      }
    });
    console.log('Status:', res.status);
    console.log('CORS:', res.headers.get('access-control-allow-origin'));
  } catch (e) {
    console.error(e);
  }
}
test();
