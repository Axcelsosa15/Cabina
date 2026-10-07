# TURBOK2 · Cabina

Diario de trading de futuros e inversiones. Una sola página, sin build ni framework:
pre-sesión, reglas duras, cuentas de prop firm, journal de futuros con P&L exacto en la
rejilla de ticks, métricas de edge, cartera de inversiones, playbook y tesis.

**En producción:** https://axcelsosa15.github.io/TURBOK2/

No es asesoramiento financiero: operar futuros conlleva un riesgo alto de pérdida.

## Dónde viven tus datos

| | sin cuenta | con cuenta |
|---|---|---|
| dónde | el `localStorage` de ese navegador | Supabase (proyecto «cabina») |
| entre dispositivos | no | sí, al volver a la pestaña |
| capturas de gráficos | no | sí, en un bucket privado |
| sale algo del navegador | nada | sólo a tu cuenta, con tu token |

Lo que separa los datos de dos usuarios no está en la página, está en la base: RLS
forzada en la tabla y en el bucket, probada contra el proyecto real. Ver
[docs/MULTIUSUARIO.md](docs/MULTIUSUARIO.md).

## Qué hace

| | |
|---|---|
| **Cabina** | la sesión del día: pre-sesión, niveles, resultado, reglas que bloquean |
| **Futuros** | journal, cuentas de prop firm (drawdown estático/trailing, consistencia, payouts, contrato de la firma **versionado por fecha de vigencia**), radiografía de la ventaja, supervivencia de la cuenta por Monte Carlo |
| **Métricas / Edge** | expectancy, win rate, R:R, tamaño de posición, Kelly (referencia), profit factor, Sharpe, max drawdown, break-even, riesgo de ruina — netos de comisión. [docs/METRICAS.md](docs/METRICAS.md) |
| **Inversiones** | posiciones, lotes, dividendos, TIR de la cartera |
| **Playbook, tesis, ideas** | setups con condiciones y capturas, una tesis por jugada |
| **Registro rápido** | `NQ L +185` y guardar; lo que no se sabe se queda vacío, no se inventa |
| **Respaldo** | JSON descargable con recuento y huella, con las capturas dentro si se quiere; importación con vista previa que dice si la copia llegó entera |
| **Dos dispositivos** | cada documento lleva versión: el que escribe tarde ve un conflicto con las dos versiones delante, y elige. Nunca se pisa en silencio |

## Documentación

| | |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | cómo está hecho y dónde vive cada cálculo |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | documentos, campos y esquema de Supabase |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | arrancar, probar, cambiar el motor o el esquema |
| [docs/METRICAS.md](docs/METRICAS.md) | cada fórmula de Métricas / Edge |
| [docs/MULTIUSUARIO.md](docs/MULTIUSUARIO.md) | cuentas, sesiones y aislamiento |
| [docs/ERRORES.md](docs/ERRORES.md) | las cuatro categorías de error |
| [docs/LANZAMIENTO.md](docs/LANZAMIENTO.md) | lo que falta decidir para abrirlo al público |
| [PROTOCOLOS.md](PROTOCOLOS.md) | procedimientos de trabajo, y el fallo que produjo cada uno |

## Arranque rápido

```sh
npm ci
npm run serve        # http://localhost:8000/
npm run compuerta    # todas las pruebas + la tabla de la cadena (lo que corre CI)
```

## Estado

| | |
|---|---|
| suites | **35**, 1.066 aserciones de navegador y guardianes + 357 del motor |
| compuerta | **19 PASS · 0 FAIL · 3 UNKNOWN** de 22 filas (las 3 son fronteras de plataforma) |
| despliegue | GitHub Pages, sólo tras `pruebas` en verde, con comparación byte a byte |

## Lo que no está hecho

- sincronización en vivo entre dispositivos (llega al volver a la pestaña). Lo que sí
  está hecho es que dos dispositivos **no se pisen**: cada documento lleva versión y
  toda escritura va condicionada, así que el que llega tarde ve un conflicto en vez de
  destruir el cambio del otro ([docs/MULTIUSUARIO.md](docs/MULTIUSUARIO.md))
- capturas sin cuenta
- importación desde bróker o CSV: no hay esquema canónico de operación importada, ni
  mapeos por bróker, ni el camino SUBIR → DETECTAR → MAPEAR → PREVISUALIZAR →
  VALIDAR → IMPORTAR, ni huella de deduplicación. Nada de eso está a medias: no está
- interfaz para crear y anclar versiones del contrato de una firma: la arquitectura
  y la fachada están ([docs/DATA_MODEL.md](docs/DATA_MODEL.md)), el formulario no
- medición de rendimiento con cifras (hoy sólo hay el tope de 1005 operaciones que
  corre `test/cuentas.mjs`, sin perfilar)

## Licencia

Sin licencia seleccionada todavía: rige el derecho de autor por defecto.
