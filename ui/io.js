// ui/io.js
import { deserializeState, serializeState } from '../core/state.js';

export async function loadLevelList() {
  try {
    const res = await fetch('levels/index.json', { cache:'no-store' });
    if (!res.ok) throw new Error(res.statusText);
    const list = await res.json();
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function loadLevel(name) {
  const res = await fetch('levels/' + encodeURIComponent(name), { cache:'no-store' });
  if (!res.ok) throw new Error(res.statusText);
  const data = await res.json();
  return deserializeState(data);
}

// World-based loading (new). Fallbacks keep old behavior if worlds.json is missing.
export async function loadWorldList() {
  try {
    const res = await fetch('levels/worlds.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.statusText);
    const worlds = await res.json();
    // Expecting an array of folder names (strings)
    return Array.isArray(worlds) ? worlds : [];
  } catch {
    // Fallback: no worlds.json -> single implicit world using flat index.json
    const flat = await loadLevelList();
    if (flat.length) return ['.']; // "." represents root levels folder
    return [];
  }
}

export async function loadLevelListForWorld(world) {
  // world can be '.' to refer to flat root
  if (world === '.' || world === '' || world == null) {
    return loadLevelList();
  }
  try {
    const url = `levels/${encodeURIComponent(world)}/index.json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.statusText);
    const list = await res.json();
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function loadWorldLevel(world, name) {
  if (world === '.' || world === '' || world == null) {
    return loadLevel(name);
  }
  const res = await fetch(`levels/${encodeURIComponent(world)}/${encodeURIComponent(name)}`, { cache:'no-store' });
  if (!res.ok) throw new Error(res.statusText);
  const data = await res.json();
  return deserializeState(data);
}

export function exportLevel(state, name) {
  const blob = new Blob([serializeState(state)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = (typeof name === 'string' && name.trim()) ? name.trim() : 'level.json';
  a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}

export async function importLevel(file) {
  const text = await file.text();
  return deserializeState(text);
}
