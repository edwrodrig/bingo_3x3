#!/usr/bin/env python3
"""
Generador de cartones de bingo 3x3.

Reglas:
- Columna B: numeros del 1 al 10
- Columna I: numeros del 11 al 20
- Columna N: numeros del 21 al 30
- Cada carton tiene 3 numeros por columna, sin repetirse dentro de la columna.
- El lote completo evita cartones duplicados.
- Los numeros se guardan en JSON para regenerar el mismo lote sin cambios.
- Cada carton se exporta como SVG usando una plantilla editable.
- Tambien se genera un PDF tamaño carta, un carton por pagina.

Uso:
  python bingo_generator.py --cantidad 40 --seed 1234 --out salida
  python bingo_generator.py --data salida/cartones.json --out salida_regenerada
"""

from __future__ import annotations

import argparse
import json
import random
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Tuple


RANGES = [
    range(1, 11),
    range(11, 21),
    range(21, 31),
]


def make_card(rng: random.Random) -> List[List[int]]:
    """Crea un carton 3x3. Cada columna se toma desde su rango."""
    columns = [rng.sample(list(number_range), 3) for number_range in RANGES]
    # Convertir columnas a filas
    return [[columns[col][row] for col in range(3)] for row in range(3)]


def card_key(card: List[List[int]]) -> Tuple[int, ...]:
    return tuple(value for row in card for value in row)


def make_cards(amount: int, seed: int | None = None) -> List[Dict]:
    rng = random.Random(seed)
    cards = []
    seen = set()

    attempts = 0
    max_attempts = max(1000, amount * 100)

    while len(cards) < amount:
        attempts += 1
        if attempts > max_attempts:
            raise RuntimeError("No se pudo generar suficientes cartones unicos. Reduce la cantidad.")

        card = make_card(rng)
        key = card_key(card)
        if key in seen:
            continue

        seen.add(key)
        cards.append({
            "id": len(cards) + 1,
            "grid": card,
        })

    return cards


def load_template(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(f"No existe la plantilla SVG: {path}")
    return path.read_text(encoding="utf-8")


def render_svg(template: str, card: Dict) -> str:
    svg = template.replace("{{CARD_ID}}", str(card["id"]))
    grid = card["grid"]

    for row in range(3):
        for col in range(3):
            svg = svg.replace(f"{{{{B{row}{col}}}}}", str(grid[row][col]))

    return svg


def save_cards_json(cards: List[Dict], path: Path, seed: int | None) -> None:
    data = {
        "format": "bingo_3x3_v1",
        "rules": {
            "columns": [
                {"label": "B", "min": 1, "max": 10},
                {"label": "I", "min": 11, "max": 20},
                {"label": "N", "min": 21, "max": 30},
            ],
            "size": "3x3",
            "unique_within_card_column": True,
            "unique_cards_in_batch": True,
        },
        "seed": seed,
        "cards": cards,
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_cards_json(path: Path) -> List[Dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("format") != "bingo_3x3_v1":
        raise ValueError("El JSON no tiene formato bingo_3x3_v1")
    return data["cards"]


def write_svgs(cards: List[Dict], template_path: Path, out_dir: Path) -> List[Path]:
    template = load_template(template_path)
    svg_dir = out_dir / "svgs"
    svg_dir.mkdir(parents=True, exist_ok=True)

    svg_paths = []
    for card in cards:
        svg = render_svg(template, card)
        path = svg_dir / f"carton_{card['id']:03d}.svg"
        path.write_text(svg, encoding="utf-8")
        svg_paths.append(path)

    return svg_paths


def write_pdf(svg_paths: List[Path], pdf_path: Path) -> None:
    inkscape = shutil.which("inkscape")
    pdfunite = shutil.which("pdfunite")

    if not inkscape:
        raise RuntimeError("No se encontro 'inkscape' en el sistema. Instala Inkscape para exportar el PDF.")
    if not pdfunite:
        raise RuntimeError("No se encontro 'pdfunite' en el sistema. Instala poppler-utils para unir los PDFs.")

    with tempfile.TemporaryDirectory(prefix="bingo_pdf_") as tmp_dir_name:
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
    parser = argparse.ArgumentParser(description="Genera cartones de bingo 3x3 en SVG y PDF.")
    parser.add_argument("--cantidad", type=int, default=20, help="Cantidad de cartones a generar.")
    parser.add_argument("--seed", type=int, default=None, help="Semilla para reproducibilidad.")
    parser.add_argument("--data", type=Path, default=None, help="JSON existente para regenerar el mismo lote.")
    parser.add_argument("--template", type=Path, default=Path("bingo_template.svg"), help="Plantilla SVG editable.")
    parser.add_argument("--out", type=Path, default=Path("salida_bingo"), help="Carpeta de salida.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    if args.data:
        cards = load_cards_json(args.data)
        seed = None
    else:
        cards = make_cards(args.cantidad, args.seed)
        seed = args.seed
        save_cards_json(cards, args.out / "cartones.json", seed)

    svg_paths = write_svgs(cards, args.template, args.out)
    write_pdf(svg_paths, args.out / "cartones_bingo.pdf")

    print(f"Cartones: {len(cards)}")
    print(f"SVGs: {args.out / 'svgs'}")
    print(f"PDF: {args.out / 'cartones_bingo.pdf'}")
    if not args.data:
        print(f"JSON: {args.out / 'cartones.json'}")


if __name__ == "__main__":
    main()
