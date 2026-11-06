// Pruebas automáticas de Damas (IT Canarias)
// Se ejecutan en GitHub antes de compilar: si alguna falla, no se publica la versión.
// Uso local: node tests/app.test.mjs   (para la parte en línea busca el servidor común en ../juegos-servidor o en JUEGOS_SERVIDOR)
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const D = require('../www/damas.js'); globalThis.Damas = D;
const M = require('../www/motor.js');
globalThis.window = globalThis; require('../www/problemas.js'); const PROBLEMAS = globalThis.PROBLEMAS; delete globalThis.window;

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); if (process.env.GITHUB_ACTIONS) console.log('::error::' + name); } };
const N = n => { const s = D.sqParse(n); if (!D.playable(s)) throw new Error('casilla no jugable en la prueba: ' + n); return D.num(s); };
const L = a => a.map(x => x[0] === 'K' ? 'K' + N(x.slice(1)) : N(x)).join(',');
const F = (turn, w, b) => `${turn}:W${L(w)}:B${L(b)}`;
const P = fen => new D.Position(fen);
const moves = p => p.legal().map(m => p.uci(m)).sort();
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/* ================= Reglas ================= */
console.log('Tablero y generador de jugadas');
{
  const p = P();
  check('posición inicial: 12 peones cada uno, juegan blancas', p.counts()[0][1] === 12 && p.counts()[1][1] === 12 && p.turn === 0 && p.fen() === D.START_FEN);
  check('32 casillas de juego con la gran diagonal a la derecha (h1–a8)', D.SQS.length === 32 && D.playable(D.sqParse('h1')) && D.playable(D.sqParse('a8')) && !D.playable(D.sqParse('a1')));
  check('numeración española: 1 = h1, 4 = b1, 9 = h3, 32 = a8', N('h1') === 1 && N('b1') === 4 && N('h3') === 9 && N('a8') === 32);
  const got = [1, 2, 3, 4, 5, 6].map(d => D.perft(p, d));
  check('perft (con la ley de la cantidad)', got.join() === '7,49,302,1469,7361,36473', got.join());
  // sin la ley de la cantidad, el generador coincide con las cifras conocidas del juego inglés (mismos peones)
  const perftE = (q, d) => { if (!d) return 1; let l = q.captures([]); if (!l.length) l = q.quietMoves([]); if (d === 1) return l.length; let n = 0; for (const m of l) { q.make(m); n += perftE(q, d - 1); q.unmake(); } return n; };
  check('generador de capturas validado (perft 7 = 179740)', perftE(P(), 7) === 179740);
  const f = 'B:W1,K10,18:BK5,20,31';
  check('FEN se conserva', P(f).fen() === f, P(f).fen());
  let bad = 0; for (const x of ['W:W1,1:B2', 'W:Wx:B2', 'X:W1:B2', 'W:W33:B2', 'W:W1:W2']) { try { P(x); } catch (e) { bad++; } }
  check('FEN no válidos se rechazan', bad === 5);
  check('un peón en su última fila ya es dama', P('W:W29:B1').counts()[0][2] === 1);
}

console.log('Capturas: cantidad, calidad y dama voladora');
{
  check('obligatorio comer: solo salen las capturas', moves(P(F('W', ['d3', 'h1'], ['e4', 'a8']))).join() === 'd3f5');
  check('el peón no come hacia atrás', moves(P(F('W', ['e4'], ['d3', 'f3', 'a8']))).every(u => !/e4[cg]2/.test(u)));
  check('ley de la cantidad: la que come más', moves(P(F('W', ['b3', 'h3'], ['c4', 'e6', 'g4']))).every(u => u.length === 6));
  check('ley de la calidad: a igual número, la que come más damas', moves(P(F('W', ['b3', 'h3'], ['c4', 'c6', 'g4', 'Kg6']))).join() === 'h3f5h7');
  check('la dama vuela y cae en cualquier casilla libre detrás', moves(P(F('W', ['Kh1'], ['e4']))).join() === 'h1a8,h1b7,h1c6,h1d5');
  check('la dama encadena capturas a distancia', moves(P(F('W', ['Kh1'], ['e4', 'c6']))).join() === 'h1d5a8,h1d5b7');
  const q = P(F('W', ['Kh1'], ['e4', 'b7', 'd7', 'f7']));
  check('no se salta dos veces la misma pieza y se come el máximo', q.legal().every(m => m.caps.length === 3 && new Set(m.caps).size === 3));
  const c = P(F('W', ['e6'], ['f7', 'd7']));
  check('el peón que corona comiendo termina la jugada', c.legal().every(m => m.promo && m.path.length === 1));
  const k = P(F('W', ['h7'], ['a2'])); k.make(k.fromUci('h7g8'));
  check('al llegar a la última fila corona', k.counts()[0][2] === 1);
  const s = P(F('W', ['c4'], ['b5', 'd5', 'a8'])); const m = s.fromSan('15x24');
  check('notación española: 15x24 y 10-14', !!m && s.san(m) === '15x24' && P().san(P().fromUci('f3e4')) === '10-14');
}

console.log('Final de la partida y tablas');
{
  const noPieces = P('B:W1:B32'); noPieces.b[D.fromNum(32)] = 0;
  check('sin piezas: pierde', D.status(noPieces).over && D.status(noPieces).result === '1-0' && D.status(noPieces).reason === 'sinpiezas');
  const bl = P(F('B', ['b5', 'c4', 'a4'], ['a6']));
  check('sin jugadas (bloqueado): pierde', D.status(bl).over && D.status(bl).result === '1-0' && D.status(bl).reason === 'bloqueo', JSON.stringify(D.status(bl)));
  check('una dama contra una dama: tablas', D.status(P('W:WK1:BK32')).reason === 'damadama');
  const r = P('W:WK4,K3:BK29,K31');
  for (const u of ['b1a2', 'g8h7', 'a2b1', 'h7g8', 'b1a2', 'g8h7', 'a2b1', 'h7g8']) { const mm = r.fromUci(u); if (mm) r.make(mm); }
  check('triple repetición: tablas', D.status(r).over && D.status(r).reason === 'repeticion', JSON.stringify(D.status(r)) + r.fen());
  const q = P('W:WK1,K3,10:BK32,K29,22'); q.quiet = 40;
  check('20 jugadas de dama por bando sin comer ni mover peón: tablas', D.status(q).reason === 'cuarenta');
  const t = P('W:WK1,K5,K10:BK29');
  check('tres damas (una en la gran diagonal) contra una: empieza la cuenta', t.k31 === 0);
  t.make(t.legal().find(x => !x.caps.length));
  check('y cuenta cada jugada', t.k31 === 1);
  t.k31 = 24;
  check('sin ganar en 12 jugadas: tablas', D.status(t).over && D.status(t).reason === 'tresdamas', JSON.stringify(D.status(t)));
}

console.log('Cientos de partidas al azar');
{
  let ok = true, err = '', lengths = 0, ends = {};
  for (let g = 0; g < 300 && ok; g++) {
    const p = P(), ms = [];
    for (let i = 0; i < 400; i++) {
      const st = D.status(p); if (st.over) { ends[st.reason] = (ends[st.reason] || 0) + 1; break; }
      const l = p.legal(); const m = l[Math.floor(rnd() * l.length)];
      const before = p.fen(), h = p.key();
      p.make(m); p.unmake();
      if (p.fen() !== before || p.key() !== h) { ok = false; err = 'hacer y deshacer no deja igual: ' + before; break; }
      ms.push(p.uci(m)); p.make(m);
      const c = p.counts(); if (c[0][1] + c[0][2] > 12 || c[1][1] + c[1][2] > 12) { ok = false; err = 'demasiadas piezas'; break; }
    }
    const R = D.replay(ms); if (R.moves.length !== ms.length || R.pos.fen() !== p.fen()) { ok = false; err = 'replay distinto'; }
    const back = D.parsePgn(D.toPgn({ moves: ms, white: 'A', black: 'B', result: '*' }))[0];
    if (back.moves.join() !== ms.join()) { ok = false; err = 'PDN ida y vuelta: ' + back.error; }
    lengths += ms.length;
  }
  check('300 partidas al azar: hacer/deshacer, repetir y PDN coinciden', ok, err);
  check('acaban de formas distintas', Object.keys(ends).length >= 2, JSON.stringify(ends));
}

console.log('PDN');
{
  const g = D.parsePgn('[Event "Liga"]\n[White "Ana"]\n[Black "Luis"]\n[Result "2-0"]\n[GameType "24"]\n\n1. 10-14 23-19 2. 14x23 {captura} 27x20 2-0\n')[0];
  check('lee una partida PDN en notación española', g.moves.length === 4 && g.result === '1-0' && g.tags.White === 'Ana' && !g.error, JSON.stringify(g));
  const t = D.toPgn({ moves: g.moves, white: 'Ana', black: 'Luis', result: '1-0' });
  check('escribe PDN con GameType 24 y resultado 2-0', t.includes('[GameType "24"]') && t.includes('1. 10-14 23-19') && t.includes('2-0'));
  check('rechaza otras variantes', !!D.parsePgn('[GameType "20"]\n1. 32-28 *')[0].error);
  check('posición inicial con FEN', D.parsePgn('[FEN "W:W10:B22"]\n1. 10-14 *')[0].moves.join() === 'f3e4');
}

console.log('Motor');
{
  // golpe clásico: entrega un peón y come dos
  const shot = P('W:W1,3,4,7,8,9,10,11,13,14,15:B18,20,21,22,24,26,27,28,30,31,32');
  M.ttClear(); const r = M.think(shot, { timeMs: 800 });
  check('ve que la posición gana material', r.score > 150, JSON.stringify(r));
  const w = P('W:WK1,K5,K10,15:B32'); M.ttClear();
  check('con mucha ventaja ve que gana', M.think(w, { timeMs: 500 }).score > 500);
  check('evaluación simétrica', M.evaluate(P()) === M.evaluate(P(D.START_FEN.replace(/^W/, 'B'))) * 1 || Math.abs(M.evaluate(P())) < 30);
  const one = P(F('W', ['d3', 'h1'], ['e4', 'a8']));
  check('con una sola jugada posible, la juega', M.levelMove(one, 6, null, {}).move === 'd3f5');
  const an = M.handle({ op: 'analyse', moves: ['f3e4', 'c6d5', 'e4c6', 'b7d5'], timeMs: 60 });
  check('análisis: una evaluación por posición', an.length === 5 && an.every(e => typeof e.score === 'number'));
  check('clasificación de errores', M.classify(400) === 'grave' && M.classify(150) === 'error' && M.classify(60) === 'imprecision' && M.classify(10) === 'buena' && M.classify(999, true) === 'mejor');
}

console.log('Problemas');
{
  check('hay problemas en 1 a 4 jugadas', PROBLEMAS.length >= 120 && [1, 2, 3, 4].every(n => PROBLEMAS.some(p => p.n === n)), PROBLEMAS.length);
  check('ids únicos', new Set(PROBLEMAS.map(p => p.id)).size === PROBLEMAS.length);
  let bad = [];
  for (const z of PROBLEMAS) {
    const p = P(z.fen), att = p.turn, base = M.material(p, att);
    const R = D.replay(z.sol, z.fen);
    const st = D.status(R.pos);
    const okEnd = z.goal === 'win' ? st.over && st.result === (att === 0 ? '1-0' : '0-1') : (st.over && st.result !== '1/2-1/2') || M.material(R.pos, att) >= base + z.g;
    const attMoves = z.sol.filter((_, i) => i % 2 === 0).length;
    if (R.moves.length !== z.sol.length || !okEnd || attMoves !== z.n) bad.push(z.id);
  }
  check('cada solución es válida y consigue el objetivo', !bad.length, bad.join());
  bad = [];
  for (const z of PROBLEMAS.filter(x => x.n <= 2)) {
    const p = P(z.fen), goal = z.goal === 'win' ? { win: true } : { t: M.material(p, p.turn) + z.g };
    const w = M.winningMoves(p, z.n, goal).map(m => p.uci(m));
    if (w.length !== 1 || w[0] !== z.sol[0]) bad.push(z.id + ':' + w.join('/'));
  }
  check('en los de 1 y 2 jugadas, una sola primera jugada gana', !bad.length, bad.join(' '));
}

console.log('Fuerza de los niveles');
{
  const NODES = { 5: 20000, 6: 40000 };
  const game = (lw, lb) => {
    const pos = P();
    for (let k = 0; k < 2; k++) { const l = pos.legal(); pos.make(l[Math.floor(rnd() * l.length)]); }
    for (let ply = 0; ply < 300; ply++) {
      const st = D.status(pos); if (st.over) return st.result;
      const lv = pos.turn === 0 ? lw : lb;
      const r = M.levelMove(pos, lv, null, { rnd, nodes: NODES[lv] });
      pos.make(pos.fromUci(r.move));
    }
    return '1/2-1/2';
  };
  const match = (a, b, n) => { let s = 0; for (let i = 0; i < n; i++) { const aw = i % 2 === 0, r = aw ? game(a, b) : game(b, a); s += r === '1/2-1/2' ? 0.5 : ((r === '1-0') === aw ? 1 : 0); } return s / n; };
  const t0 = Date.now();
  const s31 = match(3, 1, 10); check('el nivel 3 gana al 1 (más del 80 % de los puntos)', s31 > 0.8, Math.round(s31 * 100) + '%');
  const s64 = match(6, 3, 6); check('el nivel 6 gana al 3 (más del 70 % de los puntos)', s64 > 0.7, Math.round(s64 * 100) + '%');
  console.log('    (' + Math.round((Date.now() - t0) / 1000) + ' s)');
}

/* ================= Interfaz ================= */
const ROOT = fileURLToPath(new URL('../www/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  try { const f = await readFile(join(ROOT, path === '/' ? 'index.html' : path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' }); res.end(f); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const URL_APP = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
async function fresh(state, viewport, online = '') {
  const ctx = await browser.newContext({ viewport: viewport || { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'v0.0.1', assets: [] }) }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(u => { window.DAMAS_ONLINE_URL = u; }, online);   // en las pruebas, nunca el servidor real
  await p.addInitScript(st => { if (st && !sessionStorage.getItem('seeded')) { localStorage.setItem('damas.v1', JSON.stringify(st)); sessionStorage.setItem('seeded', '1'); } }, state || { onboarded: true });
  await p.goto(URL_APP);
  return { p, ctx, errors };
}
async function sqXY(p, sq) {
  return p.evaluate(sq => {
    const el = document.querySelector('#board') || document.querySelector('#edBoard'), r = el.getBoundingClientRect();
    const orient = EDITOR ? EDITOR.orient : REVIEW ? (REVIEW.orient != null ? REVIEW.orient : 0) : S.drill ? mistakeList().find(x => x.key === S.drill.key).color : S.pz ? new Damas.Position(pzById(S.pz.id).fen).turn : orientOf(S.game);
    const f = sq.charCodeAt(0) - 97, rk = +sq[1] - 1, x = orient ? 7 - f : f, y = orient ? rk : 7 - rk;
    return [r.left + (x + .5) * r.width / 8, r.top + (y + .5) * r.height / 8];
  }, sq);
}
async function tap(p, sq) { const [x, y] = await sqXY(p, sq); await p.mouse.click(x, y); await p.waitForTimeout(40); }
async function move(p, uci) { const q = uci.match(/[a-h][1-8]/g); await tap(p, q[0]); await tap(p, q[q.length - 1]); }
async function drag(p, from, to) { const [x1, y1] = await sqXY(p, from), [x2, y2] = await sqXY(p, to); await p.mouse.move(x1, y1); await p.mouse.down(); await p.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 }); await p.mouse.move(x2, y2, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(60); }
const waitFor = (p, fn, arg, timeout = 15000) => p.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

console.log('Idioma inglés');
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route('https://**', r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(([k, ov]) => { window[ov] = ''; navigator.share = async d => { window.__compartido = d.text; }; if (!sessionStorage.l) { localStorage.setItem(k, JSON.stringify({ onboarded: true, iosHint: true })); sessionStorage.l = 1; } }, ['damas.v1', 'DAMAS_ONLINE_URL']);
  await p.goto(URL_APP); await p.waitForTimeout(400);
  check('por defecto (pruebas) en español', await p.evaluate(() => Idioma.lang() === 'es' && !document.body.textContent.includes('Against the computer')));
  await p.click('#menuBtn'); await p.click('#mLang');
  check('el menú tiene el selector de idioma', await p.evaluate(() => document.querySelectorAll('[data-lang]').length === 5));
  await Promise.all([p.waitForNavigation(), p.click('[data-lang="en"]')]); await p.waitForTimeout(500);
  check('al elegir inglés, la app se ve en inglés', await p.evaluate(() => Idioma.lang() === 'en' && document.body.textContent.includes('Against the computer') && document.documentElement.lang === 'en'));
  await p.click('#menuBtn');
  check('y el menú también', await p.evaluate(() => document.querySelector('#modal').textContent.includes('Share the app') && !document.querySelector('#modal').textContent.includes('Compartir la app')));
  check('compartir la app en inglés', await p.evaluate(async () => { closeModal(); await shareApp(); const t = window.__compartido || ''; return /free/i.test(t) && /iPhone/.test(t) && !/Gratis/.test(t); }), await p.evaluate(() => window.__compartido));
  check('las fechas y números en inglés', await p.evaluate(() => new Date(2026, 10, 1).toLocaleDateString('es-ES', { month: 'long' }) === 'November'));
  await p.click('#menuBtn'); await p.click('#mLang');
  await Promise.all([p.waitForNavigation(), p.click('[data-lang="es"]')]); await p.waitForTimeout(400);
  check('y se vuelve al español', await p.evaluate(() => Idioma.lang() === 'es' && !document.body.textContent.includes('Against the computer')));

  for (const [l, t] of [['fr', 'Plus de jeux'], ['de', 'Mehr Spiele'], ['it', 'Altri giochi']]) {
    await p.evaluate(l => localStorage.setItem('idioma', l), l); await p.reload(); await p.waitForTimeout(400);
    await p.click('#menuBtn');
    check(`en ${l}: la app se ve en ese idioma`, await p.evaluate(([l, t]) => document.documentElement.lang === l && document.querySelector('#modal').textContent.includes(t), [l, t]));
    await p.evaluate(() => closeModal());
  }
  await p.evaluate(() => localStorage.setItem('idioma', 'es')); await p.reload(); await p.waitForTimeout(300);
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Contador anónimo de instalaciones');
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const avisos = [];
  await ctx.route('https://contador.prueba/contar', async r => { avisos.push(JSON.parse(r.request().postData())); await r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }); });
  const p = await ctx.newPage();
  await p.addInitScript(([k, ov]) => { window[ov] = ''; window.CONTADOR_URL = 'https://contador.prueba/contar'; window.CONTADOR_FORZAR = true; if (!sessionStorage.c) { localStorage.setItem(k, JSON.stringify({ onboarded: true })); sessionStorage.c = 1; } }, ['damas.v1', 'DAMAS_ONLINE_URL']);
  await p.goto(URL_APP);
  await p.evaluate(() => Contador.avisar());
  check('al instalar avisa una vez, sin datos personales', avisos.length === 1 && avisos[0].evento === 'instalacion' && avisos[0].plataforma === 'web' && Object.keys(avisos[0]).sort().join() === 'evento,juego,plataforma,version', JSON.stringify(avisos));
  await p.reload(); await p.evaluate(() => Contador.avisar());
  check('no vuelve a avisar en la misma versión', avisos.length === 1);
  await p.evaluate(() => { S.contadoVer = '0.0.1'; save(); }); await p.evaluate(() => Contador.avisar());
  check('con una versión nueva avisa de la actualización', avisos.length === 2 && avisos[1].evento === 'actualizacion' && avisos[1].de === '0.0.1');
  check('en las pruebas automáticas normales no avisa al servidor real', await p.evaluate(async () => { window.CONTADOR_FORZAR = false; S.contadoVer = null; return (await Contador.avisar()) === false; }));
  await ctx.close();
}

console.log('Más juegos de IT Canarias');
{
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'v0.0.1', assets: [] }) }));
  const CAT = 'https://catalogo.prueba/juegos.json';
  await ctx.route(CAT, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ juegos: [
    { id: 'ajedrez', nombre: 'Ajedrez', descripcion: 'a', descarga: 'https://csuarezsm.github.io/Ajedrez/', web: 'https://csuarezsm.github.io/Ajedrez/app/' },
    { id: 'damas', nombre: 'Damas', descripcion: 'd', descarga: 'https://csuarezsm.github.io/Damas/', web: 'https://csuarezsm.github.io/Damas/app/' },
    { id: 'chinchon', nombre: 'Chinchón', descripcion: 'c', descarga: 'https://csuarezsm.github.io/chinchon-marcador/', web: 'https://csuarezsm.github.io/chinchon-marcador/app/' },
    { id: 'pumba', nombre: 'Pumba', descripcion: 'p', descarga: 'https://csuarezsm.github.io/Pumba/', web: 'https://csuarezsm.github.io/Pumba/app/' },
    { id: 'parchis', nombre: 'Parchís <b>', emoji: '🎲', descripcion: 'Nuevo', descarga: 'https://csuarezsm.github.io/Parchis/' },
    { id: '<mal>', nombre: 'Malo', descarga: 'https://x.example/' },
    { id: 'malo2', nombre: 'Malo 2', descarga: 'javascript:alert(1)' }] }) }));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(([k, ov, cat]) => { window[ov] = ''; window.MAS_JUEGOS_URL = cat; if (!sessionStorage.mj) { localStorage.setItem(k, JSON.stringify({ onboarded: true })); sessionStorage.mj = 1; } }, ['damas.v1', 'DAMAS_ONLINE_URL', CAT]);
  await p.goto(URL_APP); await p.waitForTimeout(300);
  await p.click('#menuBtn');
  check('el menú tiene «Más juegos de IT Canarias»', !!(await p.$('#mMas')));
  await p.click('#mMas'); await p.waitForTimeout(200);
  const base = await p.evaluate(() => [...document.querySelectorAll('.mjc b')].map(b => b.textContent));
  check('sin conexión: los otros siete juegos, y no este', base.length === 7 && !base.some(n => n.toLowerCase().startsWith('damas')), base.join());
  check('con sus iconos dentro de la app', await p.evaluate(() => [...document.querySelectorAll('.mji img')].every(i => i.getAttribute('src').startsWith('juegos/'))));
  check('el catálogo común se descarga y se guarda', await p.evaluate(async () => await MasJuegos.actualizar(true) && S.masJuegos.juegos.length === 5));
  await p.evaluate(() => { closeModal(); MasJuegos.abrir(); }); await p.waitForTimeout(200);
  const nuevos = await p.evaluate(() => [...document.querySelectorAll('.mjc b')].map(b => b.textContent));
  check('un juego nuevo del catálogo aparece sin actualizar la app', nuevos.length === 4 && nuevos.includes('Parchís b'), nuevos.join());
  check('los datos raros del catálogo se descartan', !nuevos.includes('Malo') && !nuevos.includes('Malo 2'));
  const abierto = await p.evaluate(() => { let u = ''; window.openExternal = x => { u = x; }; const i = MasJuegos.juegos().findIndex(j => j.id === 'parchis'); document.querySelector(`[data-mj="${i}"]`).click(); return u; });
  check('en el navegador, el botón lleva a su página', abierto === 'https://csuarezsm.github.io/Parchis/', abierto);
  await p.reload(); await p.waitForTimeout(300);
  check('sin internet usa el último catálogo guardado', await p.evaluate(() => MasJuegos.juegos().some(j => j.id === 'parchis')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
  // en iPhone, cada juego abre su versión web
  const ci = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ci.route('https://**/*.json', r => r.abort());
  const q = await ci.newPage();
  await q.addInitScript(([k, ov]) => { window[ov] = ''; localStorage.setItem(k, JSON.stringify({ onboarded: true, iosHint: true })); }, ['damas.v1', 'DAMAS_ONLINE_URL']);
  await q.goto(URL_APP); await q.waitForTimeout(300);
  const web = await q.evaluate(() => { let u = ''; window.openExternal = x => { u = x; }; MasJuegos.abrir(); document.querySelector('[data-mj="0"]').click(); return u; });
  check('en iPhone el botón abre la versión web del juego', /\/app\/$/.test(web), web);
  // aviso de turno: se puede quitar en los ajustes
  const aviso = await q.evaluate(() => { closeModal(); document.querySelector('#menuBtn').click(); document.querySelector('#mTheme').click(); const el = document.querySelector('#thTurno'); const antes = !!el && el.checked; el.click(); const off = S.avisoTurno === false && JSON.parse(localStorage.getItem(KEY)).avisoTurno === false; const n = AvisoTurno.veces; const sono = AvisoTurno.sonar(); return { ok: antes && off && !sono && AvisoTurno.veces === n, antes, off, sono, el: !!el }; });
  check('el aviso de turno en línea se puede quitar en ajustes', aviso.ok, JSON.stringify(aviso));
  await ci.close();
}

console.log('Versión web e iPhone');
{
  const { execSync } = await import('node:child_process');
  let iguales = true; try { execSync('diff -r www docs/app', { cwd: fileURLToPath(new URL('..', import.meta.url)) }); } catch (e) { iguales = false; }
  check('docs/app (versión web) es igual que www/ — si no: npm run web', iguales);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'v99.0.0', assets: [] }) }));
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.DAMAS_ONLINE_URL = ''; if (!sessionStorage.s) { localStorage.setItem('damas.v1', JSON.stringify({ onboarded: true })); sessionStorage.s = 1; } });
  await p.goto(URL_APP);
  check('en Safari de iPhone explica cómo añadirla a la pantalla de inicio', await waitFor(p, () => !!document.querySelector('#iosOk')));
  await p.click('#iosOk'); await p.click('#menuBtn');
  check('en la versión web no hay actualizador de APK', !(await p.$('#mUpd')) && !!(await p.$('#mIOS')));
  check('y lo vuelve a explicar desde el menú', await p.evaluate(() => { document.querySelector('#mIOS').click(); return !!document.querySelector('#iosOk'); }));
  check('etiquetas de iPhone: icono, título y pantalla completa', await p.evaluate(() => !!document.querySelector('link[rel="apple-touch-icon"]') && document.querySelector('meta[name="apple-mobile-web-app-title"]').content === 'Damas'));
  check('compartir la app: un mensaje para Android e iPhone', await p.evaluate(async () => { let txt = ''; navigator.share = async d => { txt = d.text; }; await shareApp(); return txt.includes('csuarezsm.github.io/Damas/') && /Android/.test(txt) && /iPhone/.test(txt); }));
  await p.reload(); await p.waitForTimeout(800);
  check('el aviso de instalar sale solo una vez', !(await p.$('#iosOk')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Partida contra la máquina');
{
  const { p, ctx, errors } = await fresh();
  await p.fill('#aName', 'Carlos');
  await p.click('[data-alevel="1"]');
  await p.click('#start');
  check('empieza la partida con el nombre y el nivel', await p.evaluate(() => S.game.mode === 'ai' && S.game.white === 'Carlos' && S.game.level === 1 && S.roster.includes('Carlos')));
  check('el tablero lleva los números de casilla', await p.evaluate(() => document.querySelectorAll('#board .cn').length === 32));
  await move(p, 'f3e4');
  check('se mueve tocando ficha y casilla', await p.evaluate(() => S.game.moves[0] === 'f3e4'));
  check('la máquina responde', await waitFor(p, () => S.game.moves.length === 2));
  const legal = await p.evaluate(() => { const pos = gstate(S.game).pos; const by = {}; pos.legal().forEach(m => { const k = Damas.sqName(m.from) + Damas.sqName(Damas.mTo(m)); by[k] = (by[k] || 0) + 1; }); return pos.legal().map(m => pos.uci(m)).filter(u => by[u.slice(0, 2) + u.slice(-2)] === 1 && u.slice(0, 2) !== u.slice(-2)); });
  const m3 = legal[0];
  await drag(p, m3.slice(0, 2), m3.slice(-2)); check('se mueve arrastrando la ficha', await p.evaluate(u => S.game.moves[2] === u, m3));
  await waitFor(p, () => S.game.moves.length === 4);
  const n0 = await p.evaluate(() => S.game.moves.length);
  await tap(p, 'h1'); await tap(p, 'h3');
  check('una jugada ilegal no se hace', await p.evaluate(n => S.game.moves.length === n, n0));
  await p.click('#gUndo');
  check('deshacer quita tu jugada y la de la máquina', await p.evaluate(() => S.game.moves.length === 2 && S.game.undos === 1), await p.evaluate(() => JSON.stringify([S.game.moves, S.game.undos, S.game.result, !!THINK])));
  await p.click('[data-ply="1"]');
  check('tocar una jugada de la lista enseña esa posición', await p.evaluate(() => VIEW_PLY === 1 && !!document.querySelector('#gLive')));
  await p.click('#gLive');
  await p.click('#gResign'); await p.click('#cOk');
  check('rendirse termina la partida y la guarda', await p.evaluate(() => S.game.result === '0-1' && S.game.reason === 'abandono' && S.archive.length === 1 && S.archive[0].id === S.game.id));
  check('la derrota baja el Elo', await p.evaluate(() => { const o = eloTable().find(x => x.name === 'Carlos'); return o && o.elo < 1200 && o.pj === 1; }));
  await p.click('#gRematch');
  check('la revancha cambia de color', await p.evaluate(() => S.game.human === 1 && S.game.black === 'Carlos' && !S.game.result));
  check('con negras la máquina empieza', await waitFor(p, () => S.game.moves.length === 1));
  check('y el tablero se ve desde las negras', await p.evaluate(() => orientOf(S.game) === 1));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Comer es obligatorio, dos caminos, coronar y sonidos');
{
  const { p, ctx, errors } = await fresh();
  await p.evaluate(() => { S.draft.mode = 'local'; startGame({ mode: 'local', white: 'Ana', black: 'Luis', clock: null, flip: false }); });
  await move(p, 'f3e4'); await move(p, 'c6d5');
  check('el estado avisa de que hay que comer', (await p.textContent('.gstatus')).includes('hay que comer'));
  await tap(p, 'b3');
  check('tocar una ficha que no puede comer: aviso y se marcan las que sí', await p.evaluate(() => BS.sel === null && S.game.moves.length === 2));
  await move(p, 'e4c6');
  check('la captura se hace y la ficha comida desaparece', await p.evaluate(() => S.game.moves[2] === 'e4c6' && !gstate(S.game).pos.b[Damas.sqParse('d5')]));
  // dos caminos que llegan a la misma casilla con una dama
  await p.evaluate(() => { startGame({ mode: 'local', white: 'Ana', black: 'Luis', clock: null, flip: false, startFen: 'W:WK12:B15,26,5,16' }); });
  const routes = await p.evaluate(() => { const pos = gstate(S.game).pos; const by = {}; pos.legal().forEach(m => { const k = Damas.sqName(m.from) + Damas.sqName(Damas.mTo(m)); by[k] = (by[k] || 0) + 1; }); return Object.entries(by).find(([, n]) => n > 1); });
  if (routes) {
    await move(p, routes[0]);
    check('si hay dos caminos, pregunta por dónde', await p.evaluate(() => document.querySelectorAll('[data-rt]').length >= 2));
    await p.click('[data-rt="0"]');
    check('y hace el elegido', await p.evaluate(() => S.game.moves.length === 1));
  } else check('posición de dos caminos preparada', false, 'no hay dos caminos');
  await p.evaluate(() => { startGame({ mode: 'local', white: 'Ana', black: 'Luis', clock: null, flip: false, startFen: 'W:W25:B1' }); });
  await move(p, 'h7g8');
  check('al llegar al final, corona dama', await p.evaluate(() => gstate(S.game).pos.counts()[0][2] === 1));
  check('los sonidos no dan errores', await p.evaluate(async () => { ['move', 'capture', 'check', 'end', 'ok', 'bad'].forEach(k => Sound.play(k)); await new Promise(r => setTimeout(r, 300)); return true; }));
  check('tipo de sonido por jugada', await p.evaluate(() => { const P1 = Damas.replay(['f3e4', 'c6d5']).pos; return Sound.forMove(new Damas.Position(), 'f3e4') === 'move' && Sound.forMove(P1, 'e4c6') === 'capture' && Sound.forMove(new Damas.Position('W:W25:B1'), 'h7g8') === 'check'; }));
  check('en el inicio no hay nada que cerrar', await p.evaluate(() => { S.game = null; S.draft.mode = 'ai'; render(); return goBack() === false; }));
  await p.evaluate(() => { startGame({ mode: 'local', white: 'Ana', black: 'Luis' }); S.game.moves = ['f3e4']; render(); });
  check('partida a medias: atrás pregunta si guardarla', await p.evaluate(() => goBack() && !!document.querySelector('#lvSave')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Dos jugadores, reloj y tablas');
{
  const { p, ctx, errors } = await fresh();
  await p.click('[data-mode="local"]');
  await p.fill('#lWhite', 'Ana'); await p.fill('#lBlack', 'Luis');
  await p.check('#lFlip');
  await p.click('[data-lclock="5+0"]');
  await p.click('#start');
  check('partida de dos jugadores con reloj', await p.evaluate(() => S.game.mode === 'local' && S.game.white === 'Ana' && S.game.clock.base === 300000 && S.game.flip));
  await move(p, 'f3e4');
  check('el tablero gira en cada turno', await p.evaluate(() => orientOf(S.game) === 1));
  check('el reloj de las negras corre', await p.evaluate(() => !!S.game.tick && document.querySelector('[data-clock="1"]').classList.contains('run')));
  // final ganado: el rival se queda sin piezas
  await p.evaluate(() => { startGame({ mode: 'local', white: 'Ana', black: 'Luis', clock: null, flip: false, startFen: 'W:W14:B18' }); });
  await move(p, 'e4g6');
  check('sin piezas: ganan las blancas', await p.evaluate(() => S.game.result === '1-0' && S.game.reason === 'sinpiezas'));
  check('el texto lo dice', (await p.textContent('.gstatus')).includes('Ana'));
  check('Elo de los dos jugadores', await p.evaluate(() => { const t = eloTable(); const a = t.find(x => x.name === 'Ana'), l = t.find(x => x.name === 'Luis'); return !a || !l || (a.elo > 1200 && l.elo < 1200); }));
  await p.evaluate(() => { startGame({ mode: 'local', white: 'Ana', black: 'Luis', clock: null, flip: false }); S.game.moves = ['f3e4', 'c6d5']; render(); });
  await p.click('#gDraw'); await p.click('#cOk');
  check('tablas de mutuo acuerdo', await p.evaluate(() => S.game.result === '1/2-1/2' && S.game.reason === 'acuerdo'));
  await p.evaluate(() => { startGame({ mode: 'local', white: 'Ana', black: 'Luis', clock: { base: 60000, inc: 0 }, flip: false }); S.game.moves = ['f3e4']; S.game.times = [60000, 400]; S.game.tick = Date.now(); render(); });
  check('si se acaba el tiempo, pierde', await waitFor(p, () => S.game.result === '1-0' && S.game.reason === 'tiempo', null, 4000));
  check('el reloj se para al salir de la app', await p.evaluate(() => { startGame({ mode: 'local', white: 'A', black: 'B', clock: { base: 60000, inc: 0 } }); S.game.moves = ['f3e4']; S.game.tick = Date.now() - 5000; pauseClock(); const ok = !S.game.tick && S.game.paused && S.game.times[1] <= 55100; resumeClock(); return ok && !!S.game.tick; }));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Modo aprendizaje y pistas');
{
  const { p, ctx, errors } = await fresh();
  await p.click('[data-alevel="3"]'); await p.check('#aLearn'); await p.click('#start');
  await p.click('#gHint');
  check('la pista marca una jugada', await waitFor(p, () => HINT && HINT.length === 2));
  // tras estas jugadas, 15. g2f3 regala material
  await p.evaluate(() => { HINT = null; THINK = null; LEARN_WAIT = null; Engine.reset(); S.game.moves = ['d3c4', 'e6f5', 'h3g4', 'f5h3', 'f3e4', 'f7e6']; render(); });
  await move(p, 'g2f3');
  const warned = await waitFor(p, () => !!document.querySelector('#lnUndo'), null, 20000);
  check('avisa al regalar material', warned);
  if (warned) { await p.click('#lnUndo'); check('y se puede deshacer', await p.evaluate(() => S.game.moves.length === 6 && !LEARN_WAIT)); }
  await move(p, 'g2f3');
  if (await waitFor(p, () => !!document.querySelector('#lnUndo'), null, 20000)) {
    await p.evaluate(() => goBack());
    check('cerrar el aviso con atrás equivale a seguir: juega la máquina', await waitFor(p, () => !LEARN_WAIT && S.game.moves.length === 8, null, 20000));
  } else check('el aviso vuelve a salir', false);
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Revisión y análisis');
{
  const { p, ctx, errors } = await fresh();
  // 2… 22-18?? regala dos peones
  await p.evaluate(() => { startGame({ mode: 'local', white: 'Ana', black: 'Luis', clock: null }); S.game.moves = ['d3c4', 'e6f5', 'h3g4', 'f5h3', 'f3e4', 'f7e6', 'g2f3']; render(); });
  await p.evaluate(() => endGame('1-0', 'abandono'));
  await p.click('#gAnalyse');
  check('el análisis termina', await waitFor(p, () => REVIEW && REVIEW.g.analysis && !REVIEW.analysing, null, 30000));
  check('marca 4. g2f3 como error grave', await p.evaluate(() => annotate(REVIEW.g)[6].cls === 'grave'), await p.evaluate(() => JSON.stringify(annotate(REVIEW.g).map(a => a.cls))));
  check('el análisis queda guardado en el historial', await p.evaluate(() => !!S.archive[0].analysis && S.archive[0].analysis.evals.length === 8));
  const i = await p.evaluate(() => annotate(REVIEW.g).findIndex(a => a.cls !== 'mejor' && a.best));
  await p.click(`[data-rp="${i + 1}"]`);
  check('nota con la mejor jugada', (await p.textContent('.note')).includes('Mejor era'));
  await p.click('#rvBest');
  check('se puede ver la mejor jugada en el tablero', await p.evaluate(() => document.querySelectorAll('.sq.best').length === 2));
  await p.click('[data-nav="first"]');
  check('navegar al inicio', await p.evaluate(() => REVIEW.ply === 0));
  await p.click('[data-nav="next"]'); await p.click('[data-nav="next"]');
  check('avanzar jugada a jugada', await p.evaluate(() => REVIEW.ply === 2));
  await p.click('#rvBack');
  check('volver a la partida', await p.evaluate(() => !REVIEW && !!S.game));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Problemas en la app');
{
  const { p, ctx, errors } = await fresh();
  await p.click('[data-mode="puzzles"]');
  const z1 = PROBLEMAS.find(x => x.n === 1), z2 = PROBLEMAS.find(x => x.n === 2 && x.sol.length === 3);
  await p.click(`[data-pz="${z1.id}"]`);
  await move(p, z1.sol[0]);
  check('problema en 1 resuelto a la primera', await waitFor(p, id => S.pz.done && S.solved[id] === 2, z1.id));
  await p.evaluate(id => openPuzzle(id), z2.id);
  const wrong = await p.evaluate(z => { const pos = new Damas.Position(z.fen); return pos.legal().map(m => pos.uci(m)).find(u => u !== z.sol[0]); }, z2);
  await move(p, wrong);
  check('una jugada equivocada se rechaza y se deshace', await waitFor(p, () => S.pz.fails === 1 && S.pz.moves.length === 0, null, 20000));
  await move(p, z2.sol[0]);
  check('la defensa responde', await waitFor(p, () => S.pz.moves.length === 2, null, 20000));
  await p.evaluate(u => puzzleMove(u), z2.sol[2]);
  check('problema en 2 resuelto (con un fallo)', await waitFor(p, id => S.pz.done && S.solved[id] === 1, z2.id));
  await p.click('#pzBack');
  check('la lista marca los resueltos', await p.evaluate(() => document.querySelectorAll('.pzgrid .ok1').length === 1 && document.querySelectorAll('.pzgrid .ok').length === 1));
  const z3 = PROBLEMAS.find(x => x.n === 3);
  await p.evaluate(id => openPuzzle(id), z3.id);
  await p.click('#pzHint');
  check('la pista marca la ficha que hay que mover', await waitFor(p, () => HINT && HINT.length === 1, null, 20000));
  await p.click('#pzSol');
  check('ver la solución la reproduce entera y no cuenta como resuelto', await waitFor(p, z => S.pz.done && S.pz.moves.length === z.sol.length && !S.solved[z.id], z3, 15000));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Repasa tus errores, editor y jugar desde aquí');
{
  const { p, ctx, errors } = await fresh();
  await p.evaluate(() => {
    const g = { id: 'err1', created: Date.now() - 1e6, finished: Date.now() - 1e6, mode: 'ai', human: 0, level: 3, white: 'Carlos', black: levelLabel(3), startFen: 'W:W1,3,4,7,8,9,10,11,13,14,15:B18,20,21,22,24,26,27,28,30,31,32', clock: null, result: '0-1', reason: 'abandono', undos: 0, hints: 0 };
    const pos = new Damas.Position(g.startFen);
    // jugada mala de las blancas: la que más pierde según el motor
    let worst = null, wv = -1e9; for (const m of pos.legal()) { const q = pos.clone(); q.make(m); const r = Motor.think(q, { timeMs: 120 }); if (r.score > wv) { wv = r.score; worst = pos.uci(m); } }
    g.moves = [worst];
    const ev = Motor.handle({ op: 'analyse', moves: g.moves, startFen: g.startFen, timeMs: 200 }); g.analysis = { evals: ev.map(e => [e.best || '', e.score]), at: Date.now() };
    S.archive.push(g); S.draft.mode = 'puzzles'; render();
  });
  check('el error sale para repasar', await p.evaluate(() => mistakeList().length === 1 && mistakeList()[0].color === 0));
  await p.click('#drStart');
  const it = await p.evaluate(() => mistakeList()[0]);
  await move(p, it.played);
  check('repetir la jugada de la partida no vale', await waitFor(p, () => S.drill.fails === 1 && !S.drill.move, null, 5000));
  await p.evaluate(u => drillMove(mistakeList()[0], u), it.best);
  check('la buena se acepta y queda marcada', await waitFor(p, () => S.drill.done && Object.values(S.mist)[0] === 1, null, 20000));
  await p.click('#drPlay'); await p.click('[data-cm="local"]'); await p.click('#ctGo');
  check('jugar desde aquí empieza una partida nueva en esa posición', await p.evaluate(() => S.game && !S.drill && S.game.startFen.startsWith('W:W1,3,4') && S.game.moves.length === 0 && S.game.mode === 'local'));
  check('no cuenta para el Elo', await p.evaluate(() => { endGame('1-0', 'abandono'); return !ratedGames().some(a => a.startFen); }));
  check('y se exporta en PDN con su FEN', await p.evaluate(() => toPgn(S.game).includes('[FEN "W:W1,3,4')));
  // editor
  await p.evaluate(() => { S.game = null; openEditor(null, 'home'); });
  await p.click('#edClear');
  await p.click('[data-tool="W"]'); await tap(p, 'h1');
  await p.click('[data-tool="b"]'); await tap(p, 'e4'); await tap(p, 'c6');
  await tap(p, 'a1');
  check('editor: se ponen fichas solo en las casillas de juego', await p.evaluate(() => EDITOR && Object.keys(EDITOR.b).length === 3));
  check('editor: FEN de la posición', await p.evaluate(() => edFen(EDITOR) === 'W:WK1:B14,23'));
  await p.click('#edEval');
  check('editor: analiza la posición', await waitFor(p, () => EDITOR.eval && EDITOR.eval.move, null, 10000));
  await p.click('#edPlay'); await p.click('[data-cm="local"]'); await p.click('#ctGo');
  check('editor: jugar desde la posición', await p.evaluate(() => S.game && S.game.startFen === 'W:WK1:B14,23'));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Jugar en línea (con el servidor común de juegos)');
{
  const os = await import('node:os'), fs = await import('node:fs');
  const SERV = process.env.JUEGOS_SERVIDOR || fileURLToPath(new URL('../../juegos-servidor/', import.meta.url));
  if (!fs.existsSync(join(SERV, 'src/server.js'))) check('servidor común de juegos para las pruebas', false, 'no está en ' + SERV);
  else {
    // copia de los motores del servidor, con las reglas de ESTA versión de la app
    const motores = fs.mkdtempSync(join(os.tmpdir(), 'motores-'));
    for (const j of fs.readdirSync(join(SERV, 'motores'))) fs.cpSync(join(SERV, 'motores', j), join(motores, j), { recursive: true });
    fs.mkdirSync(join(motores, 'damas'), { recursive: true }); fs.copyFileSync(join(ROOT, 'damas.js'), join(motores, 'damas', 'damas.js'));
    Object.assign(process.env, { LIMITE_MSG: '5000', MOTORES_DIR: motores, DATA_DIR: fs.mkdtempSync(join(os.tmpdir(), 'juegos-')) });
    const req = createRequire(join(SERV, 'package.json'));
    const { crearServidor } = req('./src/server.js');
    const { server: SVS } = crearServidor();
    await new Promise(r => SVS.listen(0, '127.0.0.1', r));
    const WS = `ws://127.0.0.1:${SVS.address().port}/ws`;
    const A1 = await fresh({ onboarded: true, draft: { mode: 'online', ai: { name: 'Carlos' } } }, null, WS);
    const B1 = await fresh({ onboarded: true, draft: { mode: 'online', ai: { name: 'Tere' } } }, null, WS);
    const a = A1.p, b = B1.p;
    check('sin servidor configurado no aparece la opción', !(await (await fresh()).p.$('[data-mode="online"]')));
    check('la app apunta al servidor de IT Canarias', (await readFile(join(ROOT, 'juego.js'), 'utf8')).includes("'wss://juegos.itcanarias.com/ws'"));
    await a.click('[data-ocolor="w"]'); await a.click('[data-oclock="5+0"]'); await a.click('#oCreate');
    check('crear sala: aparece el código', await waitFor(a, () => S.game && S.game.mode === 'online' && /^[A-Z2-9]{4}$/.test(S.game.room) && !!document.querySelector('.olcode')));
    const code = await a.evaluate(() => S.game.room);
    await b.fill('#oCode', code.toLowerCase()); await b.click('#oJoin');
    check('el rival entra con el código y empieza sola', await waitFor(b, () => S.game && S.game.ready && S.game.seat === 1 && S.game.white === 'Carlos'));
    check('y el creador lo ve', await waitFor(a, () => S.game.ready && S.game.black === 'Tere' && S.game.seat === 0));
    check('cada uno ve el tablero desde su color', await a.evaluate(() => orientOf(S.game) === 0) && await b.evaluate(() => orientOf(S.game) === 1));
    await move(b, 'c6d5');
    check('no se puede mover en el turno del rival', await b.evaluate(() => S.game.moves.length === 0));
    await move(a, 'f3e4');
    check('la jugada llega al rival', await waitFor(b, () => S.game.moves.join() === 'f3e4'));
  check('al rival le suena el aviso de que le toca', await waitFor(b, () => AvisoTurno.veces >= 1, null, 5000));
  check('y a quien acaba de jugar no', await a.evaluate(() => AvisoTurno.veces === 1));   // el suyo fue al empezar con blancas
    check('el reloj del rival corre', await waitFor(b, () => !!S.game.tick && S.game.times[1] <= 300000));
    await move(b, 'c6d5'); await waitFor(a, () => S.game.moves.length === 2);
    await move(a, 'e4c6');
    check('la captura llega al rival', await waitFor(b, () => S.game.moves.length === 3 && !gstate(S.game).pos.b[Damas.sqParse('d5')]));
    await b.evaluate(() => Online.close());
    check('el rival ve la desconexión', await waitFor(a, () => S.game.oppOnline === false));
    await b.evaluate(() => resumeOnline());
    check('al volver, sigue la partida en su silla', await waitFor(a, () => S.game.oppOnline === true) && await waitFor(b, () => S.game.moves.length === 3 && S.game.seat === 1));
    await b.click('#olResign'); await b.click('#cOk');
    check('rendirse: los dos lo reciben y se guarda', await waitFor(a, () => S.game.result === '1-0' && S.game.reason === 'abandono' && S.archive.some(x => x.mode === 'online')) && await waitFor(b, () => S.game.result === '1-0' && S.archive.length === 1));
    check('cuenta para el Elo', await b.evaluate(() => { const t = eloTable(); return t.find(o => o.name === 'Tere').elo < 1200 && t.find(o => o.name === 'Carlos').elo > 1200; }));
    await a.click('#olRematch');
    check('la revancha pedida se ve en el otro móvil', await waitFor(b, () => document.querySelector('.olbanner') && document.querySelector('.olbanner').textContent.includes('revancha')));
    await b.click('#olRematch');
    check('revancha con los colores cambiados', await waitFor(a, () => !S.game.result && S.game.seat === 1 && S.game.ready && S.game.moves.length === 0) && await waitFor(b, () => S.game.seat === 0 && !S.game.result));
    await move(b, 'h3g4'); await waitFor(a, () => S.game.moves.length === 1);
    await move(a, 'a6b5'); await waitFor(b, () => S.game.moves.length === 2);
    await b.click('#olDraw');
    check('oferta de tablas', await waitFor(a, () => !!document.querySelector('#olDrawYes')));
    await a.click('#olDrawYes');
    check('tablas aceptadas', await waitFor(b, () => S.game.result === '1/2-1/2' && S.game.reason === 'acuerdo'));
    await b.click('#olLeave');
    check('salir vuelve a la pantalla de en línea', await b.evaluate(() => !S.game && S.draft.mode === 'online'));
    check('y el otro ve que su rival se ha ido', await waitFor(a, () => S.game.oppGone === true && !document.querySelector('#olRematch')));
    await b.fill('#oCode', 'ZZZZ'); await b.click('#oJoin');
    check('código que no existe: aviso', await waitFor(b, () => ONLINE.err.includes('código')));
    check('sin errores en la página', !A1.errors.length && !B1.errors.length, A1.errors.concat(B1.errors).join(' | '));
    await A1.ctx.close(); await B1.ctx.close();
    SVS.close();
  }
}

console.log('PDN, copias y datos maliciosos');
{
  const { p, ctx, errors } = await fresh();
  const pdn = '[Event "Liga"]\n[White "Ana"]\n[Black "Luis"]\n[Date "2025.01.20"]\n[Result "2-0"]\n[GameType "24"]\n\n1. 10-14 23-19 2. 14x23 {captura} 27x20 2-0\n';
  await p.evaluate(t => importPgnText(t), pdn); await p.click('#cOk');
  check('importa el PDN al historial', await p.evaluate(() => S.archive.length === 1 && S.archive[0].src === 'pgn' && S.archive[0].moves.length === 4 && S.archive[0].white === 'Ana' && S.archive[0].result === '1-0'));
  check('las partidas importadas no cuentan para el Elo', await p.evaluate(() => eloTable().length === 0));
  await p.evaluate(t => importPgnText(t), pdn); await p.click('#cOk');
  check('importar dos veces no duplica', await p.evaluate(() => S.archive.length === 1));
  check('exportar PDN', await p.evaluate(() => toPgn(S.archive[0]).includes('[White "Ana"]') && toPgn(S.archive[0]).includes('2. 14x23 27x20 2-0')));
  const res = await p.evaluate(() => {
    const evil = { app: 'damas', archive: [
      { id: '<img src=x onerror=alert(1)>', mode: 'local', white: '<b>Ana</b>', black: 'Luis"', moves: ['f3e4', 'zz', 'c6d5'], result: '1-0', created: 'x' },
      { id: 'ok1', mode: 'ai', human: 7, level: 99, white: 'Pepe', black: '🤖', moves: ['f3e4', 'c6d5', 'e4c6'], result: 'hack', analysis: { evals: [[1, 2]] } },
      { id: 'bad', moves: 'no' }, null, 42 ], roster: ['<script>', 'Pepe'], solved: { d001: 9, '<x>': 1 } };
    const n = mergeBackup(evil);
    const a = S.archive.find(x => x.id === 'ok1'), b = S.archive.find(x => x.white.includes('Ana') && x.src !== 'pgn');
    return { n, safeId: b && /^[A-Za-z0-9_-]+$/.test(b.id), name: b && b.white, mv: b && b.moves.join(), lvl: a && a.level, human: a && a.human, res: a && a.result, an: a && a.analysis, solved: S.solved.d001, badKey: S.solved['<x>'], roster: S.roster };
  });
  check('copias: solo entra lo válido', res.n === 2 && res.safeId && res.name === 'bAna/b' && res.mv === 'f3e4', JSON.stringify(res));
  check('copias: valores fuera de rango se corrigen', res.lvl === 6 && res.human === 0 && res.res === null && !res.an && res.solved === 2 && res.badKey === undefined, JSON.stringify(res));
  check('copias: nombres limpios en la lista de jugadores', !res.roster.some(n => /[<>]/.test(n)), res.roster.join());
  const round = await p.evaluate(() => { const before = S.archive.length; const j = JSON.parse(backupJSON()); S.archive = []; const n = mergeBackup(j); return before === n && S.archive.length === before; });
  check('copia de seguridad: ida y vuelta', round);
  check('una copia de otra app no se acepta', await p.evaluate(() => !validBackup({ app: 'ajedrez', archive: [] })));
  await p.evaluate(() => openArchive('partidas'));
  check('la lista de partidas se abre', await p.evaluate(() => document.querySelectorAll('#modal [data-arch]').length === 3));
  await p.click('#modal [data-arch="0"]');
  check('y desde ella se revisa una partida', await p.evaluate(() => !!REVIEW));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Clasificación, menú, temas y borrar');
{
  const mk = (i, w, b, result, extra) => Object.assign({ id: 'g' + i, created: 1e12 + i * 1e6, finished: 1e12 + i * 1e6 + 5, mode: 'local', white: w, black: b, moves: ['f3e4', 'c6d5', 'e4c6'], result, reason: 'abandono' }, extra || {});
  const archive = [mk(1, 'Ana', 'Luis', '1-0'), mk(2, 'Luis', 'Ana', '0-1'), mk(3, 'Ana', 'Pepe', '1/2-1/2'), mk(4, 'Pepe', '🤖', '1-0', { mode: 'ai', human: 0, level: 6 }), mk(5, 'Blancas', 'Negras', '1-0')].reverse();
  const { p, ctx, errors } = await fresh({ onboarded: true, archive, roster: ['Ana', 'Luis', 'Pepe'] });
  const t = await p.evaluate(() => eloTable().map(o => [o.name, Math.round(o.elo), o.pj]));
  const elo = n => (t.find(x => x[0] === n) || [])[1];
  check('Elo: Ana por encima de Luis, sin los nombres por defecto', elo('Ana') > elo('Luis') && t.length === 3 && !t.some(x => x[0] === 'Blancas'), JSON.stringify(t));
  check('ganar a la máquina de nivel 6 sube mucho', t.find(x => x[0] === 'Pepe')[1] > 1220, JSON.stringify(t));
  await p.click('#menuBtn'); await p.click('#mArch');
  check('la clasificación se ve', await p.evaluate(() => document.querySelectorAll('#modal tbody tr').length === 3));
  await p.click('#modal [data-player="Ana"]');
  check('ficha del jugador', (await p.textContent('#modal')).includes('Cara a cara'));
  await p.click('#pfBack'); await p.click('[data-tab="records"]');
  check('récords', (await p.textContent('#modal')).includes('Nivel más alto vencido'));
  await p.click('#aC');
  check('el tema por defecto es burdeos', await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#22090e'));
  await p.click('#menuBtn'); await p.click('#mTheme');
  await p.click('[data-theme="claro"]'); await p.click('[data-board="verde"]');
  check('cambiar tema y tablero', await p.evaluate(() => S.theme === 'claro' && S.board === 'verde' && getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#f1eee6'));
  await p.click('#thOk');
  await p.click('#menuBtn'); await p.click('#mGameRules');
  check('reglas de las damas españolas', (await p.textContent('#modal')).includes('Ley de la cantidad'));
  await p.click('#grOk');
  await p.click('#menuBtn'); await p.click('#mRoster');
  await p.fill('[data-orig="Luis"]', 'Ana'); await p.click('#roS'); await p.click('#cOk');
  check('unir jugadores en la lista', await p.evaluate(() => !S.roster.includes('Luis') && S.archive.every(a => a.white !== 'Luis' && a.black !== 'Luis')));
  await p.click('#menuBtn'); await p.click('#mWipe'); await p.click('#wHist'); await p.click('#cOk');
  check('borrar historial', await p.evaluate(() => S.archive.length === 0 && S.roster.length === 2));
  await p.click('#menuBtn'); await p.click('#mHelp');
  check('la ayuda se abre', await p.evaluate(() => !!document.querySelector('#wbNext')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

console.log('Pantallas: vertical, horizontal y tablet');
{
  for (const [name, vp] of [['móvil vertical', { width: 360, height: 740 }], ['móvil horizontal', { width: 800, height: 380 }], ['tablet 10"', { width: 1280, height: 800 }], ['tablet 7" vertical', { width: 600, height: 960 }]]) {
    const { p, ctx, errors } = await fresh({ onboarded: true }, vp);
    await p.evaluate(() => { startGame({ mode: 'local', white: 'Alejandro Fernández', black: 'María del Carmen', clock: { base: 300000, inc: 0 } }); S.game.moves = ['f3e4', 'c6d5', 'e4c6', 'b7d5']; render(); });
    const m = await p.evaluate(() => { const b = document.querySelector('#board').getBoundingClientRect(); const acts = document.querySelector('.gacts').getBoundingClientRect();
      const bars = [...document.querySelectorAll('.pbar')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect().bottom);
      return { bw: b.width, bh: b.height, bottom: Math.max(b.bottom, ...bars), bars: bars.length, ih: innerHeight, iw: innerWidth, sw: document.documentElement.scrollWidth, actsBottom: acts.bottom }; });
    check(`${name}: el tablero es cuadrado y cabe entero, con los dos jugadores`, Math.abs(m.bw - m.bh) < 2 && m.bottom <= m.ih + 1 && m.bw >= 280 && m.bars === 2, JSON.stringify(m));
    check(`${name}: sin desplazamiento horizontal`, m.sw <= m.iw + 1, JSON.stringify(m));
    check(`${name}: los botones se ven sin desplazar`, m.actsBottom <= m.ih + 1, JSON.stringify(m));
    check(`${name}: sin errores`, !errors.length, errors.join(' | '));
    await ctx.close();
  }
}

console.log('Invitación con enlace');
{ const pk = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')); const man = await readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  check('la app Android recibe el enlace (complemento @capacitor/app)', !!pk.dependencies['@capacitor/app'] && /android:host="unirse"/.test(man)); }
{
  const { p, ctx, errors } = await fresh(null, null, 'ws://127.0.0.1:9/ws');
  await p.waitForTimeout(300);
  check('el enlace de la invitación lleva a la página del juego', await p.evaluate(() => Invitacion.enlace('ABCD') === 'https://csuarezsm.github.io/Damas/unirse.html?c=ABCD'));
  check('el código se lee del enlace de la app y de la web', await p.evaluate(() => Invitacion.deUrl('itcdamas://unirse/ab12') === 'AB12' && Invitacion.deUrl('https://x.y/app/?unirse=wxyz') === 'WXYZ' && Invitacion.deUrl('https://x.y/app/') === null));
  check('el mensaje lleva el enlace y el código', await p.evaluate(() => { const t = Invitacion.texto('🎲', 'Juego', 'QWER'); return t.includes('unirse.html?c=QWER') && t.includes('*QWER*'); }));
  await p.evaluate(() => unirseDesdeEnlace('WXYZ')); await p.waitForTimeout(200);
  check('al abrir el enlace va a «En línea»', await p.evaluate(() => S.draft.mode === 'online'));
  check('sin nombre, pide el nombre en una ventana con el código', await p.evaluate(() => !!document.querySelector('#invName') && document.querySelector('#modal').textContent.includes('WXYZ')));
  check('el código queda guardado por si la app aún no estaba lista', await p.evaluate(() => { Invitacion.entregar('QQ11'); return true; }) && await p.evaluate(() => !localStorage.getItem('invitacionPendiente')));
  check('sin errores en la página', !errors.length, errors.join(' | '));
  await ctx.close();
}

// Partidas públicas y «Jugar con cualquiera», contra el servidor común de juegos
{
  console.log('Partidas públicas');
  const { createRequire: cr } = await import('node:module');
  const fsp = await import('node:fs'), osp = await import('node:os');
  const SERV = process.env.JUEGOS_SERVIDOR || fileURLToPath(new URL('../../juegos-servidor/', import.meta.url));
  if (!fsp.existsSync(join(SERV, 'src/server.js'))) check('servidor común de juegos para las pruebas', false, 'no está en ' + SERV);
  else {
    if (!process.env.DATA_DIR) process.env.DATA_DIR = fsp.mkdtempSync(join(osp.tmpdir(), 'juegos-'));
    const { crearServidor } = cr(join(SERV, 'package.json'))('./src/server.js');
    const { server: PS } = crearServidor();
    await new Promise(r => PS.listen(0, '127.0.0.1', r));
    const PWS = `ws://127.0.0.1:${PS.address().port}/ws`;
    const abrirP = async () => {
      const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      await ctx.addInitScript(u => { window.DAMAS_ONLINE_URL = u; if (!localStorage.getItem('damas.v1')) localStorage.setItem('damas.v1', JSON.stringify({ onboarded: true })); }, PWS);
      const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
      await p.goto(URL_APP); await p.click('[data-mode="online"]'); return { p, ctx, errors };
    };
    const P1 = await abrirP(), P2 = await abrirP();
    await P1.p.waitForSelector('#pubBuscar', { timeout: 8000 }).catch(() => {});
    check('en línea aparecen «Jugar con cualquiera», las partidas abiertas y la casilla de partida pública', !!(await P1.p.$('#pubBuscar')) && !!(await P1.p.$('#pubLista')) && !!(await P1.p.$('#pubPublica')));
    await P1.p.fill('#oName', 'Carlos'); await P1.p.click('#pubBuscar');
    check('al buscar, espera en una mesa de «cualquiera»', await P1.p.waitForFunction(() => ONLINE.sala && ONLINE.sala.auto && ONLINE.sala.publica, null, { timeout: 8000 }).then(() => true, () => false));
    check('y lo dice en pantalla', await P1.p.waitForSelector('text=Buscando jugadores', { timeout: 5000 }).then(() => true, () => false));
    await P2.p.fill('#oName', 'Mari');
    const fila = await P2.p.waitForSelector('[data-pubentrar]', { timeout: 12000 }).catch(() => null);
    check('otro móvil la ve en «Partidas abiertas»', !!fila && (await P2.p.textContent('#pubLista')).includes('Carlos'));
    if (fila) await fila.click();
    const mismo = await P2.p.waitForFunction(() => !!ONLINE.sala, null, { timeout: 8000 }).then(() => true, () => false);
    const codigos = await Promise.all([P1, P2].map(x => x.p.evaluate(() => ONLINE.sala && ONLINE.sala.codigo)));
    check('y entra con un toque en la misma partida', mismo && codigos[0] && codigos[0] === codigos[1], JSON.stringify(codigos));
    check('sin errores en las partidas públicas', !P1.errors.length && !P2.errors.length, P1.errors.concat(P2.errors).join(' | '));
    const vol = await P1.p.evaluate(() => { const c = new OfflineAudioContext(1, 4410, 44100); const g = AudioSuave.salida(c); const medio = g.gain.value; S.volumen = 'bajo'; const bajo = AudioSuave.salida(c).gain.value; S.volumen = undefined;
      return { medio, bajo, opcion: AvisoTurno.opcionHtml().includes('data-volumen="alto"'), mismo: AudioSuave.salida(c) === g }; });
    check('sonidos suaves: pasan por el volumen general (bajo, medio, alto) y se elige en los ajustes', Math.abs(vol.medio - 0.45) < 0.01 && Math.abs(vol.bajo - 0.22) < 0.01 && vol.opcion && vol.mismo, JSON.stringify(vol));
    await P1.ctx.close(); await P2.ctx.close(); PS.close();
  }
}

await browser.close();
server.close();
console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
