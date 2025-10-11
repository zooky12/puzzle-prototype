// core/engine.js
// Motor de moviment: push en cadena, HeavyBox neutral/flip, FragileWall amb underTile
import { getTileTraits, isTrait } from './tiles.js';
import { EntityTypes, isPushable, isSolid } from './entities.js';
import {
  cloneState, findPlayer, entitiesAt, firstEntityAt,
  anyBoxAt, moveEntity, removeEntityAt
} from './state.js';

function inBounds(state, x, y) {
  return x>=0 && x<state.size.cols && y>=0 && y<state.size.rows;
}

function frontPos(x, y, dx, dy) { return { x: x + dx, y: y + dy }; }

function tileAt(state, x, y) { return state.base[y][x] || 'floor'; }

function effectEntityMoved(entity, from, to) {
  return { type:'entityMoved', entityType:entity.type, from, to };
}
function effectTileChanged(pos, from, to) {
  return { type:'tileChanged', pos, from, to };
}
function effectBoxFell(pos) {
  return { type:'boxFell', pos };
}

function isBlockedForPlayer(state, x, y) {
  const t = tileAt(state, x, y);
  if (isTrait(t,'isWallForPlayer')) return true;
  // parets fràgils són entitat, però ja les considerarem com a sòlides:
  const solidEnt = firstEntityAt(state, x, y, isSolid);
  return !!solidEnt;
}

function isBlockedForBox(state, x, y) {
  const t = tileAt(state, x, y);
  if (isTrait(t,'isWallForBox')) return true;
  const solidEnt = firstEntityAt(state, x, y, isSolid);
  return !!solidEnt; // box/fragileWall/heavyBox etc.
}

// Intenta empènyer una cadena de pushables (box/heavyBox). Retorna { ok, path:[entities], end:{x,y} }
function planPushChain(state, x, y, dx, dy) {
  const chain = [];
  let cx = x, cy = y;
  while (true) {
    const ent = firstEntityAt(state, cx, cy, isPushable);
    if (!ent) break;
    chain.push(ent);
    cx += dx; cy += dy;
    if (!inBounds(state, cx, cy)) return { ok:false };
    if (isBlockedForBox(state, cx, cy)) return { ok:false };
    if (!firstEntityAt(state, cx, cy, isPushable)) break;
  }
  // la darrera cel·la on vol entrar la cua de la cadena:
  const endX = chain.length ? chain[chain.length-1].x + dx : x;
  const endY = chain.length ? chain[chain.length-1].y + dy : y;
  // comprova forat a l’última cel·la
  const lastX = endX, lastY = endY;
  const t = tileAt(state, lastX, lastY);
  return { ok:true, chain, end:{x:lastX, y:lastY}, endIsHole: isTrait(t,'isHoleForBox') };
}

// Aplica una empenta de cadena (sense clonar). Retorna efectes.
function applyPushChain(state, chain, dx, dy) {
  // mou des del final cap al principi
  const effects = [];
  for (let i = chain.length - 1; i >= 0; i--) {
    const e = chain[i];
    const from = { x:e.x, y:e.y };
    const to = { x:e.x + dx, y:e.y + dy };
    moveEntity(state, e, to.x, to.y);
    effects.push(effectEntityMoved(e, from, to));
  }
  return effects;
}

// FragileWall: quan el player vola i toca un bloc fràgil, el trenca exposant underTile
function breakFragileIfNeeded(state, x, y, effects) {
  const frag = firstEntityAt(state, x, y, (e) => e.type === EntityTypes.fragileWall);
  if (!frag) return;
  const under = frag.underTile || 'floor';
  // eliminar entitat i canviar tile per "under"
  removeEntityAt(state, x, y, (e)=>e===frag);
  const fromTile = state.base[y][x] || 'floor';
  state.base[y][x] = under;
  effects.push(effectTileChanged({x,y}, fromTile, under));
}

function breakFragileTileIfNeeded(state, x, y, effects) {
  const t = tileAt(state, x, y);
  if (!isTrait(t,'isFragile')) return;
  const fromTile = t;
  const toTile = 'floor';
  state.base[y][x] = toTile;
  effects.push(effectTileChanged({x,y}, fromTile, toTile));
}

function resolveFlight(state, px, py, fdx, fdy, effects) {
  let cx = px, cy = py;
  while (true) {
    const nx = cx + fdx, ny = cy + fdy;
    if (!inBounds(state, nx, ny)) return { x:cx, y:cy, mode:'free' };

    // If next cell is fragile (entity or tile), break it and STOP at previous cell
    const nTPre = tileAt(state, nx, ny);
    const hasFragileEnt = firstEntityAt(state, nx, ny, (e)=> e.type === EntityTypes.fragileWall);
    const hasFragileTile = isTrait(nTPre, 'isFragile');
    if (hasFragileEnt || hasFragileTile) {
      breakFragileIfNeeded(state, nx, ny, effects);
      breakFragileTileIfNeeded(state, nx, ny, effects);
      return { x:cx, y:cy, mode:'free' };
    }

    // Re-read tile (no fragile just broken here)
    const nT = tileAt(state, nx, ny);

    if (isTrait(nT,'isNotFly')) return { x:cx, y:cy, mode:'free' };

    const boxFront = firstEntityAt(state, nx, ny, isPushable);
    if (isTrait(nT,'isStickOnFly')) {
      return boxFront
        ? { x:nx, y:ny, mode:'inbox', entryDir:{ dx:fdx, dy:fdy } }
        : { x:nx, y:ny, mode:'free' };
    }
    if (boxFront) {
      return { x:nx, y:ny, mode:'inbox', entryDir:{ dx:fdx, dy:fdy } };
    }

    cx = nx; cy = ny;
  }
}

function isSameDir(a, b) { return a && b && a.dx===b.dx && a.dy===b.dy && !(a.dx===0 && a.dy===0); }
function isZeroDir(d) { return !d || (d.dx===0 && d.dy===0); }

export function stepMove(state, { dx, dy }) {
  const s = cloneState(state);
  const effects = [];
  const player = findPlayer(s);
  if (!player) return { newState: s, effects, changed:false };

  const px = player.x, py = player.y;
  const inB = (x,y)=> inBounds(s,x,y);
  const target = frontPos(px, py, dx, dy);
  if (!inB(target.x, target.y)) return { newState:s, effects, changed:false };

  const targetTile = tileAt(s, target.x, target.y);

  // FREE MODE
  if (player.state.mode === 'free') {
    if (isTrait(targetTile,'isWallForPlayer')) return { newState:s, effects, changed:false };

    const pushableFront = firstEntityAt(s, target.x, target.y, isPushable);
    if (pushableFront) {
      // entra a la caixa
      player.state = { mode:'inbox', entryDir:{dx,dy} };
      const from = { x:px, y:py }, to = { x:target.x, y:target.y };
      player.x = to.x; player.y = to.y;
      effects.push(effectEntityMoved({type:'player'}, from, to));
      return { newState:s, effects, changed:true };
    } else {
      // block on solid entities (e.g., fragile wall entity)
      const solidFront = firstEntityAt(s, target.x, target.y, isSolid);
      if (solidFront) return { newState:s, effects, changed:false };
      // mou lliure
      const from = { x:px, y:py }, to = { x:target.x, y:target.y };
      player.x = to.x; player.y = to.y;
      effects.push(effectEntityMoved({type:'player'}, from, to));
      return { newState:s, effects, changed:true };
    }
  }

  // IN-BOX MODE
  // Mirar si hi ha caixa pesada o normal sota el player
  const under = firstEntityAt(s, px, py, isPushable);
  if (!under) {
    // estat inconsistent: passa a free
    player.state = { mode:'free', entryDir:{dx:0,dy:0} };
    return { newState:s, effects, changed:false };
  }

  // REVERS - flight (only if there is space: next tile is not a wall and not a solid entity)
  const solidFrontForFlight = firstEntityAt(s, target.x, target.y, isSolid);
  if (
    !isZeroDir(player.state.entryDir) &&
    dx === -player.state.entryDir.dx &&
    dy === -player.state.entryDir.dy &&
    !isTrait(targetTile,'isWallForPlayer') &&
    !solidFrontForFlight
  ) {
    const res = resolveFlight(s, px, py, dx, dy, effects);
    player.x = res.x; player.y = res.y;
    player.state = res.mode==='inbox' ? { mode:'inbox', entryDir:res.entryDir } : { mode:'free', entryDir:{dx:0,dy:0} };
    effects.push(effectEntityMoved({type:'player'}, {x:px,y:py}, {x:player.x,y:player.y}));
    return { newState:s, effects, changed:true };
  }

  // HeavyBox lògica especial
  const isHeavy = under.type === EntityTypes.heavyBox;
  const sameAsEntry = isSameDir({dx,dy}, player.state.entryDir);
  const entryZero = isZeroDir(player.state.entryDir);

  const blockedForBox = isBlockedForBox(s, target.x, target.y);
  const frontPushable = firstEntityAt(s, target.x, target.y, isPushable);

  if (isHeavy) {
    // Cas A: mateix sentit que entryDir (i entry != 0)
    if (sameAsEntry) {
      if (blockedForBox) return { newState:s, effects, changed:false };
      if (frontPushable) {
        // EXCEPCIÓ especial: si hi ha caixa al davant -> comportament normal push chain (sense neutralitzar)
        const plan = planPushChain(s, target.x, target.y, dx, dy);
        if (!plan.ok) return { newState:s, effects, changed:false };

        // si l’última cau en forat, elimina-la
        if (plan.endIsHole) {
          // treu la de davant de tot
          const last = plan.chain[plan.chain.length - 1];
          const lastFrom = { x:last.x, y:last.y };
          removeEntityAt(s, last.x, last.y, (e)=>e===last);
          effects.push(effectBoxFell({x:lastFrom.x + dx, y:lastFrom.y + dy}));
          // mou la resta
          const before = plan.chain.slice(0, -1);
          effects.push(...applyPushChain(s, before, dx, dy));
        } else {
          effects.push(...applyPushChain(s, plan.chain, dx, dy));
        }

        // mou la heavy
        const fromHb = { x:px, y:py }, toHb = { x:px+dx, y:py+dy };
        moveEntity(s, under, toHb.x, toHb.y);
        effects.push(effectEntityMoved(under, fromHb, toHb));

        // player es mou amb ella (manté entryDir)
        const pFrom = {x:px,y:py}, pTo = {x:toHb.x,y:toHb.y};
        player.x = pTo.x; player.y = pTo.y;
        effects.push(effectEntityMoved({type:'player'}, pFrom, pTo));
        return { newState:s, effects, changed:true };
      } else {
        // FRONT buit -> heavy es mou endavant i neutralitza entryDir (0,0)
        if (isTrait(targetTile,'isHoleForBox')) {
          // heavy cau
          const fromHb = {x:px,y:py};
          removeEntityAt(s, px, py, e => e===under);
          effects.push(effectBoxFell({x:target.x, y:target.y}));

          // player queda “inbox” a la posició final (neutral)
          const pFrom = {x:px,y:py};
          player.x = target.x; player.y = target.y;
          player.state.entryDir = { dx:0, dy:0 };
          effects.push(effectEntityMoved({type:'player'}, pFrom, {x:player.x,y:player.y}));
          return { newState:s, effects, changed:true };
        }

        const fromHb = {x:px,y:py}, toHb = {x:target.x,y:target.y};
        moveEntity(s, under, toHb.x, toHb.y);
        effects.push(effectEntityMoved(under, fromHb, toHb));

        const pFrom = {x:px,y:py}, pTo = {x:toHb.x,y:toHb.y};
        player.x = pTo.x; player.y = pTo.y;
        player.state.entryDir = { dx:0, dy:0 }; // neutralitzar
        effects.push(effectEntityMoved({type:'player'}, pFrom, pTo));
        return { newState:s, effects, changed:true };
      }
    }

    // Cas B: entryDir == (0,0) -> el següent moviment defineix oposat
    if (entryZero) {
      if (blockedForBox) return { newState:s, effects, changed:false };

      if (frontPushable) {
        const plan = planPushChain(s, target.x, target.y, dx, dy);
        if (!plan.ok) return { newState:s, effects, changed:false };

        if (plan.endIsHole) {
          const last = plan.chain[plan.chain.length - 1];
          const lastFrom = { x:last.x, y:last.y };
          removeEntityAt(s, last.x, last.y, (e)=>e===last);
          effects.push(effectBoxFell({x:lastFrom.x + dx, y:lastFrom.y + dy}));
          const before = plan.chain.slice(0, -1);
          effects.push(...applyPushChain(s, before, dx, dy));
        } else {
          effects.push(...applyPushChain(s, plan.chain, dx, dy));
        }

        const fromHb = {x:px,y:py}, toHb = {x:px+dx, y:py+dy};
        moveEntity(s, under, toHb.x, toHb.y);
        effects.push(effectEntityMoved(under, fromHb, toHb));

        const pFrom = {x:px,y:py}, pTo = {x:toHb.x,y:toHb.y};
        player.x = pTo.x; player.y = pTo.y;
        player.state.entryDir = { dx:-dx, dy:-dy };
        effects.push(effectEntityMoved({type:'player'}, pFrom, pTo));
        return { newState:s, effects, changed:true };
      }

      // estableix entryDir a l’oposat d’aquest moviment
      player.state.entryDir = { dx:-dx, dy:-dy };
      if (isTrait(targetTile,'isHoleForBox')) {
        // heavy cau
        removeEntityAt(s, px, py, e=>e===under);
        effects.push(effectBoxFell({x:target.x,y:target.y}));
        const pFrom = {x:px,y:py};
        player.x = target.x; player.y = target.y;
        effects.push(effectEntityMoved({type:'player'}, pFrom, {x:player.x,y:player.y}));
        return { newState:s, effects, changed:true };
      }
      const fromHb = {x:px,y:py}, toHb = {x:target.x,y:target.y};
      moveEntity(s, under, toHb.x, toHb.y);
      effects.push(effectEntityMoved(under, fromHb, toHb));
      const pFrom = {x:px,y:py}, pTo = {x:toHb.x,y:toHb.y};
      player.x = pTo.x; player.y = pTo.y;
      effects.push(effectEntityMoved({type:'player'}, pFrom, pTo));
      return { newState:s, effects, changed:true };
    }

    // Cas C: resta de moviments -> comportament normal
  }

  // COMPORTAMENT NORMAL (val per box i heavy quan no cau en casos A/B)
  if (blockedForBox) return { newState:s, effects, changed:false };

  if (frontPushable) {
    const plan = planPushChain(s, target.x, target.y, dx, dy);
    if (!plan.ok) return { newState:s, effects, changed:false };

    if (plan.endIsHole) {
      const last = plan.chain[plan.chain.length - 1];
      const lastFrom = { x:last.x, y:last.y };
      removeEntityAt(s, last.x, last.y, (e)=>e===last);
      effects.push(effectBoxFell({x:lastFrom.x + dx, y:lastFrom.y + dy}));
      const before = plan.chain.slice(0, -1);
      effects.push(...applyPushChain(s, before, dx, dy));
    } else {
      effects.push(...applyPushChain(s, plan.chain, dx, dy));
    }

    // mou la caixa “sota el player”
    const fromB = {x:px,y:py}, toB = {x:px+dx, y:py+dy};
    moveEntity(s, under, toB.x, toB.y);
    effects.push(effectEntityMoved(under, fromB, toB));

    const pFrom = {x:px,y:py}, pTo = {x:toB.x,y:toB.y};
    player.x = pTo.x; player.y = pTo.y;
    // entryDir es manté tal qual
    effects.push(effectEntityMoved({type:'player'}, pFrom, pTo));
    return { newState:s, effects, changed:true };
  } else {
    if (isTrait(targetTile,'isHoleForBox')) {
      // la caixa sota el player cau
      removeEntityAt(s, px, py, e=>e===under);
      effects.push(effectBoxFell({x:target.x,y:target.y}));
      const pFrom = {x:px,y:py};
      player.x = target.x; player.y = target.y;
      effects.push(effectEntityMoved({type:'player'}, pFrom, {x:player.x,y:player.y}));
      return { newState:s, effects, changed:true };
    }
    const fromB = {x:px,y:py}, toB = {x:target.x, y:target.y};
    moveEntity(s, under, toB.x, toB.y);
    effects.push(effectEntityMoved(under, fromB, toB));

    const pFrom = {x:px,y:py}, pTo = {x:toB.x,y:toB.y};
    player.x = pTo.x; player.y = pTo.y;
    effects.push(effectEntityMoved({type:'player'}, pFrom, pTo));
    return { newState:s, effects, changed:true };
  }
}
