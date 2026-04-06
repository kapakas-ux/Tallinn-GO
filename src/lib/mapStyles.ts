/**
 * Dark map style transformer for OpenFreeMap bright tiles.
 * Fetches the bright style, deep-clones it, and remaps all colors to dark equivalents.
 * The tile source stays the same — only rendering colors change.
 */

const DARK_PAINT: Record<string, Record<string, any>> = {
  // ── Background ───────────────────────────────────────────
  'background':           { 'background-color': '#1a1a2e' },

  // ── Natural landcover ────────────────────────────────────
  'landcover-glacier':    { 'fill-color': '#252535' },
  'landcover-ice-shelf':  { 'fill-color': '#252535' },
  'landcover-wood':       { 'fill-color': '#1a3018', 'fill-outline-color': 'hsla(0,0%,100%,0.03)' },
  'landcover-grass':      { 'fill-color': '#1e3020' },
  'landcover-grass-park': { 'fill-color': '#1e3020' },
  'landcover-sand':       { 'fill-color': '#2a2820' },

  // ── Landuse ──────────────────────────────────────────────
  'landuse-residential':  { 'fill-color': 'hsla(230,19%,15%,0.3)' },
  'landuse-suburb':       { 'fill-color': 'hsla(230,19%,15%,0.3)' },
  'landuse-commercial':   { 'fill-color': 'hsla(0,30%,15%,0.15)' },
  'landuse-industrial':   { 'fill-color': 'hsla(49,40%,12%,0.2)' },
  'landuse-cemetery':     { 'fill-color': '#1e2220' },
  'landuse-hospital':     { 'fill-color': '#2a1a20' },
  'landuse-school':       { 'fill-color': '#1e1a28' },
  'landuse-railway':      { 'fill-color': 'hsla(230,19%,15%,0.3)' },
  'park':                 { 'fill-color': '#1e3020' },

  // ── Water ────────────────────────────────────────────────
  'water':                         { 'fill-color': '#192d3e' },
  'water-intermittent':            { 'fill-color': '#192d3e' },
  'waterway-other':                { 'line-color': '#1a3a5a' },
  'waterway-other-intermittent':   { 'line-color': '#1a3a5a' },
  'waterway-stream-canal':         { 'line-color': '#1a3a5a' },
  'waterway-stream-canal-intermittent': { 'line-color': '#1a3a5a' },
  'waterway-river':                { 'line-color': '#1a3a5a' },
  'waterway-river-intermittent':   { 'line-color': '#1a3a5a' },
  'waterway_tunnel':               { 'line-color': '#1a3a5a' },

  // ── Buildings ────────────────────────────────────────────
  'building':     { 'fill-color': '#252530' },
  'building-top': { 'fill-color': '#2a2a35', 'fill-outline-color': '#35353f' },

  // ── Highways ─────────────────────────────────────────────
  'highway-path':                  { 'line-color': '#5a4a3a' },
  'highway-minor':                 { 'line-color': '#3a3a48' },
  'highway-link':                  { 'line-color': '#4a4030' },
  'highway-motorway-link':         { 'line-color': '#5a4828' },
  'highway-secondary-tertiary':    { 'line-color': '#4a4030' },
  'highway-primary':               { 'line-color': '#4a4030' },
  'highway-trunk':                 { 'line-color': '#4a4030' },
  'highway-motorway':              { 'line-color': '#5a4828' },

  // ── Highway casings ──────────────────────────────────────
  'highway-minor-casing':               { 'line-color': '#2a2a34' },
  'highway-link-casing':                { 'line-color': '#3a3020' },
  'highway-motorway-link-casing':       { 'line-color': '#3a3020' },
  'highway-secondary-tertiary-casing':  { 'line-color': '#3a3020' },
  'highway-primary-casing':             { 'line-color': '#3a3020' },
  'highway-trunk-casing':               { 'line-color': '#3a3020' },
  'highway-motorway-casing':            { 'line-color': '#3a3020' },

  // ── Pier & area ──────────────────────────────────────────
  'highway-area':   { 'fill-color': 'hsla(0,0%,20%,0.56)', 'fill-outline-color': '#2a2a34' },
  'road_area_pier': { 'fill-color': '#1a1a2e' },
  'road_pier':      { 'line-color': '#1a1a2e' },

  // ── Tunnels ──────────────────────────────────────────────
  'tunnel-path':             { 'line-color': '#5a4a3a' },
  'tunnel-service-track':    { 'line-color': '#333340' },
  'tunnel-minor':            { 'line-color': '#333340' },
  'tunnel-link':             { 'line-color': '#3a3525' },
  'tunnel-motorway-link':    { 'line-color': '#4a3e20' },
  'tunnel-secondary-tertiary': { 'line-color': '#3a3525' },
  'tunnel-trunk-primary':    { 'line-color': '#3a3525' },
  'tunnel-motorway':         { 'line-color': '#4a3e20' },
  'tunnel-service-track-casing': { 'line-color': '#252530' },
  'tunnel-minor-casing':         { 'line-color': '#252530' },
  'tunnel-link-casing':          { 'line-color': '#3a3020' },
  'tunnel-motorway-link-casing': { 'line-color': '#3a3020' },
  'tunnel-secondary-tertiary-casing': { 'line-color': '#3a3020' },
  'tunnel-trunk-primary-casing': { 'line-color': '#3a3020' },
  'tunnel-motorway-casing':      { 'line-color': '#3a3020' },
  'tunnel-railway':              { 'line-color': '#444' },

  // ── Bridges ──────────────────────────────────────────────
  'bridge-path':             { 'line-color': '#5a4a3a' },
  'bridge-path-casing':      { 'line-color': '#1a1a2e' },
  'bridge-minor':            { 'line-color': '#3a3a48' },
  'bridge-link':             { 'line-color': '#4a4030' },
  'bridge-motorway-link':    { 'line-color': '#5a4828' },
  'bridge-secondary-tertiary': { 'line-color': '#4a4030' },
  'bridge-trunk-primary':    { 'line-color': '#4a4030' },
  'bridge-motorway':         { 'line-color': '#5a4828' },
  'bridge-minor-casing':     { 'line-color': '#2a2a34' },
  'bridge-link-casing':      { 'line-color': '#3a3020' },
  'bridge-motorway-link-casing': { 'line-color': '#3a3020' },
  'bridge-secondary-tertiary-casing': { 'line-color': '#3a3020' },
  'bridge-trunk-primary-casing': { 'line-color': '#3a3020' },
  'bridge-motorway-casing':  { 'line-color': '#3a3020' },
  'bridge-railway':          { 'line-color': '#444' },
  'bridge-railway-hatching': { 'line-color': '#444' },

  // ── Railway ──────────────────────────────────────────────
  'railway':                  { 'line-color': '#444' },
  'railway-hatching':         { 'line-color': '#444' },
  'railway-transit':          { 'line-color': 'hsla(0,0%,30%,0.77)' },
  'railway-transit-hatching': { 'line-color': 'hsla(0,0%,30%,0.68)' },
  'railway-service':          { 'line-color': 'hsla(0,0%,30%,0.77)' },
  'railway-service-hatching': { 'line-color': 'hsla(0,0%,30%,0.68)' },

  // ── Misc ─────────────────────────────────────────────────
  'ferry':          { 'line-color': 'rgba(40,70,90,1)' },
  'cablecar':       { 'line-color': 'hsl(0,0%,40%)' },
  'cablecar-dash':  { 'line-color': 'hsl(0,0%,40%)' },
  'aeroway-area':          { 'fill-color': '#2a2a3a' },
  'aeroway-taxiway':       { 'line-color': '#2a2a3a' },
  'aeroway-runway':        { 'line-color': '#2a2a3a' },
  'aeroway-taxiway-casing': { 'line-color': '#404050' },
  'aeroway-runway-casing':  { 'line-color': '#404050' },

  // ── Boundaries ───────────────────────────────────────────
  'boundary_3':         { 'line-color': 'hsl(0,0%,35%)' },
  'boundary_2':         { 'line-color': 'hsl(248,7%,45%)' },
  'boundary_disputed':  { 'line-color': 'hsl(248,7%,45%)' },

  // ── Text labels ──────────────────────────────────────────
  'waterway_line_label':    { 'text-color': '#4a7eb0', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'water_name_point_label': { 'text-color': '#6a8ec0', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'water_name_line_label':  { 'text-color': '#6a8ec0', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'highway-name-path':      { 'text-color': 'hsl(30,23%,50%)', 'text-halo-color': '#1a1a2e' },
  'highway-name-minor':     { 'text-color': '#888', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'highway-name-major':     { 'text-color': '#999', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'poi_r20':       { 'text-color': '#888', 'text-halo-color': '#1a1a2e' },
  'poi_r7':        { 'text-color': '#888', 'text-halo-color': '#1a1a2e' },
  'poi_r1':        { 'text-color': '#888', 'text-halo-color': '#1a1a2e' },
  'poi_transit':   { 'text-color': '#8ab4e0', 'text-halo-color': '#1a1a2e' },
  'airport':       { 'text-color': '#888', 'text-halo-color': '#1a1a2e' },
  'label_other':         { 'text-color': '#aaa', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'label_village':       { 'text-color': '#ccc', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'label_town':          { 'text-color': '#ccc', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'label_state':         { 'text-color': '#aaa', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'label_city':          { 'text-color': '#ddd', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'label_city_capital':  { 'text-color': '#eee', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'label_country_3':     { 'text-color': '#ddd', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'label_country_2':     { 'text-color': '#ddd', 'text-halo-color': 'rgba(20,20,35,0.8)' },
  'label_country_1':     { 'text-color': '#ddd', 'text-halo-color': 'rgba(20,20,35,0.8)' },
};

let cachedDarkStyle: any = null;

export async function fetchDarkMapStyle(): Promise<any> {
  if (cachedDarkStyle) return cachedDarkStyle;

  const response = await fetch('https://tiles.openfreemap.org/styles/bright');
  const style = await response.json();
  const dark = JSON.parse(JSON.stringify(style));

  for (const layer of dark.layers) {
    const overrides = DARK_PAINT[layer.id];
    if (overrides) {
      layer.paint = { ...layer.paint, ...overrides };
    }
  }

  cachedDarkStyle = dark;
  return dark;
}
