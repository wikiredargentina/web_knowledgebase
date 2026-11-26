# Boveda

Web app para explorar, editar y administrar archivos dentro de una carpeta raíz. Incluye login, pestañas, edición de texto, vista previa de imágenes/PDF/audio/video, drag & drop, subida, descarga, creación, renombrado y eliminación.

## Configuración

Requiere Node.js 18 o superior. Copiá el ejemplo y generá el hash de la contraseña:

```bash
cp .env.example .env
npm run hash-password -- "tu contraseña"
```

Pegá el resultado en `PASSWORD`. Ejemplo de `.env`:

```env
EDITOR_ROOT=/ruta/al/proyecto/files
USER=admin
PASSWORD=scrypt$...
HOST=127.0.0.1
PORT=3000
FAVICON=/img/favicon.png
LOGO=/img/logo.png
APP_TITLE=Boveda
```

`FAVICON` y `LOGO` también aceptan URLs externas:

```env
FAVICON=https://cdn.ejemplo.com/favicon.png
LOGO=https://cdn.ejemplo.com/logo.png
```

Las URLs deben ser accesibles públicamente. Si la aplicación usa HTTPS, conviene usar también URLs `https://`.

`APP_TITLE` define el nombre que aparece en la pestaña del navegador.

## Ejecución local

```bash
npm start
```

Abrí `http://127.0.0.1:3000` o el puerto definido en `.env`.

## Ejecución con PM2

Dentro de un `ecosystem.config.js` existente:

```js
{
  name: "boveda",
  script: "./server.js",
  cwd: "/ruta/al/proyecto/boveda",
  interpreter: "node",
  instances: 1,
  exec_mode: "fork",
  autorestart: true,
  watch: false,
  max_memory_restart: "300M",
  env: { NODE_ENV: "production" }
}
```

```bash
pm2 start ecosystem.config.js
pm2 save
```

Si Boveda ya existe en PM2:

```bash
pm2 restart boveda --update-env
```

## Nginx y subdominio

Mantené `HOST=127.0.0.1` y configurá Nginx para hacer proxy al puerto de `.env`:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Protegé el subdominio con autenticación HTTP en Nginx antes de publicarlo.

## Seguridad y límites

- Todas las rutas se validan contra `EDITOR_ROOT`.
- No se permite salir de la carpeta raíz.
- `.git` y `node_modules` no se muestran en el árbol.
- `PASSWORD` debe contener un hash `scrypt`, nunca una contraseña en texto plano.
- Para producción, usá HTTPS y permisos restringidos para el usuario que ejecuta PM2.
