# Verificación de entrega

Fecha: 2 de octubre de 2026.

## Automática

- 41 pruebas de dominio, proveedor y zona horaria: todas aprobadas.
- TypeScript en modo estricto y compilación de producción: aprobados.
- Prettier: aprobado.
- Auditoría de dependencias al instalar: cero vulnerabilidades después de actualizar Vitest a 4.1.11.
- GitHub Actions ejecuta pruebas, compilación y formato en cada push/PR. El resultado local no sustituye la ejecución remota.

Casos cubiertos: compras, ventas, comisiones, precisión decimal, costo promedio, costos desconocidos/moneda incompatible, depósitos, transferencias, saldos insuficientes, historia incompleta, fechas futuras, normalización UTC, horario de verano ambiguo/inexistente, aislamiento de escenarios, reinversión, base cero, respuesta CMC v3, precios ausentes/posteriores, moneda faltante, clave ausente y rechazo de instrumentos sin proveedor.

## API local

Se verificaron `/api/status`, `/api/quotes` sin clave y parámetros inválidos. El estado indica configuración pendiente; no se simula una conexión real. El efectivo en moneda idéntica se valora a 1 y el activo cripto devuelve el mensaje de falta de clave.

## Interfaz, navegador real

- Vista vacía y modo demostración aislado.
- Diseño de escritorio a 1440 px y móvil a 390 px; menú móvil operativo.
- Venta hipotética de 0.1 BTC a 68,000 USD, comisión 10 USD: saldo final 0.32 BTC y 9,290 USD, sin cambiar las posiciones base.
- Guardar y comparar escenario: desglose final y diferencia monetaria visibles.
- Consulta de cantidades actuales con precios de un año antes, etiqueta histórica y fechas individuales visibles.
- Importación CSV de demostración: revisión de una fila de efectivo por 1,850 MXN, confirmación y posición nueva visible (7 activos), equivalente ficticio de 100 USD a tasa demo 18.5.
- Captura de posiciones tras importar: [positions-demo.jpg](qa/positions-demo.jpg).

## Pendiente de credenciales o infraestructura

Tras configurar credenciales locales, se verificaron cotizaciones autenticadas de BTC en USD y MXN, una referencia histórica de BTC de un año antes y conversión fiat actual USD/MXN. Se corrigió la interpretación del código de éxito textual `"0"` de CMC v3 y se añadieron cuatro pruebas de regresión para códigos numéricos y textuales. No se incluyen credenciales ni datos de cuenta en el repositorio. La cobertura para otros activos, fechas y conversiones históricas sigue dependiendo del plan.

No se desplegó un servicio público ni se conectó un proveedor de acciones/ETF. La entrega inicial guardaba los datos en el navegador; la ampliación de cuentas se describe abajo. El histórico del gráfico se muestrea en hasta ocho referencias por período para limitar consumo. Consulta README y valuation.md para los límites funcionales completos.

## Ampliación del 19 de octubre de 2026: cuentas privadas

- 51 pruebas automáticas: dominio, proveedor, fechas y 10 casos de cuentas/persistencia.
- Pruebas HTTP con dos cuentas distintas: aislamiento, invitación inválida, credenciales inválidas, origen, CSRF, cookies, hashes, sesión caducada, cierre de sesión, validación del portafolio, copia inicial, conflictos simultáneos y borrado con revisión.
- Persistencia tras cerrar y abrir SQLite, conservación de 18 decimales y permisos del archivo.
- Interfaz probada contra un servidor temporal sin clave CMC y una base en memoria: copia local ficticia de 0.125 BTC, revisión y confirmación de migración, edición en cuenta a 0.25 BTC, recuperación tras volver a entrar y copia local de 0.125 BTC conservada al cerrar sesión.
- Diseño de la nueva sección comprobado en escritorio y móvil a 390 px; copia y reapertura del respaldo SQLite comprobadas con una base temporal.
- El entorno temporal usó un usuario y contraseña de prueba. No se migraron posiciones reales ni se modificó la configuración privada del usuario.

La activación, el respaldo y las limitaciones están en [accounts.md](accounts.md). No se ha desplegado un servicio remoto, habilitado registro público ni añadido recuperación de contraseñas.
