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
| **Cuentas** | el ciclo de vida de las de prop firm: **la caja** —lo cobrado menos lo pagado en evaluaciones y resets, que es lo que dice si esto es un negocio—, qué costó y cuánto duró cada una, y **la autopsia de cada quemada**. El por qué no se pregunta: se deriva de las operaciones de esa cuenta con el clasificador de [docs/ERRORES.md](docs/ERRORES.md), y se dice cuánto del agujero lo cavaron tus errores y cuánto las pérdidas limpias. Debajo, **lo que se repite entre todas tus quemadas**, contado en cuentas y no en veces |
| **Métricas / Edge** | expectancy, win rate, R:R, tamaño de posición, Kelly (referencia), profit factor, Sharpe, max drawdown, break-even, riesgo de ruina — netos de comisión. [docs/METRICAS.md](docs/METRICAS.md) |
| **Inversiones** | posiciones, lotes, dividendos, TIR de la cartera |
| **Playbook, tesis, ideas** | setups con condiciones y capturas, una tesis por jugada |
| **Registro rápido** | `NQ L +185` y guardar; lo que no se sabe se queda vacío, no se inventa |
| **Importar un CSV** | del bróker, con **tú** diciendo qué columna es qué: no se adivina la cabecera de nadie. Lo ambiguo se pregunta, lo ilegible no entra y se dice por qué, nada se escribe antes de la vista previa, y se deshace entero |
| **Respaldo** | JSON descargable con recuento y huella, con las capturas dentro si se quiere; importación con vista previa que dice si la copia llegó entera |
| **Idioma** | botón **EN/ES**: el español es la fuente y vive en el markup, el inglés es una capa de 220 cadenas del cromo. Un nodo sólo se traduce si su texto está literalmente en el diccionario, así que ningún dato tuyo puede reescribirse; la ausencia de preferencia significa «no elegido», no «español» |
| **Sin conexión** | se instala en el teléfono y en el escritorio, y **abre sin red**: el casco —la página, el manifiesto y los iconos— se guarda en la primera visita. Lo que NO hace, y conviene saberlo: no encola escrituras. Sin cuenta nunca hizo falta, porque los datos ya estaban en ese navegador; con cuenta, un guardado sin red falla y se dice en la barra, no se finge. El código va primero a la red siempre: una copia en caché que ganara dejaría operando con reglas viejas |
| **Dos dispositivos** | cada documento lleva versión: el que escribe tarde ve un conflicto con las dos versiones delante, y elige. Nunca se pisa en silencio |

## Lo legal, en su sitio

[Privacidad](privacidad.html) · [Términos](terminos.html) · [Seguridad](seguridad.html),
enlazadas desde el pie de la aplicación. Son páginas de texto sin una sola
etiqueta `<script>`, y una vulnerabilidad se reporta por el
[canal privado de GitHub](https://github.com/Axcelsosa15/Cabina/security/advisories/new),
no por un correo publicado.

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
| suites | **61**, 1.866 aserciones de navegador y guardianes en 58 archivos + 383 del motor |
| compuerta | **35 PASS · 0 FAIL · 5 UNKNOWN** de 40 filas (4 fronteras de plataforma —una, que un teléfono real instale la app— y 1 que depende de un CSV real del bróker) |
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
- el inglés sólo cubre el **cromo estático** (220 cadenas: pestañas, encabezados,
  labels, botones, opciones). Los ~1.377 literales de texto que el JavaScript
  genera —mensajes, avisos y errores— siguen en español, y traducirlos es una
  fase aparte por su VOLUMEN, no por riesgo sobre las pruebas: medido, de 808
  literales españoles en las suites sólo **57** aparecen también en
  `index.html`, y varios de esos son coincidencias de subcadena («sin clave»,
  «guardado»). Con el español como defecto —que es la ausencia de preferencia—
  una aserción sobre texto español no cambia de resultado, porque las pruebas
  corren en el defecto. (Una versión anterior de esta línea decía «824
  aserciones»: ese número contaba etiquetas de `console.log` de las propias
  pruebas y datos de la semilla, no comparaciones contra la interfaz. Protocolo
  14, y esta vez contra quien lo escribió.) El cromo que un render GENERA (los botones de `pbNav`, las
  cabeceras de tabla construidas en JS) vuelve a español al regenerarse: se
  arregla en su sitio de render, no con un observador del árbol entero
- **cola de escrituras sin conexión.** La página abre sin red; lo que no hay es
  un buzón que guarde lo que escribas offline con cuenta y lo envíe al volver.
  Hoy ese guardado falla y se dice. Añadirlo es trabajo de verdad —hay que
  decidir qué pasa si el documento cambió en la nube mientras tanto, y eso ya
  tiene respuesta aquí: el conflicto se enseña, no se resuelve solo
- **separar el código de la página.** El script de la aplicación es *inline*, así
  que `script-src` lleva `'unsafe-inline'` y la CSP **no** impediría que
  corriera código inyectado; lo que impide es que ese código hable con alguien.
  Sacarlo a un fichero cerraría también esa puerta, y toca 60 de las 62 pruebas
  —30 cargan la página por `file://`— además del contrato byte a byte del
  despliegue. Es una fase aparte, no una línea
- capturas sin cuenta
- el importador de CSV ([`docs/IMPORTAR.md`](docs/IMPORTAR.md)) ya tiene las
  fases 0.5 y 1, el emparejado **FIFO** y la reconciliación incremental de posiciones
  abiertas cuando el ledger conserva la entrada. Los cierres parciales mantienen
  el tramo restante abierto; deshacer restaura las posiciones previas. El panel
  plegable de historial consolida y filtra los fills sin contarlos dos veces.
  Los rangos ambiguos sin ledger se bloquean. Faltan la **detección automática** del bróker y
  una **cola dedicada de operaciones incompletas**. También falta un `.csv` real
  anonimizado del bróker en `test/fixtures/`: sin él, la conciliación al céntimo
  contra tu plataforma es UNKNOWN en la compuerta, no un PASS
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
