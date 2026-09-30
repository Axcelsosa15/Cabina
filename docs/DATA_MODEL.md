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
- `accounts[]` — cuentas de prop firm: `size`, `dd`, `ddKind`
  (`estatico`/`trailing`/`trailing_lock`), `trailBase`, `limit` (consistencia %),
  `target`, `status`, `total`/`best` (ganancia previa escrita a mano), `ledger[]`
  (`deposit` / `payout` / `fee`) y `rules` (el contrato de la firma).
  **Las fees no mueven el balance**: se pagan fuera de la cuenta.

### `trades/<id>` (futuros)

`date`, `time`, `accountId`, `instrument`, `direction`, `qty`, `entry`, `stop`,
`target`, `exit`, `exitTime`, `exitWhy`, `fees`, `mae`, `mfe`, `setupId`, `plan`,
`invalida`, `quality`, `tags`, `notes`, `images[]`, `source`.

- `pnl` es opcional: si está, **gana** sobre el calculado (es un hecho reportado).
- El P&L, la R y el riesgo **no se guardan**: los deriva el motor al leer.
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
cabina_docs (user_id uuid, path text, coll text generada, data jsonb, updated_at)
  primary key (user_id, path) · RLS forzada: cada fila sólo para su user_id
  path ~ '^[A-Za-z0-9_.~:@+-]+(/[A-Za-z0-9_.~:@+-]+)+$' · data ≤ 256 KB

storage bucket «capturas»: privado · 20 MB · png/jpeg/webp/gif
  leer / subir / borrar sólo bajo (storage.foldername(name))[1] = auth.uid()
```

Esquema completo en `supabase/migrations/`.

## Respaldo

Un JSON con `settings`, `days` y cada colección como `{ id: documento }`. Importar
pasa por la misma validación que el resto (`normalize()` y la de colecciones), y
pide teclear `IMPORTAR`.
