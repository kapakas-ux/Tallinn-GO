async function test() {
  const res = await fetch('https://api.digitransit.fi/realtime/vehicle-positions/v1/siri/vm/', {
    headers: {
      'digitransit-subscription-key': 'c7143fd8a1d841dd89a40bf8072ff73d'
    }
  });
  
  const text = await res.text();
  console.log("siri vm:", text.substring(0, 500));
}

test();
