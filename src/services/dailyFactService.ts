const FACTS_KEY = 'tallinn_go_daily_fact';

const FACTS = [
  "Tallinn made all of its public transport completely free for registered city residents back in 2013.",
  "Even though the rides are free for locals, registered Tallinn residents are still legally required to scan their green transit card every time they board.",
  "Tourists and visitors in Tallinn cannot ride for free, but they can easily buy a green Ühiskaart transit card to load money for cheap travel.",
  "You can buy a green Ühiskaart transit card at almost any grocery store, post office, or R-Kiosk convenience stand in Estonia.",
  "If you don't want to buy a dedicated transit card, you can simply tap your regular contactless bank card on the validator to pay for a Tallinn bus or tram ride.",
  "When you tap a contactless bank card on a Tallinn bus, the system automatically calculates the cheapest daily fare cap so you never overpay.",
  "Estonia has integrated its regional transit cards, meaning the green card you buy in Tallinn also works on city buses in Tartu and Pärnu.",
  "A standard physical green Ühiskaart transit card currently costs 3 euros to purchase, plus whatever money you decide to load onto it.",
  "If you need to buy a physical transit ticket with cash, you cannot do it on a Tallinn bus; you must find a nearby kiosk or ticket machine.",
  "If you are caught riding Tallinn public transport without a valid ticket or a tapped card, ticket inspectors can issue a fine of up to 40 euros.",
  "Ticket inspectors in Tallinn frequently board buses in groups wearing bright neon vests to check everyone's transit cards at once.",
  "Tallinn's public transport system carries an incredible average of 355,000 passenger trips every single day.",
  "Tallinn is the only city in the entire country of Estonia that operates a tram network.",
  "Tallinn is also the only city in Estonia that has ever operated a trolleybus system.",
  "The city of Tallinn officially opened a brand-new tram line connecting the city center directly to the Old Harbour passenger ferry terminal in December 2024.",
  "The new Old Harbour tram line in Tallinn cost approximately 55 million euros to build and test.",
  "You can take Tram Line 4 in Tallinn for a direct, cheap ride straight to the front doors of Tallinn Airport.",
  "The Tallinn municipal transit fleet includes over 600 active buses, trams, and trolleybuses.",
  "Tallinn is currently in the process of phasing out its older diesel buses in favor of cleaner compressed-gas and battery-electric models.",
  "The standard daytime public transport network in Tallinn operates daily from 6:00 in the morning until 23:00 at night.",
  "If you are out partying on the weekend, Tallinn operates special late-night night buses on Friday and Saturday nights between 00:30 and 03:30.",
  "When boarding a Tallinn city bus, you can enter through any of the doors, not just the front door.",
  "You do not need to show your transit card or ticket to the bus driver when boarding a city bus in Tallinn.",
  "Tallinn has dedicated bus-only lanes painted with a large 'A' on many major streets to help transit bypass heavy rush-hour car traffic.",
  "Taxis and electric vehicles are legally allowed to drive in Tallinn's dedicated public transport bus lanes to avoid traffic.",
  "You can check live, real-time departure boards at many major bus and tram stops across central Tallinn.",
  "Small pets are generally allowed on public transport in Tallinn as long as they are kept in a secure carrier or on a short leash.",
  "If you bring a large dog on a Tallinn city bus or tram, the dog must wear a muzzle for the safety of other passengers.",
  "You are generally not allowed to bring a full-sized bicycle onto a crowded Tallinn city bus or tram.",
  "Foldable bicycles and electric scooters are allowed on Tallinn public transport as long as they are folded and do not block the aisles.",
  "Almost all modern city buses in Tallinn are low-floor vehicles, making them fully accessible for wheelchair users.",
  "Passengers traveling with a child in a baby stroller are allowed to ride the Tallinn city buses and trams completely free of charge.",
  "Visually impaired passengers can use an audio announcement system at major Tallinn intersections to know when it is safe to cross to a bus stop.",
  "Eating messy hot foods or drinking open beverages is strictly prohibited on Tallinn city buses and trams.",
  "Many modern bus shelters in Tallinn feature USB charging ports and digital advertising screens.",
  "The private coach company Lux Express operates some of the most comfortable intercity bus routes across Estonia.",
  "Lux Express carried an impressive 2.1 million passengers on its Estonian domestic bus routes during the year 2024.",
  "The bus route connecting the capital city of Tallinn with the university city of Tartu is the most popular Lux Express domestic line.",
  "Most Lux Express intercity buses feature airplane-style personal entertainment screens built into the back of every seat.",
  "Lux Express offers complimentary hot drinks from an onboard coffee machine on many of its long-distance routes.",
  "During freezing winter weather, Lux Express temporarily shuts down the onboard coffee machines on certain routes to prevent the water pipes from bursting.",
  "The Lux Express Lounge class on the Tallinn-Tartu route features extra-wide seating and guaranteed winter coffee machine service.",
  "The main central bus terminal for intercity travel in Estonia's capital is known as Tallinna Bussijaam.",
  "Tallinna Bussijaam features an indoor cafeteria, a waiting area, luggage lockers, and automated ticket machines for travelers.",
  "You can access free public Wi-Fi while waiting for your intercity coach inside Tallinna Bussijaam.",
  "You can take a direct international bus from Tallinn's central bus station to neighboring capitals like Riga, Latvia, and Vilnius, Lithuania.",
  "The international bus companies operating out of Tallinn usually allow you to take one large piece of luggage in the hold for free.",
  "All domestic passenger trains in Estonia are operated by a 100% state-owned company called Elron.",
  "You can easily spot an Elron passenger train in Estonia by its bright, signature orange-and-black exterior paint job.",
  "The Estonian train operator Elron provides complimentary Wi-Fi access for all passengers across its entire train fleet.",
  "You can buy an Elron train ticket online, at the station, or directly from the conductor on the train.",
  "If you decide to buy your train ticket directly from the onboard conductor, you will have to pay a small extra service surcharge.",
  "You can bring a bicycle onto Elron passenger trains, but you must purchase a separate bicycle ticket during the busy summer months.",
  "Elron permanently retired all of its uncomfortable, old Soviet-era passenger trains back in 2015.",
  "The backbone of Estonia's passenger railway is a modern fleet of 38 Swiss-designed Stadler FLIRT trains.",
  "In late 2024, Elron began receiving brand-new, comfortable Škoda passenger trains to boost capacity.",
  "The new Škoda passenger trains are specifically designated to serve the highly demanded Tallinn-Tartu railway line.",
  "The main central railway station in Estonia's capital is called Balti Jaam (Baltic Station).",
  "Balti Jaam is a massive transit hub that connects national trains, local city buses, trams, and trolleybuses in one convenient location.",
  "Elron trains feature dedicated low-floor entry areas, making it very easy to roll a wheelchair, stroller, or bicycle onboard.",
  "If you are taking an Elron train during the busy Friday evening rush, you can pay extra to reserve a specific numbered seat in First Class.",
  "Elron's First Class train carriages feature wider seats, adjustable tables, and power outlets for charging your laptop during the ride.",
  "The city of Tartu operates a highly popular public bike-sharing program called Tartu Smart Bike Share.",
  "The Tartu Smart Bike Share system includes hundreds of traditional bicycles and electric-assist bikes scattered at docks across the city.",
  "You can buy a daily membership for the Tartu Smart Bike Share system for just 5 euros.",
  "An annual membership for the Tartu Smart Bike Share program costs only 30 euros for the entire year.",
  "A Tartu Smart Bike ride is completely free for the first 60 minutes if you have an active membership.",
  "If you ride a Tartu Smart Bike for more than 60 minutes without docking it, the system charges you 1 euro for every additional hour.",
  "Every spring, Tartu returns its electric-assist Smart Bikes to the city streets after storing them away during the harshest winter months.",
  "Tartu does not have any trams or metro lines, relying entirely on a modern, eco-friendly city bus network.",
  "The city of Tartu completely redesigned its bus network in 2019 to feature fewer, but much more frequent, main transit lines.",
  "Estonia's mainland is connected to its largest islands, Saaremaa and Hiiumaa, by large, state-subsidized car ferries.",
  "The most common way to reach Estonia's largest island, Saaremaa, is by taking a ferry from the mainland port of Virtsu to the island of Muhu.",
  "If you want to travel directly to the island of Hiiumaa, you must take a ferry from the mainland port of Rohuküla to the island port of Heltermaa.",
  "During the busy peak summer months, it is highly recommended to book your Estonian island ferry tickets well in advance so your car isn't left behind at the port.",
  "The large passenger ferries traveling to Saaremaa and Hiiumaa feature onboard cafeterias, outdoor viewing decks, and plenty of indoor seating.",
  "You can easily travel between Estonia's two largest islands by taking a smaller connecting ferry from Sõru on Hiiumaa to Triigi on Saaremaa.",
  "During exceptionally cold winters, Estonia opens an official ice road over the frozen Baltic Sea, allowing cars to drive between the mainland and the islands instead of taking a ferry.",
  "The winter ice roads that temporarily replace ferry routes are only open during daylight hours for safety reasons.",
  "In February 2026, Estonia opened a 17-kilometer temporary ice road directly connecting the islands of Saaremaa and Hiiumaa.",
  "The coastal city of Pärnu, known as Estonia's 'summer capital,' operates its own modern fleet of city buses.",
  "You can easily travel from Tallinn to Pärnu using frequent, comfortable intercity coaches operated by companies like Lux Express.",
  "Just like in Tallinn, you can use a standard contactless bank card to pay for a city bus ride in Pärnu.",
  "Estonia's regional county buses are crucial for connecting small rural villages to larger municipal centers.",
  "Some rural county bus routes in Estonia are completely free for passengers to help combat rural isolation.",
  "The rural county buses are typically painted with regional logos, making them easy to distinguish from commercial intercity coaches.",
  "Tallinn's very first motorized public transit buses hit the city streets right before the outbreak of World War I.",
  "Before motorized buses took over, Tallinn relied on horse-drawn passenger carriages known as omnibuses back in the 1860s.",
  "The Tallinn municipal transport company (TLT) operates one of the largest compressed natural gas (CNG) bus fleets in the Baltic states.",
  "A single typical Tallinn city bus drives about 58,000 kilometers in a single year just going back and forth on its route.",
  "The Tallinn tram network is relatively small, consisting of fewer than 10 total operating lines.",
  "The Laeva passenger tram stop was specifically built right next to the port to serve international ferry passengers arriving in Tallinn.",
  "Tallinn's historic Linnahall building serves as a major transfer hub for passengers switching between different bus and tram lines.",
  "In October 2024, Tallinn adjusted its bus routes to reduce the number of times passengers have to make annoying transfers to reach the city center.",
  "The October 2024 route changes in Tallinn were so successful that the city saw a massive surge of 4,000 extra daily transit riders.",
  "Tallinn's transport department completely overhauls and updates its bus route contracts every five years to ensure maximum efficiency.",
  "The Estonian national train operator Elron saw a massive boost in popularity after replacing its loud, clunky trains with quiet Swiss electric models.",
  "The entire Estonian public transport network is integrated into major digital routing apps like Google Maps and Apple Maps.",
  "Estonia's integration of digital transit data means you can plan a trip from a bus in Tallinn to a ferry in Saaremaa all on one smartphone app.",
  "Estonia's state portal, Eesti.ee, serves as a centralized hub where anyone can find official guidance on how to navigate the national transit system.",
];

interface StoredFact {
  date: string; // YYYY-MM-DD
  index: number;
  dismissed?: boolean;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyFact(): { text: string; dismissed: boolean } {
  const today = getToday();
  try {
    const stored = localStorage.getItem(FACTS_KEY);
    if (stored) {
      const parsed: StoredFact = JSON.parse(stored);
      if (parsed.date === today) {
        return { text: FACTS[parsed.index], dismissed: !!parsed.dismissed };
      }
    }
    // New day — pick a fresh random fact, not dismissed
    const index = Math.floor(Math.random() * FACTS.length);
    localStorage.setItem(FACTS_KEY, JSON.stringify({ date: today, index, dismissed: false }));
    return { text: FACTS[index], dismissed: false };
  } catch {
    return { text: FACTS[0], dismissed: false };
  }
}

export function dismissDailyFact(): void {
  const today = getToday();
  try {
    const stored = localStorage.getItem(FACTS_KEY);
    if (stored) {
      const parsed: StoredFact = JSON.parse(stored);
      localStorage.setItem(FACTS_KEY, JSON.stringify({ ...parsed, date: today, dismissed: true }));
    }
  } catch { /* ignore */ }
}

export const FACTS_COUNT = FACTS.length;
