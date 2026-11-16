// Los cartones y el PDF se generan en el navegador a partir del mismo lote.
export const modes = Object.freeze({
  "3x3": { labels: "BIN", span: 10, total: 30 },
  "4x4": { labels: "BING", span: 15, total: 60 },
  "5x5": { labels: "BINGO", span: 15, total: 75 },
});
export const CARDS_PER_PAGE = 12;

export function randomSeed() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
  };
}

function makeCard(random, mode) {
  const { labels, span } = modes[mode];
  const size = labels.length;
  const columns = Array.from({ length: size }, (_, col) => {
    const values = Array.from({ length: span }, (_, i) => col * span + i + 1);
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values.slice(0, size);
  });
  const grid = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => columns[col][row]));
  if (mode === "5x5") grid[2][2] = null;
  return grid;
}

export function makeCards(count, mode, seed = randomSeed()) {
  if (!modes[mode]) throw new RangeError("Modalidad desconocida");
  if (!Number.isInteger(count) || count < 1 || count > 240)
    throw new RangeError("Elige entre 1 y 240 cartones.");
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError("Semilla inválida");
  const random = seededRandom(seed);
  const cards = [];
  const seen = new Set();
  for (let attempts = 0; cards.length < count; attempts++) {
    if (attempts > count * 100) throw new Error("No se pudieron crear cartones únicos.");
    const grid = makeCard(random, mode);
    const key = grid.flat().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ id: cards.length + 1, grid });
  }
  return cards;
}

const PAGE_W = 612, PAGE_H = 792, MARGIN = 18, GAP = 8;
const COLS = 3, ROWS = 4;
const CARD_W = (PAGE_W - 2 * MARGIN - (COLS - 1) * GAP) / COLS;
const CARD_H = (PAGE_H - 2 * MARGIN - (ROWS - 1) * GAP) / ROWS;
const fixed = (value) => value.toFixed(2);

function pdfText(x, y, size, value) {
  const safe = String(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  return `BT /F1 ${size} Tf ${fixed(x)} ${fixed(y)} Td (${safe}) Tj ET\n`;
}

function cardCommands(card, x, y, mode) {
  const labels = modes[mode].labels;
  const size = labels.length;
  const top = y + CARD_H - 22, bottom = y + 7;
  const gridX = x + 7, gridW = CARD_W - 14, gridH = top - bottom;
  const cellW = gridW / size, cellH = gridH / (size + 1);
  const out = ["0 G 0 g 0.45 w\n", `${fixed(x)} ${fixed(y)} ${fixed(CARD_W)} ${fixed(CARD_H)} re S\n`];
  out.push(pdfText(x + 7, y + CARD_H - 15, 8, `BINGO  #${String(card.id).padStart(3, "0")}`));
  out.push(`${fixed(gridX)} ${fixed(bottom)} ${fixed(gridW)} ${fixed(gridH)} re S\n`);
  for (let i = 1; i < size; i++) {
    const xx = gridX + i * cellW;
    out.push(`${fixed(xx)} ${fixed(bottom)} m ${fixed(xx)} ${fixed(top)} l S\n`);
  }
  for (let i = 1; i < size + 1; i++) {
    const yy = bottom + i * cellH;
    out.push(`${fixed(gridX)} ${fixed(yy)} m ${fixed(gridX + gridW)} ${fixed(yy)} l S\n`);
  }
  for (let col = 0; col < size; col++)
    out.push(pdfText(gridX + col * cellW + cellW / 2 - 4, top - cellH / 2 - 4, 10, labels[col]));
  const numberSize = { "3x3": 20, "4x4": 16, "5x5": 13 }[mode];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const value = card.grid[row][col];
      const label = value === null ? "LIBRE" : String(value);
      const fontSize = value === null ? 7 : numberSize;
      const width = label.length * fontSize * 0.27;
      out.push(pdfText(gridX + col * cellW + cellW / 2 - width,
        top - (row + 1.5) * cellH - fontSize * 0.35, fontSize, label));
    }
  }
  return out.join("");
}

export function renderPdf(cards, mode) {
  if (!modes[mode]) throw new RangeError("Modalidad desconocida");
  if (!cards.length) throw new RangeError("El lote debe tener al menos un cartón");
  const objects = [];
  const add = (value) => { objects.push(value); return objects.length; };
  const catalogID = add("");
  const pagesID = add("");
  const fontID = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIDs = [];
  for (let start = 0; start < cards.length; start += CARDS_PER_PAGE) {
    const commands = cards.slice(start, start + CARDS_PER_PAGE).map((card, slot) => {
      const col = slot % COLS, row = Math.floor(slot / COLS);
      const x = MARGIN + col * (CARD_W + GAP);
      const y = PAGE_H - MARGIN - (row + 1) * CARD_H - row * GAP;
      return cardCommands(card, x, y, mode);
    }).join("");
    const length = new TextEncoder().encode(commands).length;
    const contentID = add(`<< /Length ${length} >>\nstream\n${commands}endstream`);
    pageIDs.push(add(`<< /Type /Page /Parent ${pagesID} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontID} 0 R >> >> /Contents ${contentID} 0 R >>`));
  }
  objects[catalogID - 1] = `<< /Type /Catalog /Pages ${pagesID} 0 R >>`;
  objects[pagesID - 1] = `<< /Type /Pages /Kids [${pageIDs.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIDs.length} >>`;

  const encoder = new TextEncoder();
  const parts = [];
  let length = 0;
  const write = (value) => {
    const bytes = encoder.encode(value);
    parts.push(bytes);
    length += bytes.length;
  };
  write("%PDF-1.4\n");
  const offsets = [0];
  objects.forEach((value, index) => {
    offsets.push(length);
    write(`${index + 1} 0 obj\n${value}\nendobj\n`);
  });
  const xref = length;
  write(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => write(`${String(offset).padStart(10, "0")} 00000 n \n`));
  write(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogID} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const result = new Uint8Array(length);
  let position = 0;
  for (const bytes of parts) {
    result.set(bytes, position);
    position += bytes.length;
  }
  return result;
}
