// ui/build.js
import { cloneState } from '../core/state.js';
import { EntityTypes } from '../core/entities.js';

const pushableTypes = new Set([EntityTypes.box, EntityTypes.heavyBox]);

export function setupBuildUI({ canvasEl, getState, setState, onModified, onSnapshot, requestRedraw, isBuildMode }) {
  let currentPaintTile = 'wall';
  let currentEntityType = null;
  let mouseDown = false;

  // Botons tiles
  document.querySelectorAll('.build-controls button[data-tile]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if (!isBuildMode()) return;
      currentEntityType = null;
      currentPaintTile = b.dataset.tile;
      document.querySelectorAll('.build-controls button[data-tile],.build-controls button[data-entity]')
        .forEach(btn=> btn.style.outline='');
      b.style.outline = '2px solid #888';
    });
  });

  // Botons entitats
  document.querySelectorAll('.build-controls button[data-entity]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if (!isBuildMode()) return;
      currentEntityType = b.dataset.entity;
      document.querySelectorAll('.build-controls button[data-tile],.build-controls button[data-entity]')
        .forEach(btn=> btn.style.outline='');
      b.style.outline = '2px solid #888';
    });
  });

  document.getElementById('fill-floor').addEventListener('click', ()=>{
    if (!isBuildMode()) return;
    const s = cloneState(getState());
    for(let y=0;y<s.size.rows;y++) for(let x=0;x<s.size.cols;x++) s.base[y][x] = 'floor';
    onSnapshot(); setState(s); onModified(); requestRedraw();
  });

  document.getElementById('clear-btn').addEventListener('click', ()=>{
    if (!isBuildMode()) return;
    if (!confirm('Clear map?')) return;
    const s = cloneState(getState());
    for(let y=0;y<s.size.rows;y++) for(let x=0;x<s.size.cols;x++) s.base[y][x] = 'floor';
    s.entities = [];
    onSnapshot(); setState(s); onModified(); requestRedraw();
  });

  function gridPos(e){
    const rect = canvasEl.getBoundingClientRect();
    const cols = getState().size.cols;
    const tile = Math.floor(canvasEl.width / cols);
    const x = Math.floor((e.clientX - rect.left)/tile);
    const y = Math.floor((e.clientY - rect.top)/tile);
    return {x,y};
  }
  function inB(s,x,y){ return x>=0 && x<s.size.cols && y>=0 && y<s.size.rows; }

  function toggleEntity(s, x, y, type) {
    const idx = s.entities.findIndex(e => e.x===x && e.y===y && e.type===type);
    if (idx>=0) {
      s.entities.splice(idx,1);
      return;
    }

    if (type === EntityTypes.player) {
      s.entities = s.entities.filter(e=>e.type!==EntityTypes.player);
      s.entities.push({ type, x, y, state:{ mode:'free', entryDir:{dx:0,dy:0} } });
      return;
    }

    if (pushableTypes.has(type)) {
      s.entities = s.entities.filter(e => !(e.x===x && e.y===y && pushableTypes.has(e.type)));
    }

    s.entities.push({ type, x, y });
  }

  function paintAt(e){
    if (!isBuildMode()) return;         // <-- bloqueja en play mode
    const s = cloneState(getState());
    const {x,y} = gridPos(e);
    if (!inB(s,x,y)) return;

    if (currentEntityType) {
      onSnapshot();
      toggleEntity(s, x, y, currentEntityType);
      setState(s); onModified(); requestRedraw();
      return;
    }

    onSnapshot();
    s.base[y][x] = currentPaintTile;
    setState(s); onModified(); requestRedraw();
  }

  function dragAt(e){
    if (!isBuildMode()) return;         // <-- bloqueja en play mode
    if (!mouseDown) return;
    const s = cloneState(getState());
    const {x,y} = gridPos(e);
    if (!inB(s,x,y)) return;
    if (currentEntityType) return; // no drag d’entitats

    s.base[y][x] = currentPaintTile;
    setState(s);
    requestRedraw();
  }

  canvasEl.addEventListener('mousedown', (e)=>{ if (!isBuildMode()) return; mouseDown = true; paintAt(e); });
  canvasEl.addEventListener('mousemove', dragAt);
  canvasEl.addEventListener('mouseup', ()=> mouseDown=false);
  canvasEl.addEventListener('mouseleave', ()=> mouseDown=false);
}
