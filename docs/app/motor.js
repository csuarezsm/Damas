/* Damas — motor de la app (IT Canarias)
   © 2026 IT Canarias. Todos los derechos reservados.
   Búsqueda alfa-beta (PVS) con profundización iterativa, tabla de transposiciones, jugadas asesinas
   y quiescencia de capturas (en damas son obligatorias: mientras quede una captura se sigue buscando).
   Las puntuaciones van en centésimas de peón y desde el bando que juega. */
(function (root) {
'use strict';
const D = root.Damas || (typeof require !== 'undefined' ? require('./damas.js') : null);
const { MAN, KING, WHITE, SQS, LONG_DIAG } = D;
const INF = 1e9, WIN = 30000, WIN_BOUND = 29000;
const V_MAN = 100, V_KING = 330;

/* ---------- Evaluación ---------- */
const ADV = [0, 0, 4, 8, 13, 20, 30, 0];          // peón por fila avanzada (fila 0 = la suya)
const CENTER = new Set(['c4', 'e4', 'd5', 'f5', 'b5', 'g4'].map(D.sqParse).filter(D.playable));
const BACK = [[], []]; for (const s of SQS) { if ((s >> 4) === 0) BACK[0].push(s); if ((s >> 4) === 7) BACK[1].push(s); }
function evaluate(pos) {
  const b = pos.b;
  let sc = [0, 0], men = [0, 0], kings = [0, 0];
  for (const s of SQS) {
    const p = b[s]; if (!p) continue;
    const c = p >> 3;
    if ((p & 7) === KING) {
      kings[c]++; sc[c] += V_KING;
      if (LONG_DIAG.has(s)) sc[c] += 18;
    } else {
      men[c]++;
      const r = c === WHITE ? (s >> 4) : 7 - (s >> 4);
      sc[c] += V_MAN + ADV[r];
      if (CENTER.has(s)) sc[c] += 5;
      // peón en el borde: algo menos útil
      if ((s & 7) === 0 || (s & 7) === 7) sc[c] -= 3;
    }
  }
  // guardar la última fila mientras el rival no tenga damas
  for (const c of [0, 1]) if (!kings[1 - c] && men[1 - c] >= 3) for (const s of BACK[c]) { const p = b[s]; if (p && (p >> 3) === c && (p & 7) === MAN) sc[c] += 7; }
  let v = sc[0] - sc[1];
  // con ventaja, cambiar piezas acerca la victoria
  const tot = men[0] + men[1] + kings[0] + kings[1];
  if (Math.abs(v) > 80) v += Math.sign(v) * (24 - tot) * 4;
  // final de solo damas: sin peones, una dama de ventaja apenas gana; dos o más sí
  if (!men[0] && !men[1]) { const d = kings[0] - kings[1]; if (Math.abs(d) <= 1 && Math.min(kings[0], kings[1]) >= 1) v = Math.round(v / 6); }
  return pos.turn === WHITE ? v : -v;
}

/* ---------- Tabla de transposiciones ---------- */
const TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
const ttKey = new Uint32Array(TT_SIZE), ttMove = new Array(TT_SIZE), ttScore = new Int32Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE), ttFlag = new Uint8Array(TT_SIZE);
function ttClear() { ttKey.fill(0); ttMove.fill(undefined); ttDepth.fill(0); ttFlag.fill(0); }
const toTT = (s, ply) => s > WIN_BOUND ? s + ply : s < -WIN_BOUND ? s - ply : s;
const fromTT = (s, ply) => s > WIN_BOUND ? s - ply : s < -WIN_BOUND ? s + ply : s;

/* ---------- Búsqueda ---------- */
function isDrawish(pos) {
  if (pos.quiet >= 40 || pos.k31 >= 24) return true;
  // repetición (basta con una: en la búsqueda se trata como tablas)
  const h = pos.hist, k = h[h.length - 1];
  for (let i = h.length - 3, n = 0; i >= 0 && n < pos.quiet; i -= 2, n += 2) if (h[i] === k) return true;
  return false;
}
function onlyKingsDraw(pos) {
  const n = pos.counts();
  return !n[0][MAN] && !n[1][MAN] && n[0][KING] === 1 && n[1][KING] === 1;
}
function orderMoves(pos, list, ttm, S, ply) {
  const k1 = S.killers[ply * 2], k2 = S.killers[ply * 2 + 1];
  for (const m of list) {
    const u = pos.uci(m);
    m.o = u === ttm ? 1e7 : m.caps.length ? 1e6 + m.caps.length * 1000 + m.kc * 300 : (m.promo ? 9e5 : 0) + (u === k1 ? 8e5 : u === k2 ? 7e5 : 0) + (S.hist[u] || 0);
  }
  list.sort((a, b) => b.o - a.o);
}
function quiesce(pos, alpha, beta, ply, S) {
  S.nodes++;
  const caps = pos.legal();
  if (!caps.length) return -WIN + ply;
  if (!caps[0].caps.length) {
    const st = evaluate(pos);
    return st;
  }
  if (ply > 60) return evaluate(pos);
  caps.sort((a, b) => b.caps.length - a.caps.length || b.kc - a.kc);
  let best = -INF;
  for (const m of caps) {
    pos.make(m);
    const v = -quiesce(pos, -beta, -alpha, ply + 1, S);
    pos.unmake();
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}
class Stop extends Error {}
function search(pos, depth, alpha, beta, ply, S, pv) {
  if ((++S.nodes & 1023) === 0 && (Date.now() > S.deadline || S.nodes > S.maxNodes)) throw new Stop();
  if (ply && (isDrawish(pos) || onlyKingsDraw(pos))) return 0;
  const list = pos.legal();
  if (!list.length) return -WIN + ply;
  // una sola jugada posible (habitual con capturas obligatorias): no gasta profundidad
  if (list.length === 1 && ply) depth++;
  if (depth <= 0) {
    if (list[0].caps.length) return quiesce(pos, alpha, beta, ply, S);
    return evaluate(pos);
  }
  const idx = pos.h1 & TT_MASK;
  let ttm = null;
  if (ttKey[idx] === pos.h2 && ttFlag[idx]) {
    ttm = ttMove[idx];
    if (ttDepth[idx] >= depth && ply) {
      const s = fromTT(ttScore[idx], ply), f = ttFlag[idx];
      if (f === 1 || (f === 2 && s >= beta) || (f === 3 && s <= alpha)) return s;
    }
  }
  orderMoves(pos, list, ttm, S, ply);
  const a0 = alpha;
  let best = -INF, bestU = null, first = true;
  for (const m of list) {
    pos.make(m);
    let v;
    if (first) v = -search(pos, depth - 1, -beta, -alpha, ply + 1, S);
    else {
      const red = !m.caps.length && !m.promo && depth >= 3 && list.length > 4 && m.o < 7e5 ? 1 : 0;
      v = -search(pos, depth - 1 - red, -alpha - 1, -alpha, ply + 1, S);
      if (v > alpha && (red || v < beta)) v = -search(pos, depth - 1, -beta, -alpha, ply + 1, S);
    }
    pos.unmake();
    first = false;
    if (v > best) { best = v; bestU = pos.uci(m); }
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (!m.caps.length) {
        const u = pos.uci(m);
        if (S.killers[ply * 2] !== u) { S.killers[ply * 2 + 1] = S.killers[ply * 2]; S.killers[ply * 2] = u; }
        S.hist[u] = (S.hist[u] || 0) + depth * depth;
      }
      break;
    }
  }
  ttKey[idx] = pos.h2; ttMove[idx] = bestU; ttScore[idx] = toTT(best, ply); ttDepth[idx] = depth;
  ttFlag[idx] = best >= beta ? 2 : best <= a0 ? 3 : 1;
  return best;
}
// Mejor jugada con profundización iterativa. opts: { timeMs, depth, nodes }
function think(pos, opts) {
  opts = opts || {};
  const list = pos.legal();
  if (!list.length) return { move: null, score: -WIN, depth: 0 };
  const S = { nodes: 0, deadline: Date.now() + (opts.timeMs || 1000), maxNodes: opts.nodes || Infinity, killers: [], hist: {}, base: pos.stack.length };
  let best = { move: pos.uci(list[0]), score: 0, depth: 0 };
  if (list.length === 1 && !opts.analyse) return Object.assign(best, { score: evaluate(pos), forced: true });
  const maxD = opts.depth || 40;
  for (let d = 1; d <= maxD; d++) {
    try {
      let alpha = -INF, beta = INF, bestU = null, bs = -INF;
      const idx = pos.h1 & TT_MASK, ttm = ttKey[idx] === pos.h2 ? ttMove[idx] : best.move;
      orderMoves(pos, list, ttm, S, 0);
      let first = true;
      for (const m of list) {
        pos.make(m);
        let v;
        if (first) v = -search(pos, d - 1, -beta, -alpha, 1, S);
        else { v = -search(pos, d - 1, -alpha - 1, -alpha, 1, S); if (v > alpha) v = -search(pos, d - 1, -beta, -alpha, 1, S); }
        pos.unmake();
        first = false;
        if (v > bs) { bs = v; bestU = pos.uci(m); }
        if (v > alpha) alpha = v;
      }
      best = { move: bestU, score: bs, depth: d, nodes: S.nodes };
      ttKey[idx] = pos.h2; ttMove[idx] = bestU; ttScore[idx] = bs; ttDepth[idx] = d; ttFlag[idx] = 1;
      if (Math.abs(bs) > WIN_BOUND && d > 3) break;
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
      while (pos.stack.length > S.base) pos.unmake();
      break;
    }
  }
  return best;
}
// Puntuación de cada jugada a poca profundidad (para los niveles con azar)
function rootScores(pos, depth, opts) {
  const S = { nodes: 0, deadline: Date.now() + 5000, maxNodes: (opts && opts.nodes) || Infinity, killers: [], hist: {}, base: pos.stack.length };
  const out = [];
  for (const m of pos.legal()) {
    pos.make(m);
    let v;
    try { v = -search(pos, depth - 1, -INF, INF, 1, S); } catch (e) { v = 0; }
    while (pos.stack.length > S.base) pos.unmake();
    out.push({ m, sc: v });
  }
  return out;
}

/* ---------- Niveles ---------- */
const LEVELS = [
  null,
  // Calibrados con partidas entre niveles vecinos (tools/calibrar-niveles.js). El Elo es una estimación para la clasificación.
  { name: 'Principiante', elo: 600,  depth: 1, noise: 170, blunder: 0.18, maxLoss: 400 },
  { name: 'Aficionado',   elo: 800,  depth: 2, noise: 90,  blunder: 0.06, maxLoss: 250 },
  { name: 'Intermedio',   elo: 950,  depth: 3, noise: 50,  blunder: 0.03, maxLoss: 160 },
  { name: 'Avanzado',     elo: 1150, depth: 5, noise: 30,  blunder: 0.015, maxLoss: 110 },
  { name: 'Experto',      elo: 1450, time: 400, depth: 9, noise: 10 },
  { name: 'Maestro',      elo: 1650, time: 2200 },
];
function levelMove(pos, level, moves, opts) {
  opts = opts || {};
  const L = LEVELS[level] || LEVELS[3];
  const rnd = opts.rnd || Math.random;
  const legal = pos.legal(); if (!legal.length) return null;
  if (legal.length === 1) return { move: pos.uci(legal[0]), score: 0, depth: 0, forced: true };
  if (L.time) {
    const r = think(pos, { timeMs: opts.timeMs != null ? opts.timeMs : L.time, depth: L.depth, nodes: opts.nodes });
    if (L.noise && r && Math.abs(r.score) < WIN_BOUND) {
      const sc = rootScores(pos, 3, {});
      const mx = sc.reduce((a, x) => Math.max(a, x.sc), -INF);
      const top = sc.filter(x => x.sc >= mx - L.noise);
      if (top.length > 1 && rnd() < 0.25) { const pick = top[Math.floor(rnd() * top.length)]; return { move: pos.uci(pick.m), score: pick.sc, depth: 3 }; }
    }
    return r;
  }
  if (L.blunder && rnd() < L.blunder) {
    // despiste humano: una jugada peor de lo debido, pero sin perder más de lo que admite el nivel
    const sc = rootScores(pos, 2, {});
    const best = sc.reduce((a, x) => Math.max(a, x.sc), -INF);
    const cand = sc.filter(x => best - x.sc > 0 && best - x.sc <= L.maxLoss);
    if (cand.length) { const pick = cand[Math.floor(rnd() * cand.length)]; return { move: pos.uci(pick.m), score: pick.sc, depth: 2, blunder: true }; }
  }
  const sc = rootScores(pos, L.depth, { nodes: opts.nodes });
  let best = null, bv = -Infinity;
  for (const x of sc) {
    const win = Math.abs(x.sc) > WIN_BOUND;
    const v = x.sc + (win ? 0 : (rnd() * 2 - 1) * L.noise);
    if (v > bv) { bv = v; best = x; }
  }
  return { move: pos.uci(best.m), score: best.sc, depth: L.depth };
}

/* ---------- Problemas: «juegan y ganan» ---------- */
// Material de un bando menos el del otro (peón 1, dama 3)
function material(pos, c) { let v = 0; for (const s of SQS) { const p = pos.b[s]; if (p) v += ((p & 7) === KING ? 3 : 1) * ((p >> 3) === c ? 1 : -1); } return v; }
// Material tras resolver las capturas obligatorias pendientes (atacante maximiza, defensor minimiza)
function qMat(pos, att) {
  const L = pos.legal();
  if (!L.length) return pos.turn === att ? -99 : 99;
  if (!L[0].caps.length) return material(pos, att);
  let best = pos.turn === att ? -Infinity : Infinity;
  for (const m of L) { pos.make(m); const v = qMat(pos, att); pos.unmake(); if (pos.turn === att ? v > best : v < best) best = v; }
  return best;
}
// ¿Puede el atacante cumplir el objetivo en n jugadas suyas como máximo?
// goal: { win: true } (que el rival no pueda mover) o { t: material mínimo }. memo: Map
function reach(pos, n, att, goal, memo) {
  const key = pos.key() + ':' + n;
  if (memo && memo.has(key)) return memo.get(key);
  let r;
  const L = pos.legal();
  if (pos.turn !== att) {
    if (!L.length) r = true;
    else if (n === 0) r = goal.win ? false : qMat(pos, att) >= goal.t;
    else { r = true; for (const m of L) { pos.make(m); const ok = reach(pos, n, att, goal, memo); pos.unmake(); if (!ok) { r = false; break; } } }
  } else {
    if (!L.length || n === 0) r = false;
    else { r = false; for (const m of L) { pos.make(m); const ok = reach(pos, n - 1, att, goal, memo); pos.unmake(); if (ok) { r = true; break; } } }
  }
  if (memo) memo.set(key, r);
  return r;
}
// Jugadas del atacante que cumplen el objetivo en n
function winningMoves(pos, n, goal) {
  const att = pos.turn, memo = new Map(), out = [];
  for (const m of pos.legal()) { pos.make(m); if (reach(pos, n - 1, att, goal, memo)) out.push(m); pos.unmake(); }
  return out;
}
// Mejor defensa: la que más tarda en perder; a igualdad, la que mejor puntúa el motor
function bestDefense(pos, n, att, goal) {
  const L = pos.legal(); if (!L.length) return null;
  const memo = new Map();
  let best = null, bk = -1;
  for (const m of L) {
    pos.make(m);
    let need = n + 1; for (let j = 0; j <= n; j++) if (reach(pos, j, att, goal, memo)) { need = j; break; }
    const sc = -evaluate(pos);
    pos.unmake();
    const v = need * 100000 + sc;
    if (v > bk) { bk = v; best = m; }
  }
  return best ? { move: pos.uci(best) } : null;
}

/* ---------- Análisis ---------- */
function classify(loss, isBest) {
  if (isBest) return 'mejor';
  if (loss >= 250) return 'grave';
  if (loss >= 120) return 'error';
  if (loss >= 50) return 'imprecision';
  return 'buena';
}
function capScore(s) { if (s > WIN_BOUND) return 2000; if (s < -WIN_BOUND) return -2000; return Math.max(-1500, Math.min(1500, s)); }

/* ---------- Peticiones de la app (Web Worker o, si no hay, el propio hilo) ---------- */
function handle(d, progress) {
  const pos = D.replay(d.moves || [], d.startFen).pos;
  if (d.op === 'move') return levelMove(pos, d.level, d.moves, { startFen: d.startFen, timeMs: d.timeMs, nodes: d.nodes });
  if (d.op === 'best') return think(pos, { timeMs: d.timeMs || 600, depth: d.depth, analyse: true });
  if (d.op === 'analyse') {
    ttClear();
    const all = D.replay(d.moves || [], d.startFen);
    const p = new D.Position(d.startFen || D.START_FEN);
    const out = [], n = all.moves.length;
    for (let i = 0; i <= n; i++) {
      const st = D.status(p);
      if (st.over) out.push({ best: null, score: st.result === '1/2-1/2' ? 0 : -WIN, over: true });
      else { const r = think(p, { timeMs: d.timeMs || 250, depth: d.depth || 30, analyse: true }); out.push({ best: r.move, score: r.score, depth: r.depth }); }
      if (progress) progress((i + 1) / (n + 1));
      if (i < n) { p.make(p.fromUci(all.moves[i])); p.stack.length = 0; }
    }
    return out;
  }
  // Problemas: goal = { win } o { t }, att = bando atacante, n = jugadas del atacante que quedan
  if (d.op === 'mate') { const w = winningMoves(pos, d.n, d.goal); return w.length ? pos.uci(w[0]) : null; }
  if (d.op === 'forced') return reach(pos, d.n, d.att, d.goal, new Map());
  if (d.op === 'defense') return bestDefense(pos, d.n, d.att, d.goal);
  throw new Error('Operación desconocida');
}

const API = { handle, evaluate, think, levelMove, rootScores, material, qMat, reach, winningMoves, bestDefense, classify, capScore, ttClear, LEVELS, WIN, WIN_BOUND, MATE: WIN, MATE_BOUND: WIN_BOUND };
root.Motor = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this);
