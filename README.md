# CardDebt Pro v2 (PWA)
**Reglas implementadas**:
1) Interés **dinámico**: el monto de intereses mostrado siempre refleja el **balance actual** y el **APR actual**. En el **día de cobro**, se aplica una vez con esos valores y **capitaliza** (se suma a la deuda).
2) **Editar/Borrar movimientos**: al editar, se **revierte** el efecto del movimiento anterior y se aplica el nuevo; al borrar, se revierte el efecto.
3) Si cambias el **% de interés**, el cálculo de interés mensual se actualiza al instante y será el usado en el próximo **día de cobro**.

**No** incluye pago mínimo ni notificaciones (por pedido).

## Vistas
- **General**: suma de deudas, suma de intereses (mensual), últimos movimientos.
- **Tarjetas**: balance, interés mensual estimado, día restante a pago, APR y día de cobro, historial por tarjeta.

## Persistencia
Datos en `localStorage` bajo la clave `cc:debt:data`.

## Deploy
Sube a Cloudflare Pages sin build (Output `/`). Funciona offline y se auto-actualiza.
