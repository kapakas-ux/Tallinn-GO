const query = `
{
  stops(name: "Tallinn") {
    name
    gtfsId
    lat
    lon
  }
}
`;

fetch('https://api.digitransit.fi/routing/v2/finland/gtfs/v1', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'digitransit-subscription-key': 'c7143fd8a1d841dd89a40bf8072ff73d'
  },
  body: JSON.stringify({ query })
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err));
