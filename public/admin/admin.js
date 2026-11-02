import { MEDIUMS, TYPES, countryList, countryName, formatCoords, formatId } from '/shared.js';
import { UPLOAD_DIR } from './config.js';
import * as github from './github.js';

const FULL_SIZE = 2400;
const THUMB_SIZE = 640;
const LIVE_SOON = 'saved · live on the site in about a minute';

const $ = (sel) => document.querySelector(sel);
const loginForm = $('#login');
const cms = $('#cms');
const editor = $('#editor');
const rows = $('#rows');
const preview = $('#preview');
const coordsHint = $('#coords-parsed');

let drawings = [];
let editingId = null;
let coords = null;

/* ---------- setup ---------- */

editor.medium.append(...MEDIUMS.map((m) => new Option(m, m)));
editor.country.append(...countryList().map(({ code, name }) => new Option(name, code)));

if (github.getToken()) {
  try {
    await github.verifyToken();
    showCms();
  } catch {
    github.clearToken();
    loginForm.hidden = false;
  }
} else {
  loginForm.hidden = false;
}

/* ---------- auth ---------- */

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = loginForm.querySelector('.error');
  error.textContent = '';
  github.setToken(loginForm.token.value.trim());
  try {
    await github.verifyToken();
  } catch (err) {
    github.clearToken();
    error.textContent = err.message;
    return;
  }
  loginForm.reset();
  loginForm.hidden = true;
  showCms();
});

$('#logout').addEventListener('click', () => {
  github.clearToken();
  location.reload();
});

async function showCms() {
  cms.hidden = false;
  $('#logout').hidden = false;
  await loadDrawings();
}

/* ---------- list ---------- */

async function loadDrawings(list) {
  drawings = list || (await github.loadDrawings());
  drawings.sort((a, b) => b.id - a.id);
  rows.replaceChildren(...drawings.map(renderRow));
}

function renderRow(d) {
  const tr = document.createElement('tr');
  const img = document.createElement('img');
  img.src = github.rawUrl(d.thumb);
  img.alt = '';
  img.loading = 'lazy';

  const cells = [
    img,
    formatId(d.id),
    d.medium,
    d.type,
    countryName(d.country).toLowerCase(),
    formatCoords(d.lat, d.lng),
    d.comment || '',
  ];
  for (const value of cells) {
    const td = document.createElement('td');
    td.append(value);
    tr.append(td);
  }
  tr.children[6].className = 'comment';
  tr.children[6].title = d.comment || '';

  const actions = document.createElement('td');
  const edit = button('edit', () => startEdit(d));
  const del = button('delete', () => remove(d));
  actions.append(edit, del);
  tr.append(actions);
  return tr;
}

function button(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'link';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

async function remove(d) {
  if (!confirm(`Delete ${formatId(d.id)}? (It stays in the git history.)`)) return;
  setStatus(`deleting ${formatId(d.id)}…`);
  try {
    const list = await github.commit(`Delete drawing ${formatId(d.id)}`, (list) => {
      const index = list.findIndex((x) => x.id === d.id);
      if (index === -1) return {};
      const [gone] = list.splice(index, 1);
      return { remove: [`public${gone.image}`, `public${gone.thumb}`] };
    });
    if (editingId === d.id) resetEditor();
    await loadDrawings(list);
    setStatus(LIVE_SOON);
  } catch (err) {
    setStatus('');
    alert(err.message);
  }
}

/* ---------- editor ---------- */

function startEdit(d) {
  editingId = d.id;
  editor.classList.add('editing');
  $('#editor-title').textContent = `edit ${formatId(d.id)}`;
  $('#submit').textContent = 'save';
  $('#cancel').hidden = false;
  editor.type.value = d.type;
  editor.medium.value = d.medium;
  editor.coords.value = `${d.lat}, ${d.lng}`;
  editor.country.value = d.country;
  editor.comment.value = d.comment || '';
  editor.image.value = '';
  setCoords(d.lat, d.lng);
  showPreview(github.rawUrl(d.image));
  editor.scrollIntoView({ behavior: 'smooth' });
}

function resetEditor() {
  editingId = null;
  editor.reset();
  syncType();
  editor.classList.remove('editing');
  $('#editor-title').textContent = 'new drawing';
  $('#submit').textContent = 'upload';
  $('#cancel').hidden = true;
  editor.querySelector('.error').textContent = '';
  coords = null;
  coordsHint.textContent = '';
  showPreview(null);
}

$('#cancel').addEventListener('click', resetEditor);

editor.medium.addEventListener('change', syncType);
syncType();

function syncType() {
  editor.type.value = editor.medium.value === 'procreate' ? 'digital' : 'analog';
}

editor.image.addEventListener('change', () => {
  const file = editor.image.files[0];
  showPreview(file ? URL.createObjectURL(file) : null);
});

function showPreview(src) {
  if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
  preview.hidden = !src;
  if (src) preview.src = src;
  else preview.removeAttribute('src');
}

editor.coords.addEventListener('input', () => {
  const parsed = parseCoords(editor.coords.value);
  if (!parsed) {
    coords = null;
    coordsHint.textContent = editor.coords.value ? 'could not read coordinates' : '';
    return;
  }
  setCoords(...parsed);
  if (!editor.country.value) guessCountry(...parsed);
});

function setCoords(lat, lng) {
  coords = { lat, lng };
  coordsHint.textContent = `→ ${formatCoords(lat, lng)}`;
}

function parseCoords(value) {
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, // maps url: /@55.67,12.56,3a
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // maps url data block
    /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/, // "55.67, 12.56"
  ];
  for (const re of patterns) {
    const m = value.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lat, lng];
  }
  return null;
}

async function guessCountry(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=3&lat=${lat}&lon=${lng}`;
    const data = await fetch(url).then((r) => r.json());
    const code = data.address?.country_code?.toUpperCase();
    if (code && !editor.country.value) editor.country.value = code;
  } catch {
    // Country can still be picked by hand.
  }
}

editor.addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = editor.querySelector('.error');
  error.textContent = '';

  const file = editor.image.files[0];
  if (!editingId && !file) return (error.textContent = 'pick an image');
  if (!coords) return (error.textContent = 'coordinates are missing');

  const data = {
    type: editor.type.value,
    medium: editor.medium.value,
    lat: coords.lat,
    lng: coords.lng,
    country: editor.country.value,
    comment: editor.comment.value.trim(),
  };
  if (!TYPES.includes(data.type) || !MEDIUMS.includes(data.medium) || !/^[A-Z]{2}$/.test(data.country)) {
    return (error.textContent = 'check type, medium and country');
  }

  const submit = $('#submit');
  submit.disabled = true;
  try {
    let images = null;
    if (file) {
      setStatus('resizing…');
      const [image, thumb] = await Promise.all([resize(file, FULL_SIZE), resize(file, THUMB_SIZE)]);
      images = { image, thumb };
    }

    setStatus('saving to github…');
    const id = editingId;
    const list = await github.commit(id ? `Edit drawing ${formatId(id)}` : 'Add drawing', (list) => {
      let d;
      if (id) {
        d = list.find((x) => x.id === id);
        if (!d) throw new Error('This drawing no longer exists');
        Object.assign(d, data, { updatedAt: new Date().toISOString() });
      } else {
        d = { id: list.reduce((max, x) => Math.max(max, x.id), 0) + 1, ...data, createdAt: new Date().toISOString() };
        list.push(d);
      }
      if (!images) return {};

      const remove = d.image ? [`public${d.image}`, `public${d.thumb}`] : [];
      const ext = images.image.type === 'image/webp' ? 'webp' : 'jpg';
      const key = `${d.id}-${randomHex()}`;
      d.image = `/uploads/${key}.${ext}`;
      d.thumb = `/uploads/${key}-thumb.${ext}`;
      return {
        remove,
        add: {
          [`${UPLOAD_DIR}/${key}.${ext}`]: images.image,
          [`${UPLOAD_DIR}/${key}-thumb.${ext}`]: images.thumb,
        },
      };
    });

    resetEditor();
    await loadDrawings(list);
    setStatus(LIVE_SOON);
  } catch (err) {
    setStatus('');
    error.textContent = err.message || 'upload failed';
  } finally {
    submit.disabled = false;
  }
});

function setStatus(text) {
  $('#status').textContent = text;
}

function randomHex() {
  return [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function resize(file, max) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encode = (type, quality) => new Promise((r) => canvas.toBlob(r, type, quality));
  const webp = await encode('image/webp', 0.88);
  // Safari can't encode WebP and silently returns PNG.
  return webp?.type === 'image/webp' ? webp : encode('image/jpeg', 0.9);
}
