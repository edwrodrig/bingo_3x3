# Despliegue en dti_Server

`bingo.labo86.cl` apunta a `152.74.160.41`. Bingo utiliza su propio servicio
`bingo.service`, puerto interno `3013`, nginx, certificado TLS y directorio
`/srv/bingo`; no comparte los datos de Dance Trainer.

```bash
bash scripts/deploy-dti.sh
```

El script requiere acceso SSH `edwin@152.74.160.41` con `sudo -n` y verificación
estricta de host. Se puede indicar `BINGO_SSH_KEY` o `BINGO_SSH_PUBKEY` si el
agente SSH no selecciona la clave adecuada. También admite `BINGO_CERT_EMAIL`.
Antes de activar un nuevo release, guarda un respaldo de `/srv/bingo/data` en
`.local/backups/`. Conserva datos y el hash de la cuenta en `/srv/bingo/data`.
El release contiene el binario Go, la web compilada y el generador Python.

La contraseña inicial del control queda solo en
`.local/bingo-owner-password`, ignorada por Git. El servidor conserva su hash
en `/srv/bingo/data/owner.hash`. No copies la contraseña al repositorio. Si se
pierde el archivo local, restablécela por un procedimiento manual antes de
eliminar el hash de producción; un despliegue posterior no la sobrescribe.

Comprueba `https://bingo.labo86.cl/api/health`, abre `/tv`, vincula desde
`/remote/` y genera un PDF en `/library/`. Para diagnosticar el servicio:
`ssh edwin@152.74.160.41 'systemctl status bingo.service'`.

El uso en el televisor LG físico y la activación del audio por gesto del usuario
deben verificarse allí: los navegadores de TV pueden bloquear audio iniciado
automáticamente. El juego visual funciona sin sonido.
