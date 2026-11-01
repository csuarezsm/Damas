// Elige los problemas finales entre los candidatos (sin repetidos, variados) y escribe www/problemas.js
// Uso: node tools/elegir-problemas.js candidatos1.json candidatos2.json …
const fs = require('fs');
global.Damas = require('../www/damas.js');
const D = global.Damas;
let all = [];
for (const f of process.argv.slice(2)) { try { all = all.concat(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (e) {} }
const seen = new Set();
all = all.filter(c => { const k = c.fen.split(':').slice(1).join(':'); if (seen.has(c.fen) || seen.has(k)) return false; seen.add(c.fen); seen.add(k); return c.n >= 1 && c.n <= 5; });
// una sola primera jugada ganadora también con todas las jugadas que se dan (no solo con las mínimas)
const M = require('../www/motor.js');
const unique = c => { if (c.n > 3) return true; const p = new D.Position(c.fen); const goal = c.goal === 'win' ? { win: true } : { t: M.material(p, p.turn) + c.g }; const w = M.winningMoves(p, c.n, goal); return w.length === 1 && p.uci(w[0]) === c.sol[0]; };
all = all.filter(unique);
// por categoría: jugadas (1–5) y objetivo
const QUOTA = { 1: 8, 2: 60, 3: 55, 4: 35, 5: 12 };
// ¿la primera jugada es una entrega (el rival tiene que comer)?
const sac = c => { const p = new D.Position(c.fen); const m = p.fromUci(c.sol[0]); if (!m) return false; p.make(m); return p.mustCapture(); };
const out = [];
let hash = 7;
const h = s => { let x = 2166136261; for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };
for (const n of Object.keys(QUOTA).map(Number)) {
  const list = all.filter(c => c.n === n).sort((a, b) => h(a.fen) - h(b.fen));
  // primero las de ganar la partida (más raras), luego las de material
  const wins = list.filter(c => c.goal === 'win'), mats = list.filter(c => c.goal === 'mat');
  const pref = l => l.filter(sac).concat(l.filter(c => !sac(c)));
  const take = pref(wins).slice(0, Math.ceil(QUOTA[n] / 3)).concat(pref(mats)).slice(0, QUOTA[n]);
  out.push(...take);
}
out.sort((a, b) => a.n - b.n || a.r - b.r);
const lines = out.map((c, i) => `  { id: 'd${String(i + 1).padStart(3, '0')}', fen: '${c.fen}', n: ${c.n}, goal: '${c.goal}', g: ${c.g}, r: ${c.r}, sol: [${c.sol.map(u => `'${u}'`).join(', ')}] },`);
fs.writeFileSync(__dirname + '/../www/problemas.js', `/* Damas — problemas «juegan y ganan» (IT Canarias). © 2026 IT Canarias. Todos los derechos reservados.
   Generados con tools/generar-problemas.js y elegidos con tools/elegir-problemas.js: cada uno tiene una sola
   primera jugada ganadora, comprobada con búsqueda completa. n = jugadas del bando que juega; goal = 'win'
   (dejar al rival sin piezas o sin jugadas) o 'mat' (ganar g peones de material; una dama vale 3). */
window.PROBLEMAS = [
${lines.join('\n')}
];
`);
const by = {}; out.forEach(c => { const k = c.goal + c.n; by[k] = (by[k] || 0) + 1; });
console.error(out.length, 'problemas', JSON.stringify(by), 'de', all.length, 'candidatos;', out.filter(sac).length, 'empiezan con una entrega');
