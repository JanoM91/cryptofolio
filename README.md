# Cryptofolio

Panel personal de gestión y análisis de portafolios. Interfaz en español, MXN/USD, zona horaria configurable y demostración explícita, independiente de tus datos.

## Inicio rápido

Requiere Node.js 22.12+ o 24 LTS y npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

Abre http://127.0.0.1:5173. Sin credenciales puedes registrar tu portafolio y elegir **Explorar demo** para probar gráficos e hipótesis con precios ficticios. La demostración no implica conexión al proveedor y se reinicia al recargar.

Para cotizaciones reales, añade en `.env`:

```dotenv
CMC_API_KEY=tu_clave_de_coinmarketcap
PORT=3001
HOST=127.0.0.1
CMC_REQUESTS_PER_MINUTE=25
```

Reinicia el servidor. Nunca uses un prefijo `VITE_` para secretos. `.env` está excluido de Git. El navegador solo consulta al servidor local. El proxy de desarrollo apunta al puerto 3001; si lo cambias, actualiza también `vite.config.ts`.

```sh
npm run check        # pruebas de dominio/proveedor + tipos + build
npm run format      # formato consistente
npm run build
npm start           # sirve dist/ y API en http://127.0.0.1:3001
```

`npm start` necesita las dependencias de desarrollo instaladas porque ejecuta TypeScript con `tsx`. En un servicio público hay que añadir autenticación al proxy de precios y HTTPS; esta entrega se enlaza a loopback y está pensada para uso personal local. No hay autenticación ni servidor de datos multiusuario.

## Flujos implementados

- **Vista general:** valor, cambio total de 24 h y efecto de precios con cantidades constantes, ganancia no realizada cuando es calculable, evolución reconstruida, distribución por activo/clase, tabla con búsqueda y orden.
- **Posiciones:** selección por nombre, símbolo e ID CMC; efectivo MXN/USD; saldo inicial fechado, edición y eliminación.
- **Movimientos:** compra, venta, depósito, retiro y transferencia de entrada/salida, con precio, comisión fija, moneda y notas. Compras/ventas actualizan efectivo y posiciones.
- **CSV:** plantillas descargables, verificación de ID/símbolo, validación fila a fila y revisión completa antes de confirmar. La importación es atómica: no se guardan filas de un archivo inválido. Importar de nuevo el mismo archivo agrega movimientos nuevamente; revisar antes de confirmar.
- **Historial:** valoración de cantidades actuales a precios pasados y reconstrucción de posiciones reales. Esta última exige confirmar la integridad del historial en Configuración.
- **Simulador:** operaciones por cantidad o monto, comisiones, venta con conservación de efectivo y reinversión mediante compras posteriores en la misma moneda. Guardar, renombrar, eliminar y comparar alternativas. Escenario rápido por precio absoluto o porcentaje.
- **Configuración:** moneda base, zona horaria, cobertura del historial, integración, exportación/restauración JSON y eliminación completa.

## Arquitectura

El repositorio estaba vacío. Se eligió una aplicación pequeña de un solo paquete:

```text
src/                 React + TypeScript, vistas y componentes reutilizables
shared/model.ts      Esquemas Zod y tipos compartidos
shared/engine.ts     Motor de saldos, costo, valoración y simulación (Decimal.js)
shared/demo.ts       Fixtures ficticios, separados del proveedor real
server/provider.ts   Interfaz MarketProvider + adaptador CoinMarketCap
server/index.ts      Express, validación HTTP, límites y cabeceras
tests/              Pruebas deterministas de cálculos y contrato del proveedor
```

Vite permite iterar y compilar sin añadir una plataforma de despliegue. Express mantiene secretos y caché del lado servidor. `localStorage` evita servicios adicionales para un portafolio personal. Todos los decimales del dominio se guardan como cadenas; solo gráficos y formato final usan números de presentación.

El modelo contempla `crypto`, `cash`, `stock` y `etf`. Acciones y ETF aún no tienen fuente ni formulario específico: se necesita implementar otro adaptador `MarketProvider` y resolver identificadores/mercados. Nunca se envían a endpoints cripto.

## Mercado e integración oficial

Referencia verificada el 2 de octubre de 2026:

- [Criptomonedas: API oficial](https://coinmarketcap.com/api/documentation/pro-api-reference/cryptocurrency): `/v1/cryptocurrency/map`, `/v2/cryptocurrency/info`, `/v3/cryptocurrency/quotes/latest`, `/v3/cryptocurrency/quotes/historical`.
- [Monedas y conversión](https://coinmarketcap.com/api/documentation/pro-api-reference/tools): `/v1/fiat/map`, `/v2/tools/price-conversion`.

La búsqueda por nombre consulta los primeros 5,000 activos por rango; usa el símbolo exacto en mayúsculas o ID numérico para localizar otros activos. El ID estable es la identidad del activo; nunca se elige automáticamente entre símbolos duplicados.

Caché en memoria: 60 s para actual, 1 h para histórico y búsqueda, 24 h para mapa fiat; máximo 500 entradas. Solicitudes simultáneas iguales se comparten. Límite local configurable hacia CMC y 90 consultas/minuto por IP en la API. Timeout de 12 s. Los errores no se convierten en precios de demostración. Reiniciar borra la caché, no el portafolio.

Históricos: se consultan referencias horarias dentro de las 24 h previas. Para fechas de más de 28 días, se solicitan referencias diarias para aprovechar la cobertura diaria del plan. Se descartan referencias posteriores al instante solicitado. El gráfico real usa hasta 8 puntos muestreados por período para controlar consumo; **no representa una serie diaria exhaustiva**. No se conectan huecos ni se inventan precios. Las cotizaciones cripto se solicitan directamente en la moneda elegida; el efectivo en otra moneda requiere la conversión fiat y su fecha real.

La disponibilidad, antigüedad máxima, créditos, frecuencia y derechos comerciales dependen del plan vigente de CMC y de cada activo. Un plan con históricos cripto diarios puede no incluir conversiones fiat históricas equivalentes. Una respuesta posterior de FX se rechaza. Sin cobertura se muestra un subtotal identificado o “sin datos”, nunca un total completo ficticio. El 2 de octubre de 2026 se verificaron consultas autenticadas de BTC en USD/MXN, una referencia histórica de BTC de un año antes y conversión fiat actual USD/MXN. Esta comprobación no garantiza cobertura para otros activos o fechas.

## Datos y supuestos

Consulta [docs/valuation.md](docs/valuation.md) para las reglas exactas y [docs/verification.md](docs/verification.md) para la verificación.

Se guardan posiciones, movimientos, escenarios y preferencias en `cryptofolio:portfolio:v1` del navegador. El servidor recibe IDs de activos, fechas y moneda, no cantidades ni notas. No hay sincronización, cifrado de almacenamiento local ni recuperación remota. Exporta JSON antes de borrar datos del navegador o cambiar de dispositivo. La restauración valida el archivo y pide confirmación antes de sustituir datos.

No conecta wallets/exchanges, ejecuta órdenes, calcula impuestos ni ofrece recomendaciones de inversión.
