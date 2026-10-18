# Dónde automatizar, y dónde no

La pregunta útil no es «qué se puede automatizar» —casi todo— sino **qué trabajo
repetitivo existe de verdad y qué puerta está realmente abierta**. Dos de las
respuestas las decidió la investigación, no la opinión, y las dos van en contra
de lo que parecía obvio.

## La puerta de la API está cerrada, y eso cambia la prioridad

La automatización que cualquiera pediría primero es «que mis operaciones entren
solas desde la plataforma». Eso exige API, y la API no está disponible aquí:

- **Tradovate** pide una cuenta **live** con **≥ $1.000** de capital y un añadido
  de **API Access (~$25/mes)** antes de generar una clave, y las cuentas de
  **prop firm y de evaluación no cualifican**. Los datos en tiempo real son otro
  coste aparte (licencia CME, del orden de $290–$500/mes), aunque para leer
  *historial* de ejecuciones eso no haría falta.
- **Apex Trader Funding** no publica export ni API documentados. Lo que aparece
  buscando «Apex» es *Apex Clearing*, que es otra empresa.

> **Cuidado con estas cifras:** salen de un blog de un proveedor con interés
> comercial y de hilos de la comunidad, no de una página oficial de Tradovate.
> Antes de descartar nada por dinero, confírmalo en los términos actuales de
> Tradovate o en su pantalla de Application Settings.

**Consecuencia:** el CSV no es el plan B, es **el único plan**. Y eso asciende la
**fase 0 de `IMPORTAR.md`** —exportar un CSV real y guardarlo como fixture— de
«pendiente desde el 12/10» a *lo único que bloquea la automatización más grande
del producto*. Son diez minutos tuyos y no se puede sustituir por nada: un mapeo
escrito de memoria falla con el primer fichero de verdad.

## Los trabajos programados en el servidor no son fiables en el plan gratis

`pg_cron` + `pg_net` permiten que Postgres llame a una Edge Function en un
horario, y están disponibles en el plan gratuito. El problema no es la
capacidad, es el suelo sobre el que se apoya:

- Un proyecto gratuito **se pausa tras ~7 días sin actividad**.
- `pg_cron` vive **dentro** de la base, así que un proyecto pausado no ejecuta
  nada, y lo que debía correr durante la pausa **no se recupera**: ni backfill,
  ni reintento, ni aviso.

La ironía es que el truco habitual para *evitar* la pausa es precisamente un
`pg_cron` que toque la base — y eso no resucita un proyecto ya pausado.

> Estas condiciones vienen de blogs de terceros, no de la documentación oficial
> de Supabase. Verifícalas antes de apoyar algo en ellas.

**Consecuencia:** no construir nada que importe sobre `pg_cron` mientras el
proyecto esté en el plan gratis. El sustituto honesto ya está en la app desde el
PR #39: cuando las lecturas fallan —y un proyecto pausado las hace fallar— el
rótulo dice **«sin actualizar»** con el motivo y cuándo llegó lo último, en vez
de un «sincronizado» mentiroso. Eso no automatiza nada, pero convierte un fallo
silencioso en uno visible, que es el requisito previo de cualquier automatización.

## Por orden de lo que dan contra lo que cuestan

### 1 · Terminar el importador · fases 1–2 de `IMPORTAR.md`

Lo que elimina: teclear catorce campos por operación. Es, con diferencia, el
trabajo repetitivo más grande que queda.

Lo que ya está hecho: la **fase 0.5**, leer bytes. Separador, BOM, comillas con
comas dentro, «1.234,56» contra «1,500», paréntesis como negativo — la capa que
corrompe datos en silencio, con funciones puras y `test/csv.mjs` detrás.

Lo que falta: el mapeador (fase 1) y, para Tradovate, el emparejado de
ejecuciones (fase 2). `IMPORTAR.md` ya decidió empezar por **NinjaTrader**
porque su export de *Trades* viene ya emparejado y la fase 1 sola produce
operaciones correctas.

> **Bloqueado por:** fase 0. Un `.csv` real en `test/fixtures/`.

### 2 · La comprobación de conexiones · hecha

`test/conexiones.mjs` cruza, para cada colección, quién la lee contra qué se
repinta cuando cambia. No es una prueba de un fallo: es la que impide que vuelva
**una clase** de fallo que ya apareció cuatro veces, y las cuatro se encontraron
por casualidad.

| Encontrado por | Qué leía sin repintarse |
|---|---|
| El bot, en #38 | la clave del buscador leía `acctLabel()` y guardaba sólo `a.name` |
| Yo, en #39 | Estudio leía las operaciones y no estaba en `FANOUT_TRADES` |
| Esta comprobación | la lista de inversión leía el nombre del mercado y el número de posiciones |
| Esta comprobación | el detalle de un mercado calcula lotes y resultado desde las operaciones |

Las dos últimas las encontró el cruce a máquina, no una lectura a ojo. Eso es la
medida de si valía la pena.

### 3 · Cola de operaciones sin revisar · local, sin coste externo

Estudio ya tiene el tipo de documento `trade-review` y el formulario para
rellenarlo. Lo que **no** existe es nada que diga *qué operaciones cerradas se
quedaron sin revisar*: la revisión depende de que te acuerdes, y acordarse no
escala — es el mismo razonamiento que ya está escrito en la fase 5 de
`IMPORTAR.md` para las operaciones incompletas.

Es la mejor segunda candidata: no necesita nube, ni API, ni dinero, ni permiso
de nadie. Entra como una zona más del registro y la comprobación de conexiones
ya la vigilaría.

### 4 · Lo que NO conviene automatizar todavía

- **Detección automática de bróker** (fase 4 de `IMPORTAR.md`). Es la que más se
  luce y la única que no se puede hacer sin los ficheros. El propio documento ya
  dice por dónde no empezar.
- **Cualquier cosa que reescriba tu historial sin que la veas.** Sigue abierta la
  decisión de los días pasados a los que borras operaciones: `historyMerged()`
  conserva el resultado guardado y no mira `resultManual`, así que «arreglarlo»
  automáticamente pisaría los días que apuntaste a mano. Una automatización que
  decide sola sobre historial es la que menos margen de error tiene.
- **Un trabajo programado que lea tus datos desde GitHub Actions.** Haría falta
  una clave de servicio en los secretos del repositorio, y eso amplía el radio
  de lo que se pierde si se filtra, a cambio de poco. `test/seguridad.mjs` ya
  prohíbe que una clave así entre en un fichero; meterla en los secretos sería
  legal y aun así peor idea que no hacerlo.

## Lo que sigue bloqueado por ti, en orden

1. **Un CSV real** exportado de NinjaTrader (Control Center → Trade Performance →
   pestaña Trades → exportar) o de Tradovate (Account → ajustes → Orders → rango
   → descargar). Desbloquea la automatización número 1.
2. **Si el proyecto Supabase está activo o pausado.** Decide si la sincronización
   entre dispositivos hace algo hoy, y si tiene sentido pensar en el servidor.
3. **Los días pasados.** Recalcular o respetar lo escrito a mano.

## Fuentes

- [Tradovate · API Access for retail traders](https://community.tradovate.com/t/api-access-for-retail-traders/1871.md)
- [Tradovate · How Do I Access the API?](https://community.tradovate.com/t/how-do-i-access-the-api/2380)
- [Tradovate · suscripciones de mercado y acceso por API](https://community.tradovate.com/t/whats-the-deal-with-market-subscriptions-and-api-access-to-charts-do-we-need-another-payment/11039.md)
- [PickMyTrade · Tradovate API Access Without $1,000 Minimum: 2026 Options](https://blog.pickmytrade.trade/tradovate-api-access-without-1000-minimum-2026-options/) *(proveedor comercial)*
- [CrossTrade · GET Fill History](https://crosstrade.io/docs/api/tradovate/get-fill-history) *(API de un envoltorio, no de Tradovate)*
- [TraderFyles · How to Export Trade History from Apex Clearing](https://traderfyles.helpscoutdocs.com/article/31-how-to-export-trade-history-from-apex-clearing) *(Apex Clearing, no Apex Trader Funding)*
- [Supabase · Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Preventing Supabase Free Tier Pausing](https://runhooks.app/blog/preventing-supabase-free-tier-pausing/) *(proveedor comercial)*
- [Schedule Supabase Edge Functions Without pg_cron](https://runhooks.app/blog/schedule-supabase-edge-functions-without-pg-cron/) *(proveedor comercial)*
