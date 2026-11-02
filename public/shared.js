export const DEFAULT_MEDIUMS = ['procreate', 'linocut', 'pencil', 'paint', 'collage'];
export const TYPES = ['analog', 'digital'];

export function normalizeTag(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 30);
}

export function isValidTag(tag) {
  return /^[\p{L}\p{N}][\p{L}\p{N} &+-]*$/u.test(tag);
}
export const TOTAL_COUNTRIES = 195;

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA']);

export function countryName(code) {
  try {
    return regionNames.of(code);
  } catch {
    return code;
  }
}

export function countryList() {
  const list = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code)) continue;
      const name = countryName(code);
      if (name && name !== code) list.push({ code, name });
    }
  }
  return list.sort((x, y) => x.name.localeCompare(y.name));
}

export function formatId(id) {
  return `#${String(id).padStart(3, '0')}`;
}

export function formatCoords(lat, lng) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
