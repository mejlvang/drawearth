// Minimal GitHub client: the repo is the database, every change is one commit.
import { DATA_PATH, REPO } from './config.js';

const API = `https://api.github.com/repos/${REPO.owner}/${REPO.name}`;
const TOKEN_KEY = 'drawearth.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function gh(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const message = (await res.json().catch(() => ({}))).message || res.statusText;
    throw new Error(`GitHub ${res.status}: ${message}`);
  }
  return raw ? res.text() : res.json();
}

export async function verifyToken() {
  const repo = await gh('');
  if (!repo.permissions?.push) throw new Error('Token has no write access to the repo');
}

async function head() {
  const ref = await gh(`/git/ref/heads/${REPO.branch}`);
  return ref.object.sha;
}

export async function loadDrawings(ref) {
  const text = await gh(`/contents/${DATA_PATH}?ref=${ref || (await head())}`, { raw: true });
  return JSON.parse(text);
}

async function blobBase64(blob) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/**
 * Reads the latest drawings, lets `change` mutate them, and commits the result
 * together with any added files (path → Blob) and removed paths.
 */
export async function commit(message, change) {
  const parent = await head();
  const drawings = await loadDrawings(parent);
  const { add = {}, remove = [] } = (await change(drawings)) || {};

  const tree = [
    { path: DATA_PATH, mode: '100644', type: 'blob', content: `${JSON.stringify(drawings, null, 2)}\n` },
    ...remove.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
  ];
  for (const [path, blob] of Object.entries(add)) {
    const { sha } = await gh('/git/blobs', {
      method: 'POST',
      body: { content: await blobBase64(blob), encoding: 'base64' },
    });
    tree.push({ path, mode: '100644', type: 'blob', sha });
  }

  const baseTree = (await gh(`/git/commits/${parent}`)).tree.sha;
  const newTree = await gh('/git/trees', { method: 'POST', body: { base_tree: baseTree, tree } });
  const newCommit = await gh('/git/commits', {
    method: 'POST',
    body: { message, tree: newTree.sha, parents: [parent] },
  });
  await gh(`/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: { sha: newCommit.sha } });
  return drawings;
}

export function rawUrl(sitePath) {
  return `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/${REPO.branch}/public${sitePath}`;
}
