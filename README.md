# Cabina

Diario de trading de futuros e inversiones. Una sola página, sin build ni framework:
pre-sesión, reglas duras, cuentas de prop firm, journal de futuros con P&L exacto en la
rejilla de ticks, métricas de edge, cartera de inversiones, playbook y tesis.

**En producción:** https://axcelsosa15.github.io/Cabina/

No es asesoramiento financiero: operar futuros conlleva un riesgo alto de pérdida.

## Dónde viven tus datos

| | sin cuenta | con cuenta |
|---|---|---|
| dónde | el `localStorage` de ese navegador | Supabase (proyecto «cabina») |
| entre dispositivos | no | sí, al volver a la pestaña |
| capturas de gráficos | no | sí, en un bucket privado |
| sale algo del navegador | nada | sólo a tu cuenta, con tu token |

Lo que separa los datos de dos usuarios no está en la página, está en la base: RLS
forzada en la tabla y en el bucket. El esquema y las políticas están comprobados en
Postgres local; el estado actual del proyecto Supabase real queda explícitamente como
**UNKNOWN** desde este entorno. Ver [docs/MULTIUSUARIO.md](docs/MULTIUSUARIO.md).

## Qué hace

| | |
|---|---|
| **Cabina** | la sesión del día: pre-sesión, niveles, resultado, reglas que bloquean, y **la ventana operativa** —horas y días— editable: las sesiones del mercado no se mueven con ella |
| **Futuros** | journal, cuentas de prop firm (drawdown estático/trailing, consistencia, payouts, contrato de la firma **versionado por fecha de vigencia**), radiografía de la ventaja, supervivencia de la cuenta por Monte Carlo |
| **Métricas / Edge** | expectancy, win rate, R:R, tamaño de posición, Kelly (referencia), profit factor, Sharpe, max drawdown, break-even, riesgo de ruina — netos de comisión. [docs/METRICAS.md](docs/METRICAS.md) |
| **Inversiones** | posiciones, lotes, dividendos, TIR de la cartera |
| **Playbook, tesis, ideas** | setups con condiciones y capturas, una tesis por jugada |
| **Registro rápido** | `NQ L +185` y guardar; lo que no se sabe se queda vacío, no se inventa |
| **Importar un CSV** | del bróker, con **tú** diciendo qué columna es qué: no se adivina la cabecera de nadie. Lo ambiguo se pregunta, lo ilegible no entra y se dice por qué, nada se escribe antes de la vista previa, y se deshace entero |
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
| [docs/AUTOMATIZAR.md](docs/AUTOMATIZAR.md) | qué automatizar y qué no, con las puertas que están cerradas y por qué |
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
| suites | **54**, 1.508 aserciones de navegador y guardianes en 51 archivos + 383 del motor |
| compuerta | **28 PASS · 0 FAIL · 4 UNKNOWN** de 32 filas (3 fronteras de plataforma y 1 que depende de un CSV real del bróker) |
| despliegue | GitHub Pages, sólo tras `pruebas` en verde, con comparación byte a byte |

## Darle Cabina a otra persona

Para que alguien entre con su cuenta y no vea tus datos (ni tú los suyos):
[docs/COMPARTIR.md](docs/COMPARTIR.md). El aislamiento ya está hecho y probado; lo que
queda es configuración en GitHub y en Supabase, y sólo el dueño puede hacerla.

## Lo que no está hecho

- sincronización en vivo entre dispositivos (llega al volver a la pestaña). Lo que sí
  está hecho es que dos dispositivos **no se pisen**: cada documento lleva versión y
  toda escritura va condicionada, así que el que llega tarde ve un conflicto en vez de
  destruir el cambio del otro ([docs/MULTIUSUARIO.md](docs/MULTIUSUARIO.md))
- capturas sin cuenta
- del importador de CSV ([`docs/IMPORTAR.md`](docs/IMPORTAR.md)) están hechas la
  fase 0.5 (leer bytes sin corromper nada en silencio) y la **fase 1**, el
  mapeador manual. Faltan: el **emparejado de ejecuciones** —necesario para un
  export de órdenes, donde hoy una fila es una operación y la app lo dice—, la
  **huella de deduplicación** para reimportar un rango solapado, la **detección
  automática** del bróker y la **cola de operaciones incompletas**. Y falta un
  `.csv` real del bróker en `test/fixtures/`: sin él, que las cifras cuadren al
  céntimo con tu plataforma es una fila UNKNOWN de la compuerta, no un PASS
- interfaz para crear y anclar versiones del contrato de una firma: la arquitectura
  y la fachada están ([docs/DATA_MODEL.md](docs/DATA_MODEL.md)), el formulario no
- medición de rendimiento con cifras (hoy sólo hay el tope de 1005 operaciones que
  corre `test/cuentas.mjs`, sin perfilar)

## Licencia

[AGPL-3.0-only](LICENSE). Puedes usar Cabina, leer el código, modificarlo y
redistribuirlo. La condición es recíproca: si publicas una versión modificada —
también si la ofreces a otros como servicio — tienes que publicar su código bajo la
misma licencia.

Usarla para tu propio trading, o modificarla y no distribuirla, no te obliga a nada.
