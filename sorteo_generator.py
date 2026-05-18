#!/usr/bin/env python3
"""
Generador de fichas de sorteo para bingo 3x3.

Reglas:
- Columna B: numeros del 1 al 10
- Columna I: numeros del 11 al 20
- Columna N: numeros del 21 al 30
- Salida en hojas A4 con fichas grandes, rectas y recortables

Uso:
  python sorteo_generator.py --out salida_sorteo
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path


A4_WIDTH_MM = 210
A4_HEIGHT_MM = 297
SHEET_COLUMNS = 3
SHEET_ROWS = 4


def make_draw_tokens() -> list[dict[str, int | str]]:
    tokens = []
    for column in [
        {"label": "B", "min": 1, "max": 10},
        {"label": "I", "min": 11, "max": 20},
        {"label": "N", "min": 21, "max": 30},
    ]:
        for number in range(column["min"], column["max"] + 1):
            tokens.append({
                "label": column["label"],
                "number": number,
            })
    return tokens


def render_draw_sheet_svg(tokens: list[dict[str, int | str]], page_number: int, total_pages: int) -> str:
    margin_mm = 10
    gap_mm = 0
    crop_mark_len_mm = 4
    crop_mark_stroke_mm = 0.35
    inner_cross_half_mm = 2.2

    usable_width = A4_WIDTH_MM - (margin_mm * 2)
    usable_height = A4_HEIGHT_MM - (margin_mm * 2)

    token_size = min(
        (usable_width - (gap_mm * (SHEET_COLUMNS - 1))) / SHEET_COLUMNS,
        (usable_height - (gap_mm * (SHEET_ROWS - 1))) / SHEET_ROWS,
    )

    grid_width = (token_size * SHEET_COLUMNS) + (gap_mm * (SHEET_COLUMNS - 1))
    grid_height = (token_size * SHEET_ROWS) + (gap_mm * (SHEET_ROWS - 1))
    origin_x = (A4_WIDTH_MM - grid_width) / 2
    origin_y = (A4_HEIGHT_MM - grid_height) / 2

    parts = [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{A4_WIDTH_MM}mm" '
            f'height="{A4_HEIGHT_MM}mm" viewBox="0 0 {A4_WIDTH_MM} {A4_HEIGHT_MM}">'
        ),
        "<defs>",
        "<style><![CDATA[",
        ".sheet-bg { fill: #ffffff; }",
        ".token-label { font-family: Arial, sans-serif; font-size: 15px; font-weight: 700; fill: #333333; }",
        ".token-number { font-family: Arial, sans-serif; font-size: 28px; font-weight: 700; fill: #111111; }",
        ".token-code { font-family: Arial, sans-serif; font-size: 8px; fill: #666666; }",
        f".crop-mark {{ stroke: #111111; stroke-width: {crop_mark_stroke_mm}; }}",
        ".page-note { font-family: Arial, sans-serif; font-size: 5px; fill: #777777; }",
        "]]></style>",
        "</defs>",
        f'<rect class="sheet-bg" x="0" y="0" width="{A4_WIDTH_MM}" height="{A4_HEIGHT_MM}"/>',
    ]

    for index, token in enumerate(tokens):
        row = index // SHEET_COLUMNS
        col = index % SHEET_COLUMNS
        x = origin_x + col * (token_size + gap_mm)
        y = origin_y + row * (token_size + gap_mm)
        center_x = x + (token_size / 2)
        center_y = y + (token_size / 2)

        label = str(token["label"])
        number = str(token["number"])
        code = f"{label}-{number}"

        parts.extend([
            f'<text class="token-label" x="{center_x:.2f}" y="{y + 16:.2f}" text-anchor="middle">{label}</text>',
            f'<text class="token-number" x="{center_x:.2f}" y="{center_y + 10:.2f}" text-anchor="middle">{number}</text>',
            f'<text class="token-code" x="{center_x:.2f}" y="{y + token_size - 6:.2f}" text-anchor="middle">{code}</text>',
        ])

    for col in range(SHEET_COLUMNS + 1):
        x = origin_x + col * token_size
        parts.extend([
            f'<line class="crop-mark" x1="{x:.2f}" y1="{origin_y - crop_mark_len_mm:.2f}" x2="{x:.2f}" y2="{origin_y:.2f}"/>',
            f'<line class="crop-mark" x1="{x:.2f}" y1="{origin_y + grid_height:.2f}" x2="{x:.2f}" y2="{origin_y + grid_height + crop_mark_len_mm:.2f}"/>',
        ])

    for row in range(SHEET_ROWS + 1):
        y = origin_y + row * token_size
        parts.extend([
            f'<line class="crop-mark" x1="{origin_x - crop_mark_len_mm:.2f}" y1="{y:.2f}" x2="{origin_x:.2f}" y2="{y:.2f}"/>',
            f'<line class="crop-mark" x1="{origin_x + grid_width:.2f}" y1="{y:.2f}" x2="{origin_x + grid_width + crop_mark_len_mm:.2f}" y2="{y:.2f}"/>',
        ])

    for col in range(1, SHEET_COLUMNS):
        x = origin_x + col * token_size
        for row in range(1, SHEET_ROWS):
            y = origin_y + row * token_size
            parts.extend([
                f'<line class="crop-mark" x1="{x - inner_cross_half_mm:.2f}" y1="{y:.2f}" x2="{x + inner_cross_half_mm:.2f}" y2="{y:.2f}"/>',
                f'<line class="crop-mark" x1="{x:.2f}" y1="{y - inner_cross_half_mm:.2f}" x2="{x:.2f}" y2="{y + inner_cross_half_mm:.2f}"/>',
            ])

    parts.append(
        f'<text class="page-note" x="{A4_WIDTH_MM - 10:.2f}" y="{A4_HEIGHT_MM - 6:.2f}" text-anchor="end">Fichas de sorteo - hoja {page_number}/{total_pages}</text>'
    )
    parts.append("</svg>")
    return "\n".join(parts)


def write_draw_sheet_svgs(out_dir: Path) -> list[Path]:
    draw_dir = out_dir / "svgs"
    draw_dir.mkdir(parents=True, exist_ok=True)

    tokens = make_draw_tokens()
    tokens_per_page = SHEET_COLUMNS * SHEET_ROWS
    pages = [
        tokens[index:index + tokens_per_page]
        for index in range(0, len(tokens), tokens_per_page)
    ]

    svg_paths = []
    for page_number, page_tokens in enumerate(pages, start=1):
        svg = render_draw_sheet_svg(page_tokens, page_number, len(pages))
        path = draw_dir / f"fichas_sorteo_{page_number:02d}.svg"
        path.write_text(svg, encoding="utf-8")
        svg_paths.append(path)

    return svg_paths


def write_pdf(svg_paths: list[Path], pdf_path: Path) -> None:
    inkscape = shutil.which("inkscape")
    pdfunite = shutil.which("pdfunite")

    if not inkscape:
        raise RuntimeError("No se encontro 'inkscape' en el sistema. Instala Inkscape para exportar el PDF.")
    if not pdfunite:
        raise RuntimeError("No se encontro 'pdfunite' en el sistema. Instala poppler-utils para unir los PDFs.")

    with tempfile.TemporaryDirectory(prefix="sorteo_pdf_") as tmp_dir_name:
        tmp_dir = Path(tmp_dir_name)
        page_pdfs = []

        for index, svg_path in enumerate(svg_paths, start=1):
            page_pdf = tmp_dir / f"page_{index:03d}.pdf"
            command = [
                inkscape,
                str(svg_path),
                "--export-type=pdf",
                f"--export-filename={page_pdf}",
            ]
            result = subprocess.run(command, capture_output=True, text=True)
            if result.returncode != 0:
                raise RuntimeError(
                    f"No se pudo exportar SVG con Inkscape: {svg_path}\n{result.stderr.strip()}"
                )
            page_pdfs.append(page_pdf)

        merge_command = [pdfunite, *(str(page_pdf) for page_pdf in page_pdfs), str(pdf_path)]
        result = subprocess.run(merge_command, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"No se pudo unir el PDF final.\n{result.stderr.strip()}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genera fichas recortables de sorteo para bingo en A4.")
    parser.add_argument("--out", type=Path, default=Path("salida_sorteo"), help="Carpeta de salida.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    svg_paths = write_draw_sheet_svgs(args.out)
    pdf_path = args.out / "fichas_sorteo_a4.pdf"
    write_pdf(svg_paths, pdf_path)

    print("Fichas: 30")
    print(f"Hojas A4: {len(svg_paths)}")
    print(f"SVGs: {args.out / 'svgs'}")
    print(f"PDF: {pdf_path}")


if __name__ == "__main__":
    main()
