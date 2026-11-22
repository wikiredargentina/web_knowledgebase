# Root File Editor

Pequeña web app para explorar y editar archivos de texto dentro de una carpeta raíz. No tiene usuarios ni autenticación propia; está pensada para publicarse detrás de la protección HTTP del VPS.

## Uso local

Requiere Node.js 18 o superior. Copiá `.env.example` como `.env`, generá el hash de contraseña y completá sus variables:

```bash
npm start
```

```bash
cp .env.example .env
npm run hash-password -- "tu contraseña"
```

Pegá el resultado en `PASSWORD` dentro de `.env`. La aplicación incluye login, sesiones de 8 horas, subida, descarga, creación, renombrado y eliminación de archivos/carpetas.

Abrí `http://127.0.0.1:3000`. Por defecto, la raíz editable es la carpeta desde la que se ejecuta el servidor. Para elegir otra carpeta, sin salir del proyecto de la aplicación:

```bash
EDITOR_ROOT=/ruta/al/proyecto PORT=3000 npm start
```

Variables disponibles: `EDITOR_ROOT`, `PORT` y `HOST` (por defecto `127.0.0.1`).

## VPS detrás de Nginx

Mantené `HOST=127.0.0.1` y configurá el subdominio para hacer proxy a `127.0.0.1:3000`. Protegé el subdominio con tu autenticación HTTP antes de exponerlo. Conviene ejecutarlo con systemd y usar un usuario con permisos únicamente sobre el proyecto que querés editar.

La API valida todas las rutas y rechaza intentos de salir de `EDITOR_ROOT`. Se excluyen `.git` y `node_modules` del árbol visual.
