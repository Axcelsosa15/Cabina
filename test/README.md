# Pruebas

Conducen la app real en Chromium (Playwright) contra `index.html`: abren la página,
meten operaciones por el formulario y leen lo que sale en pantalla. `correr.mjs` las
lanza una por proceso y da en rojo tanto un código de salida ≠ 0 como cualquier `❌`
en la salida.

```sh
npm test               # todas
npm test cuentas       # las que empiezan por «cuentas»
npm run compuerta      # todas + la tabla de la cadena (CI)
```

## Qué vigila cada una

| archivo | |
|---|---|
| `capa.mjs` | Cabina y Futuros dan el mismo número para las mismas magnitudes |
| `capa2.mjs` | guardián sin navegador: una sola definición de cada cálculo, motor incrustado = bundle, cero `window.claude` |
| `equivalencia.mjs` | la tarjeta de cuenta contra el motor, y los dieciséis números dorados de antes de consolidar; fees fuera del saldo |
| `invariantes.mjs` | relaciones que valen para cualquier entrada (largo y corto simétricos, suelo ≤ saldo inicial, …) y módulos fuente = bundle vivo en la app |
| `edge.mjs` | cada fórmula de Métricas / Edge contra la cuenta hecha a mano |
| `radiografia.mjs` | la Radiografía no repite Sharpe ni caída máxima, y mide sobre el capital real |
| `prop.mjs` | el contrato de la firma por cuenta |
| `versiones.mjs` | el contrato de la firma **versionado**: la vigencia por fecha, y que una cuenta anclada a la v1 no cambie cuando aparece la v2 |
| `signos.mjs` | la cantidad y la comisión son magnitudes: un menos en «Comisiones $» no suma dinero, y el journal y Métricas dan el mismo número |
| `errores.mjs` | las cuatro categorías de error |
| `tesis.mjs` · `inv2.mjs` | tesis por jugada · rendimiento de una inversión |
| `rapido.mjs` | el registro rápido acaba en el mismo registro que el editor |
| `aviso.mjs` | precios fuera de la rejilla de ticks, stop del lado equivocado |
| `vivo2.mjs` · `vivo3.mjs` · `vivo4.mjs` | ningún número rancio tras crear, editar o borrar |
| `borrar.mjs` | borrado en masa y deshacer |
| `cmd.mjs` · `ui.mjs` · `vista.mjs` | paleta de comandos · estados vacíos · nada se sale de la pantalla |
| `primer.mjs` | el primer arranque: una cabina neutral, sin datos de nadie |
| `guardado.mjs` | lo que la cabina dice cuando **no** pudo guardar |
| `sync.mjs` | diez escenarios: tras cada escritura, Cabina y Futuros dan el mismo número sin recargar |
| `cuentas.mjs` | login, sesión, token caducado, escritura con el `user_id` correcto |
| `capturas.mjs` | subir, ver, aislar, borrar y respaldar capturas del bucket privado |
| `importar.mjs` | la frontera de importación: nada de basura dentro, nada legítimo perdido |
| `integridad.mjs` | los sellos del respaldo: una copia truncada o dañada no pasa por entera |
| `sello.mjs` | un documento viejo no pisa uno nuevo, ni en la configuración ni en una ficha |
| `seguridad.mjs` | un solo `fetch`, a la nube; clave publicable; imágenes filtradas |
| `servida.mjs` · `humo.mjs` | la página servida por HTTP, como en Pages |
| `lanzamiento.mjs` | lo mínimo para que alguien que no es el autor pueda usarla |

## Herramientas (no son pruebas)

| | |
|---|---|
| `correr.mjs` | el runner |
| `compuerta.mjs` | la tabla PASS / FAIL / UNKNOWN de la cadena entera |
| `nube-doble.mjs` | el doble de Supabase: auth, `cabina_docs` con RLS, bucket `capturas`, fallos a propósito |
| `espera.mjs` | esperar a una condición, no al reloj |

El motor tiene sus propias pruebas en `engine/quant/quant.test.js` (sin navegador).
