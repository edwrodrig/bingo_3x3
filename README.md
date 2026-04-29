# Generador de cartones de bingo 3x3

## Reglas

- Columna B: 1 al 10
- Columna I: 11 al 20
- Columna N: 21 al 30
- Cartón de 3 x 3
- Números aleatorios sin repetirse dentro de cada columna
- Cartones no duplicados dentro del lote
- Salida en SVG editable y PDF tamaño carta

## Uso básico

```bash
python bingo_generator.py --cantidad 40 --seed 1234 --out salida_bingo
```

Esto genera:

- `salida_bingo/cartones.json`: datos del lote
- `salida_bingo/svgs/`: un SVG por cartón
- `salida_bingo/cartones_bingo.pdf`: PDF carta, un cartón por página

## Regenerar el mismo lote sin cambiar los números

```bash
python bingo_generator.py --data salida_bingo/cartones.json --out salida_regenerada
```

## Modificar diseño

Edita `bingo_template.svg`.

No elimines estos placeholders si quieres que el programa siga funcionando:

- `{{CARD_ID}}`
- `{{B00}}`, `{{B01}}`, `{{B02}}`
- `{{B10}}`, `{{B11}}`, `{{B12}}`
- `{{B20}}`, `{{B21}}`, `{{B22}}`

## Instalar dependencias

```bash
pip install reportlab svglib
```
