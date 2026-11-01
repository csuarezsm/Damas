// Genera problemas «juegan y ganan» a partir de partidas del motor contra sí mismo.
// Uso: node tools/generar-problemas.js <partidas> <semilla> > candidatos.json
// Cada candidato tiene solución única en la primera jugada y se comprueba con búsqueda completa.
global.Damas = require('../www/damas.js');
const D = global.Damas, M = require('../www/motor.js');
const [games = 40, seed0 = 1] = process.argv.slice(2).map(Number);
let seed = seed0 * 2654435761 >>> 0;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };

const settled = (p, att) => p.turn !== att && (!p.hasLegal() || !p.legal()[0].caps.length);
// Línea de solución: el atacante juega una jugada ganadora (la que antes cumple el objetivo) y la defensa, la mejor
function solutionLine(pos, nMax, goal) {
  const p = pos.clone(), att = p.turn, line = [];
  let attMoves = 0;
  for (let guard = 0; guard < 40; guard++) {
    const st = D.status(p);
    if (st.over) break;
    if (p.turn === att) {
      let pick = null;
      for (let k = 1; k <= nMax && !pick; k++) { const w = M.winningMoves(p, k, goal); if (w.length) pick = w[0]; }
      if (!pick) return null;
      line.push(p.uci(pick)); p.make(pick); attMoves++;
    } else {
      if (goal.win ? false : settled(p, att) && M.material(p, att) >= goal.t) break;
      const d = M.bestDefense(p, nMax, att, goal); if (!d) break;
      line.push(d.move); p.make(p.fromUci(d.move));
    }
  }
  const st = D.status(p);
  const okEnd = goal.win ? st.over && st.result !== '1/2-1/2' : (st.over && st.result !== '1/2-1/2') || M.material(p, att) >= goal.t;
  return okEnd ? { line, n: attMoves } : null;
}
function candidate(pos) {
  const L = pos.legal();
  if (L.length < 2) return null;
  const att = pos.turn;
  const n = pos.counts(), pieces = n[0][1] + n[0][2] + n[1][1] + n[1][2];
  const base = M.material(pos, att);
  // ¿ya está todo ganado? (ventaja enorme): no interesa
  if (Math.abs(base) > 2) return null;
  if (pos.mustCapture()) return null;           // empieza con una captura obligatoria: poco interesante
  const goals = [];
  if (pieces <= 12) goals.push({ kind: 'win', goal: { win: true }, g: 0 });
  goals.push({ kind: 'mat', goal: { t: base + 3 }, g: 3 }, { kind: 'mat', goal: { t: base + 2 }, g: 2 });
  for (const G of goals) {
    for (let k = 1; k <= 3; k++) {
      const w = M.winningMoves(pos, k, G.goal);
      if (!w.length) continue;
      if (w.length > 1) break;                 // varias soluciones: no sirve
      const m = w[0];
      if (L.every(x => x.caps.length)) break;   // solo capturas obligatorias: demasiado fácil
      // sin ventaja «gratis»: con una jugada cualquiera no se gana lo mismo
      const sol = solutionLine(pos, k + 2, G.goal);
      if (!sol || sol.line[0] !== pos.uci(m)) break;
      const sacrifice = !m.caps.length;
      let r = 850 + 230 * (sol.n - 1) + (sacrifice ? 120 : 0) + (G.kind === 'win' ? 120 : 0) + (L.length >= 8 ? 80 : 0) + (k >= 3 ? 120 : 0);
      r = Math.max(800, Math.min(1950, Math.round(r / 10) * 10));
      return { fen: pos.fen(), n: sol.n, sol: sol.line, r, goal: G.kind, g: G.g, depth: k };
    }
  }
  return null;
}
const out = [];
for (let gi = 0; gi < games; gi++) {
  const p = new D.Position();
  for (let k = 0; k < 3; k++) { const L = p.legal(); p.make(L[Math.floor(rnd() * L.length)]); }
  const lv = [2 + Math.floor(rnd() * 3), 2 + Math.floor(rnd() * 3)];
  const found = new Set();
  for (let ply = 0; ply < 200; ply++) {
    if (D.status(p).over) break;
    if (ply >= 6) {
      const c = candidate(p);
      const cat = c && c.goal + c.n;
      if (c && !found.has(cat)) { found.add(cat); out.push(c); process.stderr.write(`partida ${gi + 1}: ${c.goal} en ${c.n} (r ${c.r})\n`); }
    }
    const r = M.levelMove(p, lv[p.turn], null, { rnd });
    p.make(p.fromUci(r.move)); p.stack.length = 0;
  }
}
console.log(JSON.stringify(out));
