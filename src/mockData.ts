import { Arrival, RouteOption, Stop } from './types';

// Mock data for initial UI development based on Tallinn context
export const MOCK_STOPS: Stop[] = [
  { id: '14201-1', name: 'Vabaduse väljak', lat: 59.4336, lng: 24.7447 },
  { id: '10301-1', name: 'Solaris Keskus', lat: 59.4345, lng: 24.7512 },
  { id: '10501-1', name: 'Viru', lat: 59.4368, lng: 24.7541 },
  { id: '10701-1', name: 'Mere puiestee', lat: 59.4392, lng: 24.7525 },
  { id: '10901-1', name: 'Estonia puiestee', lat: 59.4348, lng: 24.7505 },
  { id: '11101-1', name: 'Hobujaama', lat: 59.4375, lng: 24.7585 },
  { id: '11301-1', name: 'Balti jaam', lat: 59.4412, lng: 24.7375 },
  { id: '11501-1', name: 'Lennujaam', lat: 59.4160, lng: 24.8010 },
  { id: '11701-1', name: 'Telliskivi', lat: 59.4405, lng: 24.7295 },
  { id: '11901-1', name: 'Põhja puiestee', lat: 59.4445, lng: 24.7505 },
  { id: '12101-1', name: 'Linnahall', lat: 59.4465, lng: 24.7535 },
  { id: '12301-1', name: 'Reisisadam D-terminal', lat: 59.4435, lng: 24.7685 },
  { id: '12501-1', name: 'Uus-Sadama', lat: 59.4415, lng: 24.7725 },
  { id: '12701-1', name: 'Kadriorg', lat: 59.4385, lng: 24.7855 },
  { id: '12901-1', name: 'Kumu', lat: 59.4365, lng: 24.7955 },
  { id: '13101-1', name: 'Pae', lat: 59.4325, lng: 24.8155 },
  { id: '13301-1', name: 'Majaka', lat: 59.4285, lng: 24.7925 },
  { id: '13501-1', name: 'Sikupilli', lat: 59.4265, lng: 24.7885 },
  { id: '13701-1', name: 'Ülemiste jaam', lat: 59.4245, lng: 24.7985 },
  { id: '13901-1', name: 'Tondi', lat: 59.4115, lng: 24.7355 },
  { id: '14101-1', name: 'Kalev', lat: 59.4085, lng: 24.7455 },
  { id: '14301-1', name: 'Hallivanamehe', lat: 59.4055, lng: 24.7385 },
  { id: '14501-1', name: 'Järve', lat: 59.4015, lng: 24.7285 },
  { id: '14701-1', name: 'Viru keskus', lat: 59.4372, lng: 24.7555 },
  { id: '14901-1', name: 'A. Laikmaa', lat: 59.4362, lng: 24.7565 },
  { id: '15101-1', name: 'Hotell Olümpia', lat: 59.4312, lng: 24.7565 },
  { id: '15301-1', name: 'Püssirohu', lat: 59.4282, lng: 24.7625 },
  { id: '15501-1', name: 'Keskturg', lat: 59.4302, lng: 24.7685 },
  { id: '15701-1', name: 'Autobussijaam', lat: 59.4272, lng: 24.7745 },
  { id: '15901-1', name: 'Sossimägi', lat: 59.4252, lng: 24.7855 },
  { id: '16101-1', name: 'Lubja', lat: 59.4282, lng: 24.7825 },
  { id: '16301-1', name: 'Laulupeo', lat: 59.4322, lng: 24.7785 },
  { id: '16501-1', name: 'Gonsiori', lat: 59.4342, lng: 24.7685 },
  { id: '16701-1', name: 'Maneeži', lat: 59.4362, lng: 24.7625 },
  { id: '16901-1', name: 'Kosmos', lat: 59.4282, lng: 24.7445 },
  { id: '17101-1', name: 'Vabaduse väljak 2', lat: 59.4326, lng: 24.7437 },
  { id: '17301-1', name: 'Tõnismägi', lat: 59.4306, lng: 24.7417 },
  { id: '17501-1', name: 'Koidu', lat: 59.4286, lng: 24.7317 },
  { id: '17701-1', name: 'Virmalise', lat: 59.4246, lng: 24.7357 },
  { id: '17901-1', name: 'Vineeri', lat: 59.4226, lng: 24.7397 },
  { id: '18101-1', name: 'Tallinn-Väike', lat: 59.4186, lng: 24.7437 },
  { id: '18301-1', name: 'Magdaleena', lat: 59.4156, lng: 24.7387 },
  { id: '18501-1', name: 'Risti', lat: 59.3956, lng: 24.7187 },
  { id: '18701-1', name: 'Väike-Järve', lat: 59.3986, lng: 24.7237 },
  { id: '18901-1', name: 'Liiva jaam', lat: 59.3886, lng: 24.7237 },
  { id: '19101-1', name: 'Vana-Pääsküla', lat: 59.3586, lng: 24.6337 },
  { id: '19301-1', name: 'Hiiu', lat: 59.3826, lng: 24.6687 },
  { id: '19501-1', name: 'Nõmme', lat: 59.3866, lng: 24.6837 },
  { id: '19701-1', name: 'Mustamäe', lat: 59.3966, lng: 24.6637 },
  { id: '19901-1', name: 'Szolnok', lat: 59.4016, lng: 24.6787 },
  { id: '20101-1', name: 'Keskuse', lat: 59.4046, lng: 24.6937 },
  { id: '20301-1', name: 'Liivaku', lat: 59.3926, lng: 24.6987 },
  { id: '20501-1', name: 'Vambola', lat: 59.3956, lng: 24.7037 },
  { id: '20701-1', name: 'Lepistiku', lat: 59.3986, lng: 24.7087 },
  { id: '20901-1', name: 'Siili', lat: 59.4036, lng: 24.7137 },
  { id: '21101-1', name: 'Linnu tee', lat: 59.4086, lng: 24.7187 },
  { id: '21301-1', name: 'Tedre', lat: 59.4136, lng: 24.7237 },
  { id: '21501-1', name: 'Kosmos', lat: 59.4282, lng: 24.7445 },
  { id: '21701-1', name: 'Vabaduse väljak', lat: 59.4336, lng: 24.7447 },
  { id: '21901-1', name: 'Zoo', lat: 59.4266, lng: 24.6587 },
  { id: '22101-1', name: 'Haabersti', lat: 59.4286, lng: 24.6487 },
  { id: '22301-1', name: 'Rocca al Mare', lat: 59.4326, lng: 24.6437 },
  { id: '22501-1', name: 'Sinilille', lat: 59.4186, lng: 24.6437 },
  { id: '22701-1', name: 'Meelespea', lat: 59.4156, lng: 24.6487 },
  { id: '22901-1', name: 'Rukkilille', lat: 59.4126, lng: 24.6537 },
  { id: '23101-1', name: 'Karjavälja', lat: 59.4086, lng: 24.6637 },
  { id: '23301-1', name: 'Mustamäe tee', lat: 59.4136, lng: 24.6837 },
  { id: '23501-1', name: 'Marja', lat: 59.4216, lng: 24.6937 },
  { id: '23701-1', name: 'Välja', lat: 59.4246, lng: 24.7037 },
  { id: '23901-1', name: 'Hipodroom', lat: 59.4286, lng: 24.7137 },
  { id: '24101-1', name: 'Mooni', lat: 59.4316, lng: 24.7037 },
  { id: '24301-1', name: 'Taksopark', lat: 59.4286, lng: 24.7237 },
  { id: '24501-1', name: 'Endla', lat: 59.4316, lng: 24.7337 },
  { id: '24701-1', name: 'Pelgulinn', lat: 59.4386, lng: 24.7137 },
  { id: '24901-1', name: 'Härjapea', lat: 59.4416, lng: 24.7237 },
  { id: '25101-1', name: 'Maisi', lat: 59.4446, lng: 24.7137 },
  { id: '25301-1', name: 'Nisu', lat: 59.4476, lng: 24.7037 },
  { id: '25501-1', name: 'Ehte', lat: 59.4516, lng: 24.6937 },
  { id: '25701-1', name: 'Madala', lat: 59.4546, lng: 24.6837 },
  { id: '25901-1', name: 'Kari', lat: 59.4576, lng: 24.6737 },
  { id: '26101-1', name: 'Pelguranna', lat: 59.4606, lng: 24.6837 },
  { id: '26301-1', name: 'Maleva', lat: 59.4656, lng: 24.6937 },
  { id: '26501-1', name: 'Sirbi', lat: 59.4686, lng: 24.6737 },
  { id: '26701-1', name: 'Kopli', lat: 59.4716, lng: 24.6637 },
  { id: '26901-1', name: 'Sepa', lat: 59.4686, lng: 24.6837 },
  { id: '27101-1', name: 'Marati', lat: 59.4636, lng: 24.7037 },
  { id: '27301-1', name: 'Krulli', lat: 59.4536, lng: 24.7137 },
  { id: '27501-1', name: 'Volta', lat: 59.4506, lng: 24.7237 },
  { id: '27701-1', name: 'Salme', lat: 59.4476, lng: 24.7337 },
  { id: '27901-1', name: 'Kalamaja', lat: 59.4446, lng: 24.7437 },
  { id: '28101-1', name: 'Põhja puiestee', lat: 59.4445, lng: 24.7505 },
  { id: '28301-1', name: 'Linnahall', lat: 59.4465, lng: 24.7535 },
  { id: '28501-1', name: 'Kanuti', lat: 59.4415, lng: 24.7535 },
  { id: '28701-1', name: 'Ahtri', lat: 59.4405, lng: 24.7585 },
  { id: '28901-1', name: 'Siimeoni', lat: 59.4425, lng: 24.7635 },
  { id: '29101-1', name: 'Reisisadam A-terminal', lat: 59.4455, lng: 24.7635 },
  { id: '29301-1', name: 'Pronksi', lat: 59.4375, lng: 24.7685 },
  { id: '29501-1', name: 'F.R. Kreutzwaldi', lat: 59.4355, lng: 24.7735 },
  { id: '29701-1', name: 'L. Koidula', lat: 59.4385, lng: 24.7785 },
  { id: '29901-1', name: 'J. Poska', lat: 59.4395, lng: 24.7835 },
];

export const MOCK_ARRIVALS: Arrival[] = [
  { line: '5', destination: 'Männiku', type: 'bus', minutes: 2, status: 'on-time', info: 'Via Center' },
  { line: '3', destination: 'Kadriorg', type: 'tram', minutes: 7, status: 'delayed', info: 'Express' },
  { line: '18', destination: 'Laagri', type: 'bus', minutes: 14, status: 'expected', info: 'Local' },
  { line: '1', destination: 'Kopli', type: 'tram', minutes: 0, status: 'departed' },
];

export const getMockDepartures = (stopId: string): Arrival[] => {
  const lines = ['1', '2', '3', '4', '5', '18', '24', '40', '67', '68', '73'];
  const destinations = ['Männiku', 'Kadriorg', 'Laagri', 'Kopli', 'Mustamäe', 'Õismäe', 'Pirita', 'Viimsi'];
  const types: ('bus' | 'tram')[] = ['bus', 'tram'];

  return Array.from({ length: 6 }, (_, i) => ({
    line: lines[Math.floor(Math.random() * lines.length)],
    destination: destinations[Math.floor(Math.random() * destinations.length)],
    type: types[Math.floor(Math.random() * types.length)],
    minutes: (i + 1) * (Math.floor(Math.random() * 5) + 2),
    status: Math.random() > 0.8 ? 'delayed' : 'on-time',
    info: Math.random() > 0.5 ? 'Express' : 'Local'
  }));
};

export const MOCK_ROUTES: RouteOption[] = [
  {
    id: 'r1',
    duration: 18,
    startTime: '14:20',
    endTime: '14:38',
    type: 'fastest',
    transfers: 0,
    leavesIn: 4,
    segments: [
      { type: 'bus', line: '2' },
      { type: 'walk', distance: 250 }
    ]
  },
  {
    id: 'r2',
    duration: 24,
    startTime: '14:25',
    endTime: '14:49',
    type: 'direct',
    transfers: 1,
    via: 'Viru',
    segments: [
      { type: 'tram', line: '4' },
      { type: 'bus', line: '15' }
    ]
  },
  {
    id: 'r3',
    duration: 32,
    startTime: '14:15',
    endTime: '14:47',
    type: 'less-walking',
    transfers: 0,
    delay: 3,
    segments: [
      { type: 'bus', line: '121' }
    ]
  }
];
