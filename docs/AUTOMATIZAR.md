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
- **Las firmas de prop** no publican export ni API documentados, y buscarlas por
  su nombre es una trampa: al menos una comparte nombre con una empresa de
  *clearing* distinta, cuya documentación de export no sirve para nada aquí.
  Los nombres de las firmas no se escriben en este repositorio: `test/lanzamiento.mjs`
  lo vigila en todos los ficheros versionados, y la primera versión de este
  documento lo incumplió y cerró la compuerta en CI. Queda dicho porque es la
  clase de detalle que se vuelve a olvidar.

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

### 1 · El importador · fase 1 hecha, fase 2 pendiente

Lo que elimina: teclear catorce campos por operación. Es, con diferencia, el
trabajo repetitivo más grande que había.

Lo que está hecho: la **fase 0.5** (leer bytes: separador, BOM, comillas con
comas dentro, «1.234,56» contra «1,500», paréntesis como negativo — la capa que
corrompe datos en silencio) y la **fase 1**, el mapeador manual, en Futuros →
Diario. Subir o pegar un CSV, decir a mano qué columna es qué, ver la tabla
exacta que va a entrar, importarla y poder deshacerla entera.

**Y aquí va el error que costó más que cualquier otro de esta tanda:** este
documento daba la fase 1 por bloqueada por la fase 0, y no lo estaba. La fase 0
bloquea la *detección* del bróker y bloquea el *control* de la fase 1 —que las
cifras cuadren al céntimo—, pero un mapeador manual no sabe nada de ningún
bróker por definición, así que no podía estar esperando el fichero de ninguno.
Ocho días de la pieza más grande del producto parados por una lectura
equivocada de un documento propio. La lección no es «leer mejor»: es que
**«bloqueado» hay que escribirlo diciendo qué, exactamente, queda bloqueado**.

Lo que falta: el **emparejado de ejecuciones** (fase 2), que es lo que hace
falta para Tradovate —su export son órdenes, una fila por compra y otra por
venta—. Con un export de *Trades* de NinjaTrader, que ya viene emparejado, la
fase 1 sola produce operaciones correctas.

> **Sigue bloqueado por la fase 0:** la fidelidad. `test/mapeador.mjs` prueba el
> mapeador con CSV sintéticos; que las cifras cuadren con la plataforma del
> bróker exige un `.csv` real, y la compuerta lo lleva como fila UNKNOWN para
> que su verde no prometa más de lo que comprueba.

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

### 3 · Cola de operaciones sin revisar · hecha

Estudio ya tenía el tipo de documento `trade-review` y el formulario para
rellenarlo. Lo que **no** existía era nada que dijera *qué operaciones cerradas
se quedaron sin revisar*: la revisión dependía de que te acordaras, y acordarse
no escala — el mismo razonamiento que la fase 5 de `IMPORTAR.md` aplica a las
operaciones incompletas.

En la lista de operaciones de Estudio hay ahora un interruptor **«Sólo sin
revisar (N)»** y una marca en cada tarjeta cerrada que no tiene revisión. Tres
decisiones que no son obvias y que `test/revisiones.mjs` fija:

- **Las abiertas no entran.** No hay nada que revisar en ellas, y contarlas
  haría del contador ruido permanente.
- **El contador se cuenta sobre los demás filtros**, no sobre lo que el propio
  interruptor deja ver: si no, al activarlo el número pasaría a ser el de la
  lista y dejaría de decir «cuántas de las que estás mirando te faltan».
- **Quedarse sin cola es un éxito y se dice como tal.** Revisar la última
  mientras filtras vacía la lista, y ahí poner «no hay operaciones con esos
  filtros» convertiría el momento en un mensaje de error.

Y el interruptor entra en «Limpiar filtros», que es el fallo que la revisión
cazó en el modo demo con `ft.q`: un filtro que no entra en el reinicio deja la
lista recortada con todos los controles a cero.

### 4 · La cola de lo importado incompleto · hecha

Es la pieza que convierte el importador en algo útil en vez de un volcado de
P&L, y la única de esta lista que **no dependía del CSV real**. Un export de
bróker no trae el stop, y sin stop `rPlanApp` y `rRealApp` devuelven `null`: cien
operaciones importadas daban cien filas con P&L y ninguna R.

En Futuros → Diario, el panel **Operaciones** cuenta ahora cuántas importadas se
quedaron sin stop, deja verlas solas y lleva a completarlas de una en una
encadenando una tras otra al guardar. Sólo entra lo importado —lo escrito a mano
sin stop ya es un error de ejecución, y contarlo aquí también borraría esa
distinción— y la cola se puede **vaciar** con «no recuerdo el stop», que no
inventa un número y deja la operación donde está en el recuento de Edge. Una
cola que no se puede vaciar se aprende a ignorar, que es el fallo que convierte
un aviso en ruido. Ver la fase 5 de [`IMPORTAR.md`](IMPORTAR.md) y
`test/cola-importadas.mjs`.

### 5 · Lo que NO conviene automatizar todavía

- **Detección automática de bróker** (fase 4 de `IMPORTAR.md`). Es la que más se
  luce y la única que no se puede hacer sin los ficheros. El propio documento ya
  dice por dónde no empezar.
- **Cualquier cosa que reescriba tu historial sin que la veas.** Esta era la
  decisión que quedaba abierta, y la resolución no fue «recalcular» ni «no
  tocar», que eran las dos malas: `historyMerged()` aplica ahora la misma regla
  que `syncDayFromTrades()` usa en el día de hoy —gana el journal en un día
  DERIVADO, y lo escrito a mano no se toca— con `resultManual` como frontera.
  Un día guardado antes de que ese campo existiera no sabe declararse, así que
  `migrateDay()` lo cuenta como escrito a mano: conserva tu cifra y te ofrece
  el «usar el journal» que ya existía. `test/historial.mjs` fija las dos
  mitades, y las dos secciones que protegen lo escrito a mano pasan también
  contra el código anterior, que es la prueba de que el arreglo es quirúrgico.
- **Un trabajo programado que lea tus datos desde GitHub Actions.** Haría falta
  una clave de servicio en los secretos del repositorio, y eso amplía el radio
  de lo que se pierde si se filtra, a cambio de poco. `test/seguridad.mjs` ya
  prohíbe que una clave así entre en un fichero; meterla en los secretos sería
  legal y aun así peor idea que no hacerlo.

## Lo que sigue bloqueado por ti, en orden

1. **Un CSV real** exportado de NinjaTrader (Control Center → Trade Performance →
   pestaña Trades → exportar) o de Tradovate (Account → ajustes → Orders → rango
   → descargar). Ya no bloquea *tener* importador —la fase 1 está hecha y
   funciona con cualquier fichero—, bloquea dos cosas: dar por **fiel** lo que
   importa (que las cifras cuadren al céntimo con tu plataforma) y la
   **detección automática**, que es la que te ahorraría elegir las columnas cada
   vez. Diez minutos tuyos.
2. **Si el proyecto Supabase está activo o pausado.** Decide si la sincronización
   entre dispositivos hace algo hoy, y si tiene sentido pensar en el servidor.
   No se puede comprobar desde aquí: la política de red deniega `supabase.co`.
   Lo que sí hace la app desde #39 es decírtelo —un proyecto pausado hace fallar
   las lecturas y el rótulo pasa a «sin actualizar»—.

Y una que ya no lo está: **los días pasados**, resuelta arriba.

## Fuentes

- [Tradovate · API Access for retail traders](https://community.tradovate.com/t/api-access-for-retail-traders/1871.md)
- [Tradovate · How Do I Access the API?](https://community.tradovate.com/t/how-do-i-access-the-api/2380)
- [Tradovate · suscripciones de mercado y acceso por API](https://community.tradovate.com/t/whats-the-deal-with-market-subscriptions-and-api-access-to-charts-do-we-need-another-payment/11039.md)
- [PickMyTrade · Tradovate API Access Without $1,000 Minimum: 2026 Options](https://blog.pickmytrade.trade/tradovate-api-access-without-1000-minimum-2026-options/) *(proveedor comercial)*
- [CrossTrade · GET Fill History](https://crosstrade.io/docs/api/tradovate/get-fill-history) *(API de un envoltorio, no de Tradovate)*
*(La búsqueda sobre firmas de prop sólo devolvió guías de una empresa de
clearing homónima, que no aplican. No se enlazan: no aportan nada y nombrarlas
obliga a escribir el nombre de la firma, que es justo lo que `lanzamiento`
prohíbe.)*
- [Supabase · Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Preventing Supabase Free Tier Pausing](https://runhooks.app/blog/preventing-supabase-free-tier-pausing/) *(proveedor comercial)*
- [Schedule Supabase Edge Functions Without pg_cron](https://runhooks.app/blog/schedule-supabase-edge-functions-without-pg-cron/) *(proveedor comercial)*
