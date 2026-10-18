# Modelo de datos

Un almacén de documentos. Cada documento tiene una ruta `colección/id` y un objeto
JSON. Es el mismo modelo con cuenta y sin ella; sólo cambia dónde se guarda.

## Documentos

| ruta | qué es |
|---|---|
| `settings/main` | la configuración: pre-sesión, reglas duras, cuentas de prop firm, parámetros |
| `days/<AAAA-MM-DD>` | una sesión del día: checklist, niveles, resultado, notas, pre-sesiones |
| `trades/<id>` | una operación de futuros (`type: "futuros"`) o de inversión |
| `playbooks/<id>` | un setup, con sus condiciones y capturas de ejemplo |
| `tesis/<id>` | una tesis por jugada |
| `positions/<id>` · `watch/<id>` · `markets/<id>` · `scenarios/<id>` · `risk/<id>` | cartera de inversiones |
| `ideas/<id>` | formas de hacer dinero |

Las colecciones son `COLLS` en `index.html`, más `settings` y `days`.

### `settings/main`

`normalize()` es la única puerta de entrada: todo lo que llega (base, respaldo,
versión vieja) pasa por ahí.

- `meta` — título y parámetros sueltos. `meta.mx` guarda los de Métricas/Edge;
  `meta.acct` la cuenta seleccionada.
- `checks[]` — la pre-sesión: `{ id, t, s, gate }`.
- `rules[]` — reglas duras: `{ id, kind: "num"|"fixed", role, value, … }`. `role`
  (`maxLoss`, `maxGain`, `maxContracts`, `maxLosses`, `instrument`) es lo que lee la app.
- `updatedAt` — el sello de la última edición. Lo pone `persistSettings` **al pedir
  la escritura**, no al escribirla: entre las dos hay 500 ms de `debounce`, y una
  lectura que entre en ese hueco traería el documento de antes del cambio. Un
  documento con sello más bajo no pisa a uno con sello más alto (ver
  [MULTIUSUARIO.md](MULTIUSUARIO.md)).
- `accounts[]` — cuentas de prop firm: `size`, `dd`, `ddKind`
  (`estatico`/`trailing`/`trailing_lock`), `trailBase`, `limit` (consistencia %),
  `target`, `status`, `total`/`best` (ganancia previa escrita a mano), `ledger[]`
  (`deposit` / `payout` / `fee`) y `rules` (el contrato de la firma).
  **Las fees no mueven el balance**: se pagan fuera de la cuenta.
- `accounts[].rulesets[]` y `accounts[].rulesetId` — **el contrato de la firma,
  versionado**. Ver abajo.

### Versiones del contrato de una firma

Las prop firms cambian sus reglas y no avisan. Con un solo objeto de reglas,
actualizarlo juzgaba el historial entero con las reglas de hoy: una operación de
marzo de 8 contratos, dentro del tope de 10 que regía entonces, aparecía «pasada de
tamaño» porque en septiembre la firma bajó el tope a 2.

La estructura es **FIRMA → TIPO DE CUENTA → VERSIÓN → FECHA DE VIGENCIA → REGLAS**.
La firma y el tipo ya son `a.firm` y `a.kind`, así que no se duplican:

```
accounts[].rulesets[] = [{ id, version, from: "AAAA-MM-DD", rules{}, url, notes, verifiedAt }]
accounts[].rulesetId  = la versión a la que ESTA cuenta está anclada
```

`reglasDe(cuenta, fecha)` es la única resolución, y dice **por qué**:

| `origen` | qué rige |
|---|---|
| `anclada` | la versión de `rulesetId`, siempre, también fuera de su vigencia |
| `por_fecha` | la última cuya `from` ya había empezado en esa fecha |
| `ancla_perdida` | `rulesetId` apunta a una versión que no existe → cae a `a.rules` y **se dice**; no se cae a «la que diga la fecha», que es el fallo que el ancla existe para impedir |
| `sin_version_vigente` | hay versiones pero ninguna vigente en esa fecha → `a.rules` |
| `contrato_plano` | la cuenta no tiene versiones → `a.rules`, el comportamiento de siempre |

Una cuenta abierta bajo la v1 **no cambia** cuando aparece la v2. Añadir una versión
no toca ninguna cuenta ni ningún ancla. Una `from` que no es una fecha queda vacía, y
entonces esa versión sólo se alcanza anclándola a mano.

Una cuenta sin `rulesets` se comporta exactamente como antes: no hay nada que migrar.
El editor de cuenta lee y escribe **el contrato que rige**, no `a.rules`, porque con
versiones `a.rules` ya no gobierna nada. Fachada: `FUT.rulesets`, `FUT.rulesetFor`,
`FUT.addRuleset`, `FUT.pinRuleset`. Probado en `test/versiones.mjs`.

### `trades/<id>` (futuros)

`date`, `time`, `accountId`, `instrument`, `direction`, `qty`, `entry`, `stop`,
`target`, `exit`, `exitTime`, `exitWhy`, `fees`, `mae`, `mfe`, `setupId`, `plan`,
`invalida`, `quality`, `tags`, `notes`, `images[]`, `source`.

- `pnl` es opcional: si está, **gana** sobre el calculado (es un hecho reportado).
- El P&L, la R y el riesgo **no se guardan**: los deriva el motor al leer.
- `qty` y `fees` son **magnitudes, no cantidades con signo**. La dirección la dice
  `direction`, no el signo de la cantidad; y una comisión es un coste, nunca un cobro.
  El motor las resuelve (`QE.contratosDe`, y `Math.abs` sobre la comisión), publica
  `contratos` y `comisiones` ya resueltos, y deja un aviso
  (`CANTIDAD_NEGATIVA`, `COMISION_NEGATIVA`) cuando ha tenido que corregir. Ninguna
  pestaña vuelve a resolverlos: Métricas/Edge lo hacía y no coincidía.
- `source`: `quick_add`, `manual` o ausente (anterior al campo: no se sabe).

### `days/<fecha>`

`{ date, checks, checksBy, levels, result, trades, broke, note, closed,
resultManual, pre, pres, updatedAt }`. La fecha es la de Nueva York (`etNow()`).

### Capturas

En el documento sólo va `{ id, caption, name }`. La imagen está en el bucket privado
`capturas`, en `<user_id>/<id>`. Un respaldo con «meter las capturas dentro» las
convierte en `{ data: "data:image/…;base64,…" }`, que se enseña tal cual.

## Supabase

```
cabina_docs (user_id uuid, path text, coll text generada, data jsonb,
             updated_at timestamptz, version integer)
  primary key (user_id, path) · RLS forzada: cada fila sólo para su user_id
  path ~ '^[A-Za-z0-9_.~:@+-]+(/[A-Za-z0-9_.~:@+-]+)+$' · data ≤ 256 KB
  version ≥ 1 · la pone el trigger, NUNCA el cliente

storage bucket «capturas»: privado · 20 MB · png/jpeg/webp/gif
  leer / subir / borrar sólo bajo (storage.foldername(name))[1] = auth.uid()
```

`version` sube en cada UPDATE y es lo que hace posible la escritura condicional:
`PATCH ?path=eq.<p>&version=eq.<la que leí>` toca 1 fila o ninguna, y ninguna
significa que otro dispositivo escribió primero. El cliente sólo puede **decir qué
versión cree que hay**; el número lo decide `cabina_docs_sello`, así que un cliente no
puede volver a last-write-wins ni queriendo. Ver
[MULTIUSUARIO.md](MULTIUSUARIO.md).

Esquema completo en `supabase/migrations/`. Las migraciones se pueden correr contra un
Postgres local con `node test/db.mjs`, que usa `supabase/pruebas/arnes-local.sql` para
crear lo mínimo que Supabase aporta (`auth.users`, `auth.uid()`, `storage.objects`) y
aplica las migraciones **tal cual** — editarlas para que corrieran allí haría que la
prueba dejara de probar lo que se publica.

## Respaldo

Un JSON con `settings`, `days` y cada colección como `{ id: documento }`. Importar
pasa por la misma validación que el resto (`normalize()` y la de colecciones), y
pide teclear `IMPORTAR`.

Tres campos de cabecera, y son tres cosas distintas:

| | |
|---|---|
| `version` | la del **formato del fichero** (hoy 1) |
| `schemaVersion` | la generación del **modelo de datos** del que salió (hoy 1) |
| `counts` · `checksum` | los **sellos de integridad** |

`counts` dice cuántos registros había al exportar, por sección: caza el truncamiento
y dice el número («trades: el archivo dice 5 y se leen 3»). `checksum` es FNV-1a sobre
el JSON con las claves ordenadas en todo el árbol —ordenadas porque el orden de
recorrido de un objeto no es una propiedad del contenido— y caza el byte cambiado que
no mueve ningún recuento.

**La huella no es una firma.** No hay secreto: quien edite el fichero puede
recalcularla. Detecta daño accidental, no manipulación.

**Y no bloquean.** La importación acepta copias editadas a mano y los respaldos
viejos no traen sellos. Lo que no cuadra sale en la **vista previa**, antes de
teclear IMPORTAR, con el número de lo que falta; una copia sin sellos se anuncia como
«no se puede comprobar si llegó entera», que no es lo mismo que decir que está bien.
Bloquear convertiría la única vía de recuperación en una puerta cerrada.

### Por qué NO hay `schemaVersion` en cada documento

Se investigó y la respuesta es que no hace falta. Las migraciones de Cabina son
**inferenciales**: `normalize()`, `migrateDay()` y `migraEstado()` miran la *forma*
del documento, no una etiqueta, y «la ausencia significa algo» (protocolo 17) es una
regla sobre la forma. Funcionan y están probadas sobre todo lo que hay guardado.

Poner una etiqueta en cada documento no quitaría esa inferencia: los documentos que
ya existen no la llevarían, así que habría que inferir igual y se mantendrían **dos**
mecanismos para siempre, con el riesgo de que digan cosas distintas. Lo que sí faltaba
es que una **copia** dijera de qué generación viene, para que un lector futuro sepa
qué infirió quien la escribió. Eso es `schemaVersion` en la cabecera, y es todo lo
que es.
