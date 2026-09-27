# Auditoría de estado real — 2026-09-27

Punto de partida: `fb52413`, árbol limpio, sincronizado con `origin/main`.

Regla de esta auditoría: **nada se afirma por lo que diga el README**. Cada número
de aquí sale de ejecutar algo o de leer el código. Los que no pude ejecutar se
llaman `NO VERIFICADO` y se quedan así.

---

## Lo que está VERIFICADO

| Qué | Evidencia |
|---|---|
| Comando de prueba | `npm test` → `node test/correr.mjs`, leído de `package.json` (no asumido) |
| Suite completa | **51/51 en verde · 497 s · `EXIT=0`** |
| Aserciones de navegador y guardianes | **455 en 15 archivos** — contadas por la suite sobre su propia salida |
| Motor cuantitativo | `quant.test.js` → **329 ok · 0 fallos** |
| Motor MathEngine (referencia) | `MathEngine.test.js` → **92 pruebas** |
| Total de aserciones | **876** |
| Fuente del motor == bundle | `node engine/quant/bundle.mjs --check` → *al día con los 11 módulos (98.774 bytes)* |
| Bundle == motor incrustado en producción | `capa2` §15 en verde |
| CI | ejecución 12 sobre `fb52413`; **log leído**: `455 aserciones ejecutadas en 15 archivos` |
| Smoke test de producción | `humo.mjs`, 23 comprobaciones sobre HTTP con el payload exacto de Pages |
| Contrato de la rama `db` | `capsula.mjs`, 28 aserciones, probado con tres sabotajes |
| Una sola fuente para el P&L | única puerta: `tradeCalc` → `QE.calcularTradeApp`. Ningún cálculo de P&L fuera del motor |
| `if/else` de persistencia simétrico | las 10 ramas `if (state.db)` tienen su contraparte local. Verificado leyendo las seis que parecían huecos: ninguna lo era |

### El motor está muy por delante de la UI

| | |
|---|---|
| Símbolos que exportan los módulos | 75 |
| Símbolos que expone el bundle | 73 |
| Símbolos que la UI consume | **18** |
| **Expuestos y sin conectar** | **55** |

De esos 55, estos son exactamente lo que el plan pide construir en fases posteriores:

| Fase del plan | Ya existe, probado, sin conectar |
|---|---|
| 4 · Prop Firm Rules | `evaluarCumplimiento` · `evaluarConsistencia` · `margenDeDrawdown` · `margenDePerdida` · `topeDeGanancia` |
| 5 · Session Risk | los anteriores + `radiografiaCuenta` (curva + métricas + consistencia + edge + cumplimiento en **una** llamada) |
| 6 · Journal Analytics | `veredicto` · `UMBRALES` · `muestraMinima` · `significanciaMedia` · `ciProporcion` · `ciMedia` · `bootstrapCI` · `excursionDeOperacion` |
| 3 · Modelo canónico | `valuarOperacion` · `desdeTradeApp` · `rRealApp` · `rPlanApp` · `listContracts` |

### La capa de riesgo está DUPLICADA — y todavía coincide

`index.html` tiene su propia implementación de lo que el motor ya hace:

| Motor | App (`index.html`) |
|---|---|
| `margenDeDrawdown` (compliance.js:53) | `ddEngine` (index.html:2926) |
| `margenDePerdida` (compliance.js:30) | `riskEngine` (index.html:2951) |
| `evaluarConsistencia` (curve.js) | `consistency` (2878) + `consEngine` (2936) |
| `topeDeGanancia` (compliance.js:42) | `gainCap` (2963) |
| `evaluarCumplimiento` (compliance.js:72) | `evaluateAccountRules` (3196) |
| `NIVELES` (0.50/0.75/1.00) | `RISK_STEPS` (0.50/0.75/1.00) |

**Medido con una sonda que enfrenta las dos implementaciones en la misma página con
los mismos datos** (cuenta 25.000, dd 1.500 trailing_lock, cuatro operaciones MNQ):

```
                       app        motor
suelo                  23740      23740
colchón                1310       1310
dd usado               190        190
consistencia · ratio   4.8        4.8
consistencia · falta   750        750
pérdida diaria · resta 60         60
código de nivel        caution    precaucion   <-- única diferencia real
```

Conclusión: **coinciden al centavo**. La duplicación no ha divergido *todavía*. Las
dos únicas diferencias son el redondeo a 4 decimales en la frontera de presentación
del motor, y que los códigos de estado están en idiomas distintos — y el CSS de la
app se cuelga de `code`, así que una consolidación ingenua rompería los colores.

Eso da una **referencia dorada**: la consolidación se puede verificar por igualdad
numérica demostrable, no a ojo.

La sonda vive en el scratchpad de la sesión, fuera del repositorio, porque la fase 0
no modifica código. La fase 2 la promueve a `test/` como guardián de equivalencia.

### Modelo de datos REAL (leído del código que persiste)

**Trade** — 25 campos que el editor escribe:
`date time accountId instrument setupId direction qty entry stop target exit exitTime
exitWhy mae mfe fees pnl quality tags cStruct cPull cWindow cSize note lesson`

8 campos derivados que **nunca** se persisten (se recalculan al pintar):
`pnlEff rReal rPlanned riskUsd multUnknown calcError ticks avisos`
— y `openTrade` borra 5 de ellos explícitamente antes de guardar.

**No existen `source` ni `broker`.** La fase 7 (CSV) y la 9 (APIs) los necesitan.

**Account** — 15 campos: `id firm name kind size dd ddKind trailBase target limit
total best status ledger rules`
`ledger[]`: `{id, date, kind, amount, note}` con `kind ∈ {payout, fee, deposit}`
`rules{}` (contrato de la firma, 11 campos): `maxLoss maxGain maxContracts maxLosses
minDays payoutBuffer instruments verifiedAt url version notes` — los 6 primeros
validados numéricamente por `normRules`

**Estados del ciclo de vida** (7): `evaluacion fondeada payout_pendiente
payout_aprobado quemada pausada archivada`

**Day / JournalEntry** — 12 campos: `checks checksBy levels result trades broke note
closed resultManual pre pres updatedAt`

**Colecciones persistidas** (9): `trades playbooks ideas markets watch positions
scenarios risk tesis`

**Roles conectables a una regla** (5): `maxLoss maxGain maxLosses maxContracts instrument`

**Sesiones de mercado** (8 + cerrado): `asia londres premkt nyam lunch nypm cierre pausa`

---

## Lo que está PARCIALMENTE verificado

- **Integridad de `index.html`**: no hay una comprobación única. Está cubierta de
  refilón por `capa2` §3 (suelo y P&L), §8 (todo token de color existe) y §11 (nadie
  saca una cuenta fuera de la fachada). No existe un «index.html íntegro» como check.
- **Versión del artefacto**: `ARTEFACTO.md` dice 61 · `1790422823-8b79`, y eso viene
  de la respuesta del publicador, no de una suposición. Pero **nada lo comprueba a
  máquina**: si alguien republica desde otra conversación, el documento queda viejo y
  ningún guardián lo nota.
- **GitHub Pages**: `pagina.yml` existe, está enganchado a `workflow_run` de `pruebas`
  y tiene los permisos correctos, pero **nunca ha desplegado**: Pages no está activado,
  así que el paso `configure-pages` falla, avisa en el resumen y se salta el deploy.

---

## Lo que NO está verificado — y no puede estarlo desde CI

Estas son fronteras de la plataforma, no pruebas que falten por escribir. Convertir
cualquiera de ellas en PASS sería falsificarlo.

1. **Que el artefacto publicado sea igual a `index.html`.** El artefacto no es
   alcanzable desde GitHub Actions: no hay URL que CI pueda leer ni credencial que
   pueda usar. Sólo se comprueba desde una sesión de Claude que lea las 10.818 líneas
   publicadas. `UNKNOWN` estructural.
2. **Que el `db` real de claude.ai se comporte como el doble de `capsula.mjs`.** La
   prueba fija el CONTRATO que la app espera. Si claude.ai lo cambiara, los 28
   asertos seguirían verdes y el artefacto estaría roto.
3. **Que la URL de Pages sirva la página.** Da 404 porque Pages no está activado.

---

## Limitaciones conocidas (del código, no del README)

- **Si el `db` falla al escribir, el dato se queda en memoria.** La app avisa con el
  código real del error, pero no cae a `localStorage`: al recargar se pierde.
  Afirmado tal cual en `capsula.mjs`, así que si alguien lo cambia la prueba lo dirá.
- **33 de las 48 pruebas de `test/` no afirman nada**: miden y registran. Su único
  modo de fallo es romperse.
- **`test/perf.mjs` no corre**: necesita un baseline que no está en el repositorio.
- **`pagina.yml` lleva `continue-on-error`** en `configure-pages`. Si fallara por un
  motivo distinto a «Pages sin activar», el despliegue se salta y el run queda verde.
- **`file://` tira el área de almacenamiento al recargar**, de forma intermitente.
  Por eso el smoke test usa HTTP y dos pruebas abren pestaña nueva en vez de recargar.

---

## Riesgos arquitectónicos, por orden de daño

1. **La capa de riesgo duplicada.** Es el riesgo número uno y el único que viola una
   regla estructural (*una sola fuente de verdad*). Hoy coinciden porque alguien las
   mantuvo a mano; nada lo garantiza mañana. Dos tablas de umbrales con nombres de
   clave distintos es la forma exacta en que esto se rompe en silencio.
2. **La frontera del artefacto es manual.** Republicar exige leer 10.818 líneas
   (~375k tokens). No hay automatización posible desde el repositorio. La versión se
   anota a mano.
3. **`index.html` son 10.800 líneas en un archivo**, de las cuales ~2.100 son el
   bloque generado del motor. La reorganización en directorios que propone la fase 2
   **no puede mover ese bloque**: está generado e incrustado a propósito, porque el
   artefacto es un solo archivo. Cualquier `app/` que se cree convive con él, no lo
   sustituye.
4. **El modelo canónico de Trade es implícito.** 25 campos del editor, 8 derivados,
   5 borrados antes de guardar, y ninguna validación fuera del `validate:` del
   editor. Sin `source` ni `broker`, las fases 7 y 9 no tienen dónde aterrizar.
5. **33 de 48 archivos de prueba no afirman nada.** No es un fallo, pero significa
   que la cobertura real es menor que el número de archivos.

---

## Orden de ejecución recomendado — y en qué corrijo el plan

El plan pide construir en la fase 4 un *Prop Firm Rules Engine* y en la 5 un
*Session Risk Engine*. **Las dos cosas ya están construidas y probadas**, en
`engine/quant/compliance.js` y `curve.js`. Lo que falta no es construirlas: es que la
UI deje de tener su propia copia y llame a las que ya existen.

Por eso:

- **Fase 1 tal cual**, pero reconociendo que ~75% del release gate ya existe
  (`motor-bundle`, `capa2` §15, `humo`, `capsula`, `sync`). Lo que falta es un
  **agregador** que imprima una tabla `PASS / UNKNOWN / FAIL` y **nombre** lo que no
  puede comprobar, en vez de una suite nueva.
- **Fase 2 estrecha**: no una reorganización de directorios, sino *una* cosa —
  enrutar la capa de riesgo de la UI a través de las funciones del motor que ya
  existen, con el guardián de equivalencia que la sonda de esta auditoría ya
  demuestra posible. Eso **entrega las fases 4 y 5 al mismo tiempo**, sin escribir
  matemática nueva.
- **Fase 3 antes de tocar el modelo**: `source` y `broker` no existen, y `desdeTradeApp`
  del motor es el sitio natural del contrato de normalización.
- Mover archivos a `app/ui`, `app/state`, etc. **no entrega valor medible** y pone en
  riesgo Pages y el artefacto. Queda registrado como posible, no como necesario.

Ninguna fase posterior a la 2 debería empezar mientras la capa de riesgo esté
duplicada: construir la fase 6 sobre dos fuentes de verdad multiplica el problema.
