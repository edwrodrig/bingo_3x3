# Bingo Fantástico

La aplicación separa `/tv`, `/remote/` y `/library/`. La TV muestra las bolitas,
el tablero, datos curiosos y animaciones. El teléfono inicia sesión para dirigir
un sorteo aleatorio sin repetición, deshacer, reiniciar, cambiar de tema o
modalidad y lanzar manualmente «¡Bingo!» o «Sigue jugando». El sorteo y su
estado se guardan en el servidor. La aplicación no comprueba los cartones de
los jugadores.

La biblioteca es pública. Genera en el navegador cartones distintos y un PDF
vectorial en blanco y negro, tamaño carta, con 12 cartones por hoja. La vista
previa y el PDF usan el mismo lote. Los cartones y el PDF no se envían al
servidor; no se necesita Python ni inicio de sesión para crearlos.

## Modalidades

| Modalidad | Columnas y rangos | Bolitas | Centro libre |
| --- | --- | ---: | --- |
| 3×3 | B 1–10, I 11–20, N 21–30 | 30 | No |
| 4×4 | B 1–15, I 16–30, N 31–45, G 46–60 | 60 | No |
| 5×5 clásico | B 1–15, I 16–30, N 31–45, G 46–60, O 61–75 | 75 | Sí |

Elige la misma modalidad en el control y en la biblioteca. Cambiarla en el
control comienza un sorteo nuevo.

## Ejecutar localmente

Requiere Go 1.26+ y Node 20+.

```bash
npm ci
npm run build
mkdir -p .local/data
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),p=".local/bingo-owner-password"; if(!fs.existsSync(p)) fs.writeFileSync(p,crypto.randomBytes(32).toString("base64url")+"\n",{flag:"wx",mode:0o600})'
BINGO_DATA_DIR=.local/data go run ./server owner bootstrap bingo < .local/bingo-owner-password
BINGO_DATA_DIR=.local/data go run ./server
```

Abre `http://127.0.0.1:3012/tv` en la pantalla,
`http://127.0.0.1:3012/remote/` en el teléfono y
`http://127.0.0.1:3012/library/` para crear cartones. La TV y el teléfono
deben acceder al mismo servidor. Inicia sesión en el teléfono con el usuario
`bingo` y la contraseña guardada en `.local/bingo-owner-password`; vincula la
TV mediante el QR o su código. El administrador puede crear otras cuentas,
desactivarlas y cambiar sus claves desde el control. Cada cuenta vincula sus
propias TV. Los datos y la contraseña local están fuera de Git.

`npm test` comprueba el sorteo, los cartones y el PDF. `npm run build` genera
los archivos web.

## Producción

La aplicación está publicada en `https://bingo.labo86.cl`, aislada de Dance
Trainer en `dti_Server`. `bash scripts/deploy-dti.sh` construye, prueba,
respalda los datos existentes y publica Go detrás de nginx/TLS. Consulta la
[guía de despliegue](docs/DEPLOYMENT.md).
