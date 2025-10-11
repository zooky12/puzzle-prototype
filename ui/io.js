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

export function exportLevel(state) {
  const blob = new Blob([serializeState(state)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='level.json'; a.click(); URL.revokeObjectURL(url);
}

export async function importLevel(file) {
  const text = await file.text();
  return deserializeState(text);
}
