// ui/build.js
import { cloneState, addRow, removeRow, addColumn, removeColumn, compactState } from '../core/state.js';
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
        .forEach(btn=> { btn.classList.remove('active'); btn.setAttribute('aria-pressed','false'); });
      b.classList.add('active');
      b.setAttribute('aria-pressed','true');
    });
  });

  // Botons entitats
  document.querySelectorAll('.build-controls button[data-entity]').forEach(b=>{
    b.addEventListener('click', ()=>{
      if (!isBuildMode()) return;
      currentEntityType = b.dataset.entity;
      document.querySelectorAll('.build-controls button[data-tile],.build-controls button[data-entity]')
        .forEach(btn=> { btn.classList.remove('active'); btn.setAttribute('aria-pressed','false'); });
      b.classList.add('active');
      b.setAttribute('aria-pressed','true');
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

  function applyResize(handler) {
    if (!isBuildMode()) return;
    const current = getState();
    const next = handler(current);
    if (!next || next.size.cols < 1 || next.size.rows < 1) return;
    onSnapshot();
    setState(next);
    onModified();
    requestRedraw();
  }

  const compactBtn = document.getElementById('compact-grid');
  if (compactBtn) compactBtn.addEventListener('click', () => applyResize((s)=> compactState(s)));

  // Directional resize pad with Add/Remove mode
  const addToggle = document.getElementById('resize-add');
  const removeToggle = document.getElementById('resize-remove');
  const pad = document.getElementById('dir-pad');
  const dirUp = document.getElementById('dir-up');
  const dirDown = document.getElementById('dir-down');
  const dirLeft = document.getElementById('dir-left');
  const dirRight = document.getElementById('dir-right');

  let currentResizeOp = null; // 'add' | 'remove' | null
  function updatePad() {
    if (!pad) return;
    const show = !!currentResizeOp;
    pad.classList.toggle('hidden', !show);
    pad.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (addToggle) {
      addToggle.classList.toggle('active', currentResizeOp === 'add');
      addToggle.setAttribute('aria-pressed', currentResizeOp === 'add' ? 'true' : 'false');
    }
    if (removeToggle) {
      removeToggle.classList.toggle('active', currentResizeOp === 'remove');
      removeToggle.setAttribute('aria-pressed', currentResizeOp === 'remove' ? 'true' : 'false');
    }
  }

  function setResizeOp(op) {
    currentResizeOp = (currentResizeOp === op ? null : op);
    updatePad();
  }

  if (addToggle) addToggle.addEventListener('click', () => { if (isBuildMode()) setResizeOp('add'); });
  if (removeToggle) removeToggle.addEventListener('click', () => { if (isBuildMode()) setResizeOp('remove'); });

  function doResize(dir) {
    if (!isBuildMode() || !currentResizeOp) return;
    if (currentResizeOp === 'add') {
      if (dir === 'up') return applyResize((s)=> addRow(s, 'top'));
      if (dir === 'down') return applyResize((s)=> addRow(s, 'bottom'));
      if (dir === 'left') return applyResize((s)=> addColumn(s, 'left'));
      if (dir === 'right') return applyResize((s)=> addColumn(s, 'right'));
    } else if (currentResizeOp === 'remove') {
      if (dir === 'up') return applyResize((s)=> removeRow(s, 'top'));
      if (dir === 'down') return applyResize((s)=> removeRow(s, 'bottom'));
      if (dir === 'left') return applyResize((s)=> removeColumn(s, 'left'));
      if (dir === 'right') return applyResize((s)=> removeColumn(s, 'right'));
    }
  }

  if (dirUp) dirUp.addEventListener('click', () => doResize('up'));
  if (dirDown) dirDown.addEventListener('click', () => doResize('down'));
  if (dirLeft) dirLeft.addEventListener('click', () => doResize('left'));
  if (dirRight) dirRight.addEventListener('click', () => doResize('right'));
}
