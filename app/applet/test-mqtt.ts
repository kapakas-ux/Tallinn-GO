import mqtt from 'mqtt';

const client = mqtt.connect('wss://mqtt.digitransit.fi:443', {
  clientId: 'test-client-' + Math.random().toString(16).substr(2, 8)
});

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  client.subscribe('/gtfsrt/vp/finland/#', (err) => {
    if (err) {
      console.error('Subscription error:', err);
    } else {
      console.log('Subscribed to /gtfsrt/vp/finland/#');
    }
  });
});

let count = 0;
client.on('message', (topic, message) => {
  console.log('Received message on topic:', topic);
  // message is a Buffer, we can try to parse it or just log the topic
  count++;
  if (count >= 5) {
    client.end();
  }
});

client.on('error', (err) => {
  console.error('MQTT error:', err);
});
