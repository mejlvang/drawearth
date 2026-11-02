// Assembles the static site for GitHub Pages into _site/.
import { cpSync, readdirSync, rmSync } from 'node:fs';

const MAPLIBRE = 'node_modules/maplibre-gl/dist';

rmSync('_site', { recursive: true, force: true });
cpSync('public', '_site', { recursive: true });

for (const file of readdirSync(MAPLIBRE)) {
  if (file.endsWith('.map') || file.includes('-dev.') || file.endsWith('.d.ts')) continue;
  cpSync(`${MAPLIBRE}/${file}`, `_site/vendor/${file}`);
}

console.log('built _site/');
