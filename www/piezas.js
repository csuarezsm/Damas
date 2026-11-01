/* Damas — fichas dibujadas para esta app (IT Canarias). © 2026 IT Canarias. Todos los derechos reservados. */
(function (root) {
'use strict';
// Ficha vista desde arriba en un lienzo de 100×100: sombra, canto, cara con dos anillos.
// La dama lleva una corona en el centro. type: 1 peón, 2 dama. color: 0 blancas, 1 negras.
const COLORS = [
  { face: '#f6efdf', edge: '#d6c7a6', ring: '#bfae89', line: '#8f7d5a', crown: '#b5832a' },
  { face: '#3a2a22', edge: '#1f1611', ring: '#5b463a', line: '#120c09', crown: '#e8b84a' },
];
const CROWN = 'M31 58L27 38L39 47L50 32L61 47L73 38L69 58Z';
function pieceSvg(type, color) {
  const c = COLORS[color];
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<ellipse cx="50" cy="56" rx="41" ry="40" fill="rgba(0,0,0,.28)"/>
<circle cx="50" cy="52" r="41" fill="${c.edge}" stroke="${c.line}" stroke-width="2.4"/>
<circle cx="50" cy="48" r="39" fill="${c.face}" stroke="${c.line}" stroke-width="2"/>
<circle cx="50" cy="48" r="29" fill="none" stroke="${c.ring}" stroke-width="3"/>
<circle cx="50" cy="48" r="18" fill="none" stroke="${c.ring}" stroke-width="2.2"/>
${type === 2 ? `<path d="${CROWN}" fill="${c.crown}" stroke="${c.line}" stroke-width="2.2" stroke-linejoin="round"/><rect x="31" y="58" width="38" height="6" rx="2" fill="${c.crown}" stroke="${c.line}" stroke-width="2"/><circle cx="27" cy="36" r="3.2" fill="${c.crown}"/><circle cx="50" cy="30" r="3.2" fill="${c.crown}"/><circle cx="73" cy="36" r="3.2" fill="${c.crown}"/>` : ''}
</svg>`;
}
const CACHE = {};
const piece = (type, color) => CACHE[type * 2 + color] || (CACHE[type * 2 + color] = pieceSvg(type, color));
root.Piezas = { piece };
if (typeof module !== 'undefined' && module.exports) module.exports = root.Piezas;
})(typeof self !== 'undefined' ? self : globalThis);
