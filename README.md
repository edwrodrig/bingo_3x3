# Bingo Fantástico · juego y generador de cartones 3x3

La aplicación web separa `/tv`, `/remote/` y `/library/`. La TV muestra la última
bolita, el tablero completo, datos curiosos y animaciones. La TV es pública.
El teléfono inicia sesión para dirigir un sorteo aleatorio sin repetición y
puede deshacer, reiniciar, cambiar de tema
o lanzar manualmente «¡Bingo!» y «Sigue jugando». La aplicación no registra ni
comprueba los cartones que usan los jugadores.

`/library/` se puede abrir sin cuenta, pero requiere inicio de sesión para
generar lotes porque el generador Python se ejecuta en el servidor. Previsualiza
los primeros 12 cartones y descarga un PDF vectorial
en blanco y negro, tamaño carta, con 3 columnas × 4 filas. Cada lote conserva
una semilla numérica en el nombre del PDF; la misma semilla y cantidad producen
los mismos cartones. El generador CLI original y su plantilla SVG siguen
disponibles como se explica más abajo.

## Ejecutar la aplicación localmente

Requiere Go 1.26+, Node 20+ y Python 3.10+. No se necesitan Inkscape ni
`pdfunite` para el PDF compacto de la aplicación.

```bash
npm ci
npm run build
mkdir -p .local/data
python3 -c 'import os,pathlib,secrets; p=pathlib.Path(".local/bingo-owner-password"); p.write_text(secrets.token_urlsafe(32)+"\n") if not p.exists() else None; os.chmod(p,0o600)'
BINGO_DATA_DIR=.local/data go run ./server owner bootstrap bingo < .local/bingo-owner-password
BINGO_DATA_DIR=.local/data go run ./server
```

Abre `http://127.0.0.1:3012/tv` en la pantalla y
`http://127.0.0.1:3012/remote/` en el teléfono. Ambos necesitan acceder al
mismo servidor. Inicia sesión en el teléfono con la contraseña guardada en
`.local/bingo-owner-password` y el usuario `bingo`, escanea el QR o escribe el código de la TV.
El administrador puede crear otras cuentas, desactivarlas y cambiar sus claves
desde «Gestionar usuarios» en el control. Cada cuenta vincula sus propias TV;
los cartones se pueden generar con cualquier cuenta activa. Bingo no comparte
usuarios ni contraseñas con Dance Trainer. La primera versión de Bingo migra
automáticamente su contraseña única al usuario `bingo`.
Los datos y la contraseña local están fuera de Git. `npm test` comprueba el
sorteo y el PDF; `npm run build` genera los archivos web.

## Producción

La aplicación está publicada en `https://bingo.labo86.cl`, aislada de Dance
Trainer en `dti_Server`. `bash scripts/deploy-dti.sh` construye, prueba, respalda
datos existentes y publica Go detrás de nginx/TLS. En la primera instalación
crea `.local/bingo-owner-password` con permisos `600` y usa esa contraseña para
iniciar la cuenta `bingo` del control. Consulta [despliegue](docs/DEPLOYMENT.md).

## Ampliaciones previstas

El sorteo y los cartones actuales usan el contrato `bingo_3x3_v1`: B 1–10,
I 11–20, N 21–30. Las pantallas y el PDF consumen los datos del lote; las
reglas viven en el generador. Para añadir 4×4, 5×5, sílabas o dibujos hará
falta versionar un formato de cartón nuevo y añadir su presentación e impresión.
Los temas de TV son independientes de las reglas y se pueden ampliar con
nuevos datos e ilustraciones.

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

## Generar fichas del sorteo

```bash
python sorteo_generator.py --out salida_sorteo
```

Esto genera:

- `salida_sorteo/svgs/`: un SVG por hoja A4
- `salida_sorteo/fichas_sorteo_a4.pdf`: PDF con las 30 fichas recortables

Las fichas del sorteo se generan de forma independiente a los cartones, en 3 hojas A4 con piezas grandes y bordes rectos para facilitar el corte.

## Modificar diseño

Edita `bingo_template.svg`.

No elimines estos placeholders si quieres que el programa siga funcionando:

- `{{CARD_ID}}`
- `{{B00}}`, `{{B01}}`, `{{B02}}`
- `{{B10}}`, `{{B11}}`, `{{B12}}`
- `{{B20}}`, `{{B21}}`, `{{B22}}`

## Instalar dependencias

```bash
sudo apt install inkscape poppler-utils
```

El PDF final se arma exportando cada SVG con Inkscape y uniendo las paginas con `pdfunite`.
