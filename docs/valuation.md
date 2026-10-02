# Reglas de valoración

## Saldos y tiempo

Cada activo tiene un único saldo inicial fechado. Los movimientos con fecha/hora estrictamente posterior modifican ese saldo. Los anteriores o simultáneos están incluidos en él y no se vuelven a sumar. Para registrar todo el historial desde cero, usa saldos iniciales cero anteriores a los movimientos. Una edición del saldo inicial puede cambiar resultados históricos: exporta antes de corregirlo.

Las transacciones se aplican cronológicamente; si comparten instante, mantienen el orden de captura/importación. Nunca se permiten saldos negativos, ventas sin activo ni compras sin efectivo. La aplicación es long-only. Una transferencia representa una entrada o salida del perímetro del portafolio; no debe duplicarse una transferencia entre wallets ya incluidas en él.

Los instantes se guardan normalizados en UTC. Las entradas manuales usan la zona elegida; los CSV aceptan ISO 8601 con zona explícita. No se admiten fechas futuras. La selección de rango personalizado usa los límites del día en la zona seleccionada y recorta el final al presente.

Para reconstruir posiciones históricas se requiere una fecha `historyFrom` confirmada por el usuario. Los saldos iniciales deben ser anteriores o iguales a ella. Si la fecha pedida precede la cobertura o un saldo inicial, se detiene el cálculo y se identifica el dato faltante. La aplicación no puede detectar movimientos externos omitidos por el usuario.

## Valores y costo

- Valor de posición = cantidad × precio de referencia en la moneda de visualización.
- El efectivo en esa misma moneda vale 1 por unidad (identidad, no cotización de mercado).
- El efectivo en otra moneda se convierte con el tipo CMC, con fecha y tasa visibles.
- Un precio faltante produce una posición sin datos y un subtotal incompleto, no un total válido.
- Las matemáticas utilizan Decimal.js con 40 dígitos de precisión; las entradas aceptan hasta 18 decimales y cantidades de hasta 10^24. El modo de operación por monto convierte a cantidad con 18 decimales. Los gráficos y números mostrados redondean; no se redondea el saldo tras cada operación.
- Costo: promedio ponderado móvil. Una compra suma precio × cantidad + comisión fija a la base de costo. Una venta reduce el costo en proporción a las unidades vendidas. Las comisiones de venta reducen el efectivo recibido.
- Un costo inicial desconocido, depósito en especie o transferencia de entrada sin costo documentado impide calcular la ganancia no realizada de esa posición. No se atribuye costo cero.
- Compras en monedas distintas hacen desconocido el costo agregado salvo que la posición anterior estuviera cerrada. No se hace conversión retrospectiva implícita de costos. La ganancia total solo aparece si todos los costos relevantes son conocidos y están en la moneda de visualización. No se calcula ganancia realizada.
- El efectivo se excluye del rendimiento por costo: su base en la presentación equivale a su valor. No se presentan ganancias cambiarias de efectivo.

## Cambios de valor

El indicador principal de 24 h compara el saldo reconstruido de hace 24 horas con el saldo actual e incluye movimientos. Requiere cobertura histórica confirmada y precios completos. El indicador secundario «Solo precios» usa cantidades **actuales constantes** y el porcentaje del proveedor; no es el cambio real del saldo ni una rentabilidad ajustada por flujos. Si faltan referencias o FX comparable, cada indicador queda sin datos de forma independiente.

La variación del período compara las posiciones reconstruidas al inicio y al final con sus precios respectivos. En rangos que terminan ahora se usan las cotizaciones actuales; los rangos que terminan en el pasado comparan ambos instantes históricos. Solo se calcula con cobertura completa.

La descomposición visible utiliza:

- Efecto precios = cantidades iniciales × (precio final − precio inicial).
- Efecto cantidades = (cantidades finales − cantidades iniciales) × precio final.

El segundo componente agrupa depósitos, retiros y operaciones; no equivale a flujo externo neto ni a rentabilidad ponderada por tiempo o dinero. No se presenta como tal.

El gráfico muestrea referencias discretas; las líneas son una guía visual entre observaciones conocidas. No se imputan valores entre puntos, ni se conectan observaciones faltantes. Los detalles de cada precio están disponibles en las consultas históricas. Cotizaciones actuales con más de 15 minutos se marcan como desactualizadas.

## Escenarios

Los escenarios guardan instrucciones separadas del portafolio. Al compararlos se reconstruye el saldo inicial desde el historial actual: corregirlo también modifica la base de escenarios existentes; no son copias auditables inmutables.

El caso base conserva las posiciones iniciales sin operaciones hasta la fecha final. El caso hipotético aplica las operaciones en orden a la fecha inicial. Ambos se valoran con los mismos precios finales. Las transacciones reales posteriores se excluyen de ambos casos. Una venta mantiene efectivo en la moneda elegida. La reinversión se expresa con una o más compras posteriores, usando el efectivo disponible. No hay FX de ejecución automático, posiciones cortas, slippage ni impacto de mercado. Comisiones expresadas como importe fijo en la moneda de ejecución.

El escenario rápido modifica un único precio; mantiene cantidades, efectivo y demás precios constantes. Las valoraciones futuras mediante operaciones no están habilitadas porque no existen precios observados: para un supuesto futuro explícito usa el escenario rápido.
