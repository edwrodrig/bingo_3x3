import assert from "node:assert/strict";
import test from "node:test";
import { makeCards, modes, renderPdf } from "../web/cards.mjs";

for (const [mode, { labels, span }] of Object.entries(modes)) {
  test(`${mode}: cartones únicos con números de cada columna`, () => {
    const cards = makeCards(20, mode, 1234);
    assert.deepEqual(cards, makeCards(20, mode, 1234));
    assert.equal(new Set(cards.map((card) => card.grid.flat().join(","))).size, 20);
    for (const card of cards) {
      assert.equal(card.grid.length, labels.length);
      for (const row of card.grid) assert.equal(row.length, labels.length);
      for (let col = 0; col < labels.length; col++) {
        const values = card.grid.map((row) => row[col]).filter((n) => n !== null);
        assert.equal(values.length, labels.length - (mode === "5x5" && col === 2 ? 1 : 0));
        assert.equal(new Set(values).size, values.length);
        assert.ok(values.every((n) => n > col * span && n <= (col + 1) * span));
      }
      if (mode === "5x5") assert.equal(card.grid[2][2], null);
    }
  });

  test(`${mode}: PDF carta con 12 cartones por página`, () => {
    const pdf = renderPdf(makeCards(13, mode, 1234), mode);
    const content = new TextDecoder().decode(pdf);
    assert.ok(content.startsWith("%PDF-1.4"));
    assert.match(content, /\/Count 2\b/);
    assert.match(content, /\/MediaBox \[0 0 612 792\]/);
    assert.equal((content.match(/BINGO  #/g) || []).length, 13);
    assert.equal(content.includes("LIBRE"), mode === "5x5");
    const xref = Number(content.match(/startxref\n(\d+)/)[1]);
    assert.equal(content.slice(xref, xref + 4), "xref");
  });
}

test("rechaza modalidades y cantidades inválidas", () => {
  assert.throws(() => makeCards(0, "3x3", 1), RangeError);
  assert.throws(() => makeCards(1, "6x6", 1), RangeError);
  assert.throws(() => renderPdf([], "3x3"), RangeError);
});
