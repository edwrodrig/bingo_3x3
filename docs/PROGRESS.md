# Progreso

## 2026-11-14 · Primera aplicación familiar

- TV y control vinculados por QR o código temporal; control autenticado.
- Sorteo aleatorio 1–30 sin repetición, deshacer y reiniciar; estado persistido.
- Animaciones manuales de victoria y ánimo; tres temas con datos educativos.
- Biblioteca de lotes 3×3 con vista previa y PDF carta de 12 cartones por hoja.
- Go sirve API/eventos y web; Python reutiliza `make_cards` del generador.
- Publicado en `dti_Server` con nginx, TLS y servicio independiente en el
  puerto interno 3013. HTTPS, login, biblioteca y PDF verificados desde fuera.
- Pendiente: prueba visual y de sonido en el LG físico; formatos de cartón 4×4,
  5×5, sílabas y dibujos son ampliaciones futuras.

## 2026-11-14 · Cuentas independientes

- Inicio de sesión con usuario y contraseña en `/remote/`.
- El antiguo secreto único migra a la cuenta administradora `bingo`.
- El administrador crea, desactiva y cambia contraseñas de cuentas de Bingo.
- Cada cuenta controla solo las TV que vinculó; la TV se abre sin cuenta.
- `/library/` es pública para abrirla; generar cartones y PDF exige sesión
  porque esa tarea usa Python en el servidor.
- Desplegado en `bingo.labo86.cl`. Verificado en producción: rutas públicas,
  generación bloqueada sin sesión, inicio de sesión de `bingo`, consulta de
  usuarios y generación autenticada. La gestión de una segunda cuenta y el
  aislamiento de TV se probaron localmente; quedan por ensayar en dispositivos
  reales cuando se creen cuentas adicionales.
