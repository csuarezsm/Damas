// Genera las capturas y gráficos para la ficha de Google Play.
// Uso (desde la raíz del repo): node play-store/capturas.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = ROOT + 'play-store/';
const APP = 'file://' + ROOT + 'www/index.html';
const b = await chromium.launch();

// Datos de ejemplo: partidas terminadas para la clasificación
const seed = () => {
  const names = ['Carlos', 'Tere', 'Aitor', 'Lola']; let s = 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const base = new Date(2026, 9, 1, 20).getTime();
  const opening = ['f3e4', 'c6d5', 'e4c6', 'b7d5', 'b3c4', 'd5b3', 'a2c4'];
  for (let i = 0; i < 40; i++) {
    const ai = rnd() < 0.4, w = names[Math.floor(rnd() * 4)]; let bl = names[Math.floor(rnd() * 4)]; if (bl === w) bl = names[(names.indexOf(w) + 1) % 4];
    const r = rnd(), result = r < 0.45 ? '1-0' : r < 0.85 ? '0-1' : '1/2-1/2';
    const g = { id: 'demo' + i, created: base + i * 864e5 / 2, finished: base + i * 864e5 / 2 + 1800e3, moves: opening.slice(), startFen: null, clock: null, result, reason: result === '1/2-1/2' ? 'acuerdo' : 'abandono', undos: 0, hints: 0 };
    if (ai) Object.assign(g, { mode: 'ai', human: 0, level: 2 + (i % 4), white: w, black: levelLabel(2 + (i % 4)) });
    else Object.assign(g, { mode: 'local', white: w, black: bl });
    S.archive.unshift(g);
  }
  S.roster = names.slice(); save();
};
// Prepara cada pantalla dentro de la app (se ejecuta en el navegador)
const setup = async (name) => {
  // partida de ejemplo: el motor contra sí mismo (siempre la misma)
  const demo = n => { const p = new Damas.Position(); const ms = []; for (let i = 0; i < n; i++) { const r = Motor.levelMove(p, 4, null, { rnd: () => ((i * 7919 + 13) % 97) / 97 }); if (!r) break; ms.push(r.move); p.make(p.fromUci(r.move)); } return ms; };
  if (name === '1-partida') {
    startGame({ mode: 'ai', human: 0, level: 4, name: 'Carlos', clock: { base: 600000, inc: 5000 }, learn: true });
    S.game.moves = demo(14); S.game.times = [431000, 466000]; S.game.tick = null; S.game.paused = true;
    window.THINK = null; render();
    const pos = gstate(S.game).pos; const m = pos.legal()[0]; if (m) { BS.sel = m.from; render(); }
  }
  if (name === '2-inicio') { S.game = null; S.draft.mode = 'ai'; S.draft.ai = Object.assign(S.draft.ai, { name: 'Carlos', level: 4, clock: '10+5', learn: true }); render(); }
  if (name === '3-analisis') {
    const moves = ['d3c4', 'e6f5', 'h3g4', 'f5h3', 'f3e4', 'f7e6', 'g2f3', 'h3g2', 'f1h3', 'b7c6'];
    startGame({ mode: 'local', white: 'Carlos', black: 'Tere', clock: null });
    S.game.moves = moves; endGame('0-1', 'abandono');
    const ev = Motor.handle({ op: 'analyse', moves, timeMs: 150 });
    S.game.analysis = { evals: ev.map(e => [e.best || '', e.score]), at: Date.now() };
    archiveUpsert(S.game);
    openGameReview(S.game, 'game'); REVIEW.ply = 7; render();
  }
  if (name === '4-problema') { S.game = null; const z = PROBLEMAS.find(p => p.n === 2); openPuzzle(z.id); }
  if (name === '5-clasificacion') { S.game = null; S.pz = null; render(); openArchive('ranking'); }
  if (name === '6-dos-jugadores') {
    startGame({ mode: 'local', white: 'Aitor', black: 'Lola', clock: { base: 300000, inc: 0 }, flip: false });
    S.game.moves = demo(20);
    S.game.times = [212000, 187000]; S.game.tick = null; S.game.paused = true; render();
  }
};
const SHOTS = ['1-partida', '2-inicio', '3-analisis', '4-problema', '5-clasificacion', '6-dos-jugadores'];
const SIZES = [
  ['movil', 405, 720, 1080 / 405],
  ['tablet7', 600, 960, 2],
  ['tablet10', 1280, 800, 1.5],
];
const only = process.argv[2];
for (const [dev, w, h, dsf] of SIZES) {
  if (only && only !== dev) continue;
  for (const name of SHOTS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: dev === 'movil', hasTouch: true });
    const p = await ctx.newPage();
    await p.addInitScript(() => { window.DAMAS_ONLINE_URL = ''; }); await p.addInitScript(() => { if (!sessionStorage.s) { localStorage.setItem('damas.v1', JSON.stringify({ onboarded: true })); sessionStorage.s = 1; } });
    await p.goto(APP); await p.evaluate(seed); await p.evaluate(setup, name); await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}${dev}-${name}.png` });
    await ctx.close();
  }
}
// Icono 512 y gráfico destacado 1024×500
const p = await b.newPage({ viewport: { width: 512, height: 512 } });
await p.goto('file://' + ROOT + 'assets/icon-only.png');
await p.screenshot({ path: OUT + 'icono-512.png', clip: { x: 0, y: 0, width: 512, height: 512 } });
const q = await b.newPage({ viewport: { width: 1024, height: 500 } });
await q.setContent(`<html><body style="margin:0;width:1024px;height:500px;background:radial-gradient(circle at 30% 50%,#5c222d,#22090e 70%);font-family:system-ui,Roboto,sans-serif;display:flex;align-items:center;gap:56px;padding:0 70px;box-sizing:border-box;color:#f7ece4">
  <img src="data:image/png;base64,${readFileSync(ROOT + 'assets/icon-only.png').toString('base64')}" style="width:300px;height:300px;border-radius:64px;box-shadow:0 18px 50px rgba(0,0,0,.45)">
  <div><div style="font-size:112px;font-weight:900;letter-spacing:2px;color:#f0c060;line-height:1">DAMAS</div>
  <div style="font-size:31px;font-weight:600;margin-top:18px;line-height:1.3">Damas españolas<br>contra la máquina, con un amigo<br>o en línea</div>
  <div style="font-size:24px;color:#d0aeb0;margin-top:18px">6 niveles · Problemas · Análisis · Sin anuncios</div></div></body></html>`, { waitUntil: 'domcontentloaded' });
await q.waitForTimeout(500);
await q.screenshot({ path: OUT + 'grafico-destacado-1024x500.png' });
await b.close();
console.log('Listo: play-store/');
