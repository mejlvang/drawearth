import * as maplibregl from '/vendor/maplibre-gl.mjs';
import { TOTAL_COUNTRIES, countryName, formatCoords, formatId } from './shared.js';

const ZOOMED = 3;

const PALETTES = {
  light: { ink: '#000', paper: '#fff', land: '#fafafa', water: '#e2e2e2', building: '#eee', road: '#dcdcdc', border: '#aaa', label: '#888' },
  dark: { ink: '#fff', paper: '#000', land: '#141414', water: '#262626', building: '#1c1c1c', road: '#2a2a2a', border: '#555', label: '#777' },
};

// [layer, paint property, palette key]
const THEMED = [
  ['land', 'background-color', 'land'],
  ['water', 'fill-color', 'water'],
  ['buildings', 'fill-color', 'building'],
  ['roads', 'line-color', 'road'],
  ['borders', 'line-color', 'border'],
  ['country-labels', 'text-color', 'label'],
  ['city-labels', 'text-color', 'label'],
  ['clusters', 'circle-color', 'ink'],
  ['cluster-count', 'text-color', 'paper'],
  ['points', 'circle-color', 'ink'],
  ['points', 'circle-stroke-color', 'paper'],
];

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const palette = () => PALETTES[darkQuery.matches ? 'dark' : 'light'];

const label = ['coalesce', ['get', 'name:en'], ['get', 'name']];
const fade = (from, to) => ['interpolate', ['linear'], ['zoom'], from, 0, to, 1];

const initial = palette();

const style = {
  version: 8,
  projection: { type: 'globe' },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    { id: 'land', type: 'background', paint: { 'background-color': initial.land } },
    { id: 'water', type: 'fill', source: 'osm', 'source-layer': 'water', paint: { 'fill-color': initial.water } },
    {
      id: 'buildings', type: 'fill', source: 'osm', 'source-layer': 'building', minzoom: 14,
      paint: { 'fill-color': initial.building },
    },
    {
      id: 'roads', type: 'line', source: 'osm', 'source-layer': 'transportation', minzoom: 6,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]],
      paint: {
        'line-color': initial.road,
        'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 6, 0.4, 18, 14],
      },
    },
    {
      id: 'borders', type: 'line', source: 'osm', 'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': initial.border, 'line-width': 0.6 },
    },
    {
      id: 'country-labels', type: 'symbol', source: 'osm', 'source-layer': 'place', minzoom: 3, maxzoom: 7,
      filter: ['==', ['get', 'class'], 'country'],
      layout: { 'text-field': label, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-transform': 'lowercase' },
      paint: { 'text-color': initial.label },
    },
    {
      id: 'city-labels', type: 'symbol', source: 'osm', 'source-layer': 'place', minzoom: 5,
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: { 'text-field': label, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-transform': 'lowercase' },
      paint: { 'text-color': initial.label },
    },
  ],
};

const drawings = await fetch('/data/drawings.json', { cache: 'no-cache' }).then((r) => r.json());
const byId = new Map(drawings.map((d) => [d.id, d]));

renderStats(drawings);

// Fit the globe between the side panels (diameter ≈ 512·2^z / π px), then nudge in a bit.
const room = Math.min(innerWidth - 2 * 300, innerHeight - 160);
const startZoom = Math.min(2.5, Math.max(0.8, Math.log2((room * Math.PI) / 512) + 0.5));

const map = new maplibregl.Map({
  container: 'map',
  style,
  center: [12, 30],
  zoom: startZoom,
  minZoom: 0.5,
  maxZoom: 18,
  attributionControl: { compact: true },
  renderWorldCopies: false,
});

function applyTheme() {
  const colors = palette();
  for (const [layer, prop, key] of THEMED) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop, colors[key]);
  }
}
darkQuery.addEventListener('change', applyTheme);

map.on('load', () => {
  map.addSource('drawings', {
    type: 'geojson',
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: 14,
    data: {
      type: 'FeatureCollection',
      features: drawings.map((d) => ({
        type: 'Feature',
        properties: { id: d.id },
        geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
      })),
    },
  });

  map.addLayer({
    id: 'clusters', type: 'circle', source: 'drawings', filter: ['has', 'point_count'],
    paint: {
      'circle-color': initial.ink,
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        ZOOMED - 1, 4,
        ZOOMED, ['step', ['get', 'point_count'], 12, 10, 16, 50, 22],
      ],
    },
  });

  map.addLayer({
    id: 'cluster-count', type: 'symbol', source: 'drawings', filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
    paint: { 'text-color': initial.paper, 'text-opacity': fade(ZOOMED - 0.3, ZOOMED) },
  });

  map.addLayer({
    id: 'points', type: 'circle', source: 'drawings', filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': initial.ink,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], ZOOMED - 1, 3, ZOOMED, 6],
      'circle-stroke-color': initial.paper,
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], ZOOMED - 1, 0, ZOOMED, 2],
    },
  });

  map.on('click', 'clusters', async (e) => {
    const feature = e.features[0];
    const zoom = await map.getSource('drawings').getClusterExpansionZoom(feature.properties.cluster_id);
    zoomToward(feature.geometry.coordinates, Math.max(zoom, map.getZoom() + 1));
  });

  map.on('click', 'points', (e) => {
    openDrawing(byId.get(e.features[0].properties.id));
  });

  for (const layer of ['clusters', 'points']) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }
});

const syncZoomState = () => document.body.classList.toggle('zoomed', map.getZoom() >= ZOOMED);
map.on('zoom', syncZoomState);
syncZoomState();

// easeTo/flyTo rotate the globe and `around` is unsupported on globe, so the dot is
// moved to the centre in a straight screen-space line while zooming.
let zoomFrame;
function zoomToward(lngLat, targetZoom) {
  cancelAnimationFrame(zoomFrame);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    map.jumpTo({ center: lngLat, zoom: targetZoom });
    return;
  }
  const startZoom = map.getZoom();
  const start = map.project(lngLat);
  const startTime = performance.now();
  const duration = 900;

  const step = (now) => {
    const t = Math.min(1, (now - startTime) / duration);
    const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const goal = { x: start.x + (w / 2 - start.x) * e, y: start.y + (h / 2 - start.y) * e };

    map.jumpTo({ zoom: startZoom + (targetZoom - startZoom) * e });
    const p = map.project(lngLat);
    map.jumpTo({ center: map.unproject([w / 2 + p.x - goal.x, h / 2 + p.y - goal.y]) });

    if (t < 1) zoomFrame = requestAnimationFrame(step);
  };
  zoomFrame = requestAnimationFrame(step);
}

for (const type of ['wheel', 'mousedown', 'touchstart']) {
  map.getCanvasContainer().addEventListener(type, () => cancelAnimationFrame(zoomFrame), { passive: true });
}

function renderStats(list) {
  document.getElementById('total').textContent = `${list.length} drawings`;
  fillTally('mediums', countBy(list, (d) => d.medium));
  const countries = countBy(list, (d) => d.country);
  fillTally('countries', countries, countryName);
  document.getElementById('coverage').textContent = `${countries.length}/${TOTAL_COUNTRIES} countries drawn`;
}

function countBy(list, key) {
  const counts = new Map();
  for (const item of list) counts.set(key(item), (counts.get(key(item)) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0]));
}

function fillTally(id, entries, format = (v) => v) {
  const ol = document.getElementById(id);
  ol.replaceChildren(...entries.map(([name, count]) => {
    const li = document.createElement('li');
    const n = document.createElement('span');
    const c = document.createElement('span');
    n.textContent = format(name).toLowerCase();
    c.textContent = count;
    li.append(n, c);
    return li;
  }));
}

const dialog = document.getElementById('drawing');
const img = document.getElementById('drawing-img');

function openDrawing(d) {
  if (!d) return;
  img.src = d.image;
  img.alt = `Drawing ${formatId(d.id)}: ${d.medium}, ${countryName(d.country)}`;
  const rows = [
    ['id', formatId(d.id)],
    ['medium', d.medium],
    ['type', d.type],
    ['country', countryName(d.country).toLowerCase()],
    ['coordinates', formatCoords(d.lat, d.lng)],
  ];
  document.getElementById('drawing-meta').replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = v;
    return [dt, dd];
  }));
  document.getElementById('drawing-comment').textContent = d.comment || '';
  dialog.showModal();
}

dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});
dialog.addEventListener('close', () => { img.removeAttribute('src'); });
