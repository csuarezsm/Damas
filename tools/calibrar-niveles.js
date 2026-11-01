// Partidas entre dos niveles para comprobar que cada uno gana claramente al anterior.
// Uso: node tools/calibrar-niveles.js <nivelA> <nivelB> [partidas] [msPorJugada]
global.Damas = require('../www/damas.js');
const D = global.Damas, M = require('../www/motor.js');
const [a, b, n = 20, ms] = process.argv.slice(2).map(Number);
let pts = 0, res = { w: 0, d: 0, l: 0 };
for (let i = 0; i < n; i++) {
  const q = new D.Position();
  // dos jugadas al azar para variar las aperturas
  for (let k = 0; k < 2; k++) { const L = q.legal(); q.make(L[Math.floor(Math.random() * L.length)]); }
  const aWhite = i % 2 === 0;
  let st;
  for (let ply = 0; ply < 400; ply++) {
    st = D.status(q); if (st.over) break;
    const lv = (q.turn === 0) === aWhite ? a : b;
    M.ttClear();
    const r = M.levelMove(q, lv, null, { timeMs: ms || undefined });
    q.make(q.fromUci(r.move));
  }
  st = D.status(q);
  const sc = !st.over || st.result === '1/2-1/2' ? 0.5 : (st.result === '1-0') === aWhite ? 1 : 0;
  pts += sc; res[sc === 1 ? 'w' : sc === 0 ? 'l' : 'd']++;
}
console.log(`nivel ${a} contra ${b}: ${pts}/${n} (${Math.round(pts / n * 100)} %) +${res.w} =${res.d} -${res.l}`);
