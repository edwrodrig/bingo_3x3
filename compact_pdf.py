"""Cartones compactos de 3x3 en carta, 12 por página, sin dependencias externas.

El lote se obtiene de bingo_generator.make_cards; el PDF solo presenta los datos.
"""

from __future__ import annotations

import argparse
import json
import sys
from io import BytesIO

from bingo_generator import make_cards

PAGE_W, PAGE_H = 612, 792
MARGIN = 18
GAP = 8
COLS, ROWS = 3, 4
CARD_W = (PAGE_W - 2 * MARGIN - (COLS - 1) * GAP) / COLS
CARD_H = (PAGE_H - 2 * MARGIN - (ROWS - 1) * GAP) / ROWS


def _text(x: float, y: float, size: int, value: str) -> str:
    safe = value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return f"BT /F1 {size} Tf {x:.2f} {y:.2f} Td ({safe}) Tj ET\n"


def _card_commands(card: dict, x: float, y: float) -> str:
    # 0.45 pt gris/negro: legible con poco tóner. Sin rellenos ni fondos.
    out = ["0 G 0 g 0.45 w\n", f"{x:.2f} {y:.2f} {CARD_W:.2f} {CARD_H:.2f} re S\n"]
    out.append(_text(x + 7, y + CARD_H - 15, 8, f"BINGO  #{card['id']:03d}"))
    grid_top = y + CARD_H - 22
    grid_bottom = y + 7
    grid_h = grid_top - grid_bottom
    grid_x = x + 7
    grid_w = CARD_W - 14
    cell_w = grid_w / 3
    cell_h = grid_h / 4
    out.append(f"{grid_x:.2f} {grid_bottom:.2f} {grid_w:.2f} {grid_h:.2f} re S\n")
    for i in range(1, 3):
        xx = grid_x + i * cell_w
        out.append(f"{xx:.2f} {grid_bottom:.2f} m {xx:.2f} {grid_top:.2f} l S\n")
    for i in range(1, 4):
        yy = grid_bottom + i * cell_h
        out.append(f"{grid_x:.2f} {yy:.2f} m {grid_x + grid_w:.2f} {yy:.2f} l S\n")
    for col, label in enumerate("BIN"):
        out.append(_text(grid_x + col * cell_w + cell_w / 2 - 4, grid_top - cell_h / 2 - 4, 11, label))
    for row in range(3):
        for col in range(3):
            n = str(card["grid"][row][col])
            out.append(_text(grid_x + col * cell_w + cell_w / 2 - (6 if len(n) == 1 else 12), grid_top - (row + 1.5) * cell_h - 7, 20, n))
    return "".join(out)


def render_pdf(cards: list[dict]) -> bytes:
    if not cards:
        raise ValueError("El lote debe tener al menos un cartón")
    objects: list[bytes] = []

    def add(data: bytes) -> int:
        objects.append(data)
        return len(objects)

    catalog_id = add(b"")
    pages_id = add(b"")
    font_id = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    page_ids: list[int] = []
    for start in range(0, len(cards), COLS * ROWS):
        commands = []
        for slot, card in enumerate(cards[start : start + COLS * ROWS]):
            col, row = slot % COLS, slot // COLS
            x = MARGIN + col * (CARD_W + GAP)
            y = PAGE_H - MARGIN - (row + 1) * CARD_H - row * GAP
            commands.append(_card_commands(card, x, y))
        stream = "".join(commands).encode("ascii")
        content_id = add(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"endstream")
        page_id = add(f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] /Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>".encode())
        page_ids.append(page_id)
    objects[catalog_id - 1] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode()
    kids = " ".join(f"{n} 0 R" for n in page_ids)
    objects[pages_id - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()
    result = BytesIO()
    result.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, data in enumerate(objects, 1):
        offsets.append(result.tell())
        result.write(f"{i} 0 obj\n".encode() + data + b"\nendobj\n")
    xref = result.tell()
    result.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        result.write(f"{offset:010d} 00000 n \n".encode())
    result.write(f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return result.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--format", choices=("json", "pdf"), required=True)
    args = parser.parse_args()
    if not 1 <= args.count <= 240 or not 0 <= args.seed <= 2**32 - 1:
        parser.error("count debe estar entre 1 y 240; seed entre 0 y 2^32-1")
    cards = make_cards(args.count, args.seed)
    if args.format == "json":
        sys.stdout.write(json.dumps({"format": "bingo_3x3_v1", "seed": args.seed, "cards": cards}))
    else:
        sys.stdout.buffer.write(render_pdf(cards))


if __name__ == "__main__":
    main()
