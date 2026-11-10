/* Matemáticas de presentación de Atlas. No es un segundo motor:
   parte de P&L ya calculado y rechaza muestras o varianzas inútiles. */
import "../atlas.js";
import assert from "node:assert/strict";

const A = globalThis.CabinaAtlas;
const cerca = (a, b, nombre) => {
  assert.ok(Math.abs(a - b) < 1e-9, nombre + " " + a + " ≠ " + b);
};

const s = A.statsOf([100, 100, -50]);
assert.equal(s.n, 3);
assert.equal(s.pf, 4);
assert.equal(s.expectancy, 50);
cerca(s.wr, 2 / 3, "win rate");
assert.equal(s.payoff, 2);
cerca(s.breakEven, 1 / 3, "break-even");
assert.equal(s.net, 150);
assert.equal(s.gp, 200);
assert.equal(s.gl, 50);

const dd = A.drawdownOf([100, -50, 100]);
assert.equal(dd.max, 50);
assert.equal(dd.n, 3);

assert.equal(A.pearson([1, 2, 3], [1, 2, 3]), 1);
assert.equal(A.pearson([1, 1, 1], [1, 2, 3]), null);
assert.equal(A.pearson([1, 2], [1, 2]), null);

const poca = A.insightsOf([{ pnl: 10 }, { pnl: -5 }]);
assert.equal(poca.length, 1);
assert.match(poca[0].metric, /No hay evidencia suficiente/);
assert.equal(poca[0].cls, "informativo");

const revenge = [100, 100, 100, 100, -10, -80, -80, -80, -80, -80].map((pnl, i) => ({
  pnl, qty: 1, date: "2026-01-" + String(i + 1).padStart(2, "0"), time: "10:00"
}));
const cards = A.insightsOf(revenge);
const rev = cards.find(c => c.id === "revenge");
assert.ok(rev && rev.cls === "desfavorable", "revenge no saltó con una racha posterior peor");
const ausente = cards.find(c => c.id === "ausentes");
assert.ok(ausente && ausente.cls === "informativo", "la ausencia de registro debe ser informativa");
assert.match(ausente.metric, /No hay evidencia suficiente/);
assert.match(ausente.context, /FOMO/);
assert.equal(cards.some(c => c.name === "FOMO" && c.cls === "desfavorable"), false);

console.log("PASS atlas");
