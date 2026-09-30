# Arquitectura

Una página, sin build, sin framework y sin dependencias de ejecución. Todo lo que
corre en el navegador está en `index.html`.

```
index.html                     la app: HTML + CSS + JS en un IIFE (~12.300 líneas)
  ├─ QuantEngine (incrustado)  todo el cálculo de dinero, riesgo y estadística
  ├─ almacén                   una interfaz, dos sitios donde guardar
  └─ cuentas                   login y sesión contra Supabase (fetch, sin librería)

engine/quant/*.js              los 11 módulos FUENTE del motor
engine/QuantEngine.bundle.js   generado por `npm run bundle`, se incrusta a mano
supabase/migrations/           el esquema del proyecto «cabina» (tabla + bucket)
supabase/pruebas/              pruebas de aislamiento que corren contra el proyecto real
test/                          pruebas de navegador (Playwright) y guardianes
.github/workflows/             pruebas.yml (CI) · pagina.yml (GitHub Pages)
```

## Una sola fuente para cada cosa

| qué | dónde vive | quién lo vigila |
|---|---|---|
| P&L, R, riesgo de una operación | `QE.calcularTradeApp` (motor) | `quant.test.js`, `capa2` |
| curva, pico, suelo, colchón de una cuenta | `QE.construirCurva`, llamado desde `acctAgg` | `equivalencia` |
| drawdown, pérdida diaria, tope de ganancia | `QE.margenDeDrawdown` · `margenDePerdida` · `topeDeGanancia` | `equivalencia` (dorados) |
| consistencia | `QE.evaluarConsistencia` | `equivalencia` |
| veredicto de la cuenta (lista / aviso / bloqueada / quemada) | `evaluateAccountRules` (app) | `cuentas`, `vista` |
| edge, Sharpe, drawdown, Monte Carlo | `QE.analizarEdge` · `metricasCurva` · `simularCuenta` | `edge`, `radiografia` |
| dónde se guarda un dato | `almacen()` con `nubeDb()` o `localDb()` | `guardado`, `primer`, `cuentas` |
| las imágenes | bucket privado `capturas` | `capturas`, `supabase/pruebas/capturas.sql` |

La app no recalcula ningún número del motor. Las funciones de la tarjeta de cuenta
(`ddEngine`, `riskEngine`, `consistency`/`consEngine`, `gainCap`) son adaptadores de
vocabulario: traducen los códigos del motor (`precaucion`) a los que cuelga el CSS
(`caution`) y deciden cómo se pinta una cuenta quemada (colchón 0, no negativo).

## La cadena del motor

```
engine/quant/*.js ──npm run bundle──► QuantEngine.bundle.js ──a mano──► index.html
   quant.test.js                         bundle.mjs --check            capa2 §15
```

`capa2` §15 falla si el bloque incrustado desde `const QE = (function () {` no es
exactamente el bundle. Ver [DEVELOPMENT.md](DEVELOPMENT.md).

## El almacén

Toda la app lee y escribe por `state.db`, que tiene siempre la misma interfaz:

```
doc(ruta).get / set / delete / onSnapshot
collection(nombre)[.orderBy][.limit].get / onSnapshot
escribeVarios(pares) · refresca() · vaciar()
```

Debajo hay uno de dos backends, elegido al arrancar:

| | sin cuenta | con cuenta |
|---|---|---|
| backend | `localDb()` | `nubeDb()` |
| dónde | `localStorage["cabina-mnq:v1"]` (o memoria si no hay) | Supabase, tabla `cabina_docs` |
| contesta | en el acto (síncrono) | por red; los render esperan a `state.listo` |
| entre dispositivos | no | sí, al volver a la pestaña (no en vivo) |
| capturas | no | bucket privado `capturas` |

No hay un `if (nube) … else …` en las puertas de escritura: `coll().set`,
`persistSettings` y `persistDay` hablan con `state.db` y nada más.

## Seguridad

- Un solo `fetch` en toda la app, a `NUBE_URL` (el proyecto Supabase). `seguridad.mjs`
  lo cuenta.
- La clave de la página es la **publicable**. Lo que separa a dos usuarios es la RLS:
  `cabina_docs` con RLS forzada por `user_id`, y el bucket `capturas` con cada objeto
  bajo la carpeta `<user_id>/`. Las dos cosas se prueban contra el proyecto real con
  `supabase/pruebas/*.sql`, con un sabotaje que demuestra que la prueba caza la fuga.
- Las imágenes sólo pueden ser `data:image/…` (de un respaldo) o un id del bucket.
  Cualquier otra URL que traiga un respaldo se pinta como caja rechazada y no se
  pide nunca.
- Todo lo que escribe el usuario acaba en `textContent` o pasa por `esc()`.

## Publicación

`pagina.yml` despliega `index.html` a GitHub Pages sólo después de que `pruebas`
pase, y al terminar descarga la URL publicada y la compara byte a byte con
`index.html`.
