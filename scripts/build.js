// Assembles the static site for GitHub Pages into _site/.
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const MAPLIBRE = 'node_modules/maplibre-gl/dist';

rmSync('_site', { recursive: true, force: true });
cpSync('public', '_site', { recursive: true });

for (const file of readdirSync(MAPLIBRE)) {
  if (file.endsWith('.map') || file.includes('-dev.') || file.endsWith('.d.ts')) continue;
  cpSync(`${MAPLIBRE}/${file}`, `_site/vendor/${file}`);
}

// Ship only the outlines of drawn countries (Natural Earth 1:50m, public domain).
const drawn = new Set(JSON.parse(readFileSync('public/data/drawings.json', 'utf8')).map((d) => d.country));
const countries = JSON.parse(readFileSync('geo/countries.geojson', 'utf8'));
countries.features = countries.features.filter((f) => drawn.has(f.properties.code));
writeFileSync('_site/data/drawn-countries.json', JSON.stringify(countries));

console.log('built _site/');
