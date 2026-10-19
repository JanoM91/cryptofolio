# Cuentas privadas y almacenamiento

La aplicación conserva el modo local. Las cuentas son optativas y no se activan ni copian datos al actualizar el código. SQLite evita contratar un servicio adicional y es adecuado para una instalación pequeña con una sola instancia del servidor y un disco persistente. Requiere Node.js 24 LTS.

## Activación local, paso a paso

1. Exporta una copia JSON desde **Configuración → Importar y exportar**.
2. En el `.env` del servidor, conserva `CMC_API_KEY` y añade:

   ```dotenv
   ACCOUNTS_ENABLED=true
   DATABASE_PATH=./data/cryptofolio.sqlite
   REGISTRATION_CODE=coloca_aqui_una_invitacion_privada_aleatoria
   ```

   Sustituye el ejemplo por un valor aleatorio de al menos 24 caracteres. Puedes generarlo con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` en tu terminal. No lo publiques, no lo subas a Git y no uses tu contraseña como código. Es una invitación reutilizable mientras esté configurada.

3. Reinicia `npm run dev`. Ve a **Configuración → Cuenta y almacenamiento → Acceder a mi cuenta → Tengo una invitación**. Elige usuario y contraseña (12–128 caracteres), e introduce el código de invitación. No hay envío de correo ni recuperación por email.
4. Tu cuenta empieza vacía. Abre **Configuración → Revisar copia del navegador**. Revisa el destino, las posiciones, el total de movimientos y escenarios; el desplegable permite ver todos los registros. Descarga el respaldo, marca la confirmación y copia los datos.
5. La copia del navegador permanece intacta. A partir de entonces los cambios en la cuenta se guardan en SQLite y no se escriben en `localStorage`. Cerrar sesión vuelve a mostrar la copia local anterior, que no se mantiene sincronizada con la cuenta.
6. Para cerrar el registro, deja `REGISTRATION_CODE=` vacío y reinicia. Las cuentas existentes pueden seguir entrando. Mantén `ACCOUNTS_ENABLED=true` para continuar protegiendo datos y precios.

Cuando las cuentas están activadas, las consultas de precios y búsquedas requieren sesión. El modo demostración funciona sin sesión. En modo local sin cuentas, el servidor solo puede iniciarse en loopback.

## Guardados, errores y conflictos

- La interfaz confirma el guardado después de recibir respuesta del servidor. Si falla, conserva el formulario y ofrece descargar un borrador JSON. No hay cola de sincronización offline.
- Cada portafolio tiene una revisión. Si otro dispositivo guardó antes, la escritura se rechaza con 409: descarga tu borrador, recarga, compara y vuelve a aplicar los cambios. No hay fusión automática. Recarga para ver cambios remotos.
- La migración solo se permite en una cuenta que nunca haya guardado datos. Para restaurar una copia en una cuenta existente usa la restauración JSON, que pide confirmación y también verifica la revisión.
- Eliminar el portafolio borra sus registros en la base activa, conserva una revisión vacía y mantiene la cuenta. Las copias JSON, el almacenamiento del navegador y los respaldos antiguos son independientes. El borrado lógico no garantiza borrado forense del disco ni elimina respaldos.
- Una sesión dura siete días y cerrar sesión la invalida en el servidor. Si caduca durante una edición, descarga el borrador y recarga para entrar de nuevo.

## Qué se almacena y quién puede acceder

SQLite contiene usuario, hash de contraseña con sal aleatoria (scrypt), hash del token de sesión con caducidad, revisión y documento del portafolio. Las cantidades decimales permanecen como cadenas. Las consultas a CoinMarketCap siguen enviando solo identificadores, moneda y fechas, nunca cantidades o notas.

El propietario del portafolio se obtiene de la sesión, nunca de un ID enviado por el navegador. Las escrituras requieren origen permitido, JSON y token CSRF. Las cookies son HttpOnly y SameSite=Strict; en producción usan Secure y prefijo `__Host-`. Hay límites de solicitudes y de intentos de acceso. La base se crea con permisos 0600 y su directorio con 0700; `data/`, archivos SQLite y `.env` están excluidos de Git. Protege también cualquier ubicación personalizada de `DATABASE_PATH`.

La base no está cifrada: el administrador y quien pueda leer el disco tienen acceso. Utiliza cifrado de disco, permisos y respaldos adecuados. Esta versión no incluye MFA, recuperación de contraseña, administración de usuarios ni eliminación de cuentas desde la interfaz. Conserva la contraseña en un gestor; si la pierdes, requiere intervención administrativa. Los límites por IP son en memoria; detrás de un proxy se aplican conservadoramente a la IP del proxy, sin confiar en cabeceras reenviadas arbitrarias.

## Respaldos

```sh
npm run backup
```

Crea un respaldo consistente con la API de backup de SQLite en `data/backups/`, incluso si el servidor está en uso. Incluye todas las cuentas, hashes de contraseñas y sesiones: trátalo como información privada. No basta con copiar solo el archivo principal mientras SQLite está escribiendo en WAL.

Para restaurar: detén la aplicación, conserva una copia de la base actual y de sus archivos `-wal`/`-shm` si existen, restaura el respaldo como `DATABASE_PATH` en una ubicación sin archivos auxiliares antiguos, y aplica permisos 0600. Invalida las sesiones restauradas antes de abrir el servicio (`DELETE FROM sessions` usando SQLite). Verifica el contenido con el servidor aislado antes de volver a dar acceso. Esta operación es administrativa y no se ejecuta desde la interfaz.

## Antes de publicar

No se ha desplegado un servicio remoto. Para hacerlo se necesita un host con Node 24, una sola instancia, volumen persistente, HTTPS y respaldos externos protegidos. No sirve un disco efímero de funciones serverless ni varias réplicas independientes.

```dotenv
NODE_ENV=production
ACCOUNTS_ENABLED=true
APP_ORIGIN=https://tu-dominio.example
DATABASE_PATH=/ruta/persistente/cryptofolio.sqlite
HOST=127.0.0.1
PORT=3001
REGISTRATION_CODE=
CMC_API_KEY=tu_clave
```

`APP_ORIGIN` es el origen público exacto, sin barra final ni ruta. Un proxy HTTPS en el mismo host puede dirigir tráfico a loopback. Si el entorno necesita otro `HOST`, limita su acceso al proxy. El servidor rechaza producción sin cuentas y sin origen HTTPS; esto no configura TLS por sí solo. Compila con `npm run build` y ejecuta `npm start`. Conserva las dependencias de desarrollo necesarias para `tsx`.

Referencias: [SQLite en Node](https://nodejs.org/api/sqlite.html), [seguridad en Express](https://expressjs.com/en/advanced/best-practice-security/).
