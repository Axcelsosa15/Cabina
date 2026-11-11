# Dos guardianes que habían dejado de medir · 5 de noviembre de 2026

Revisión del trabajo acumulado en `claude/gifted-einstein-i990kr` (93 ficheros,
+9.970/−1.148 frente a `main`). La suite estaba en verde: 111 de 112 archivos y
3.466 aserciones. Los dos defectos de abajo no los veía nadie porque los dos
viven en comprobaciones que seguían dando verde midiendo otra cosa.

## 1 · El botón «¿hay versión nueva?» comparaba la mitad del código

`index.html` carga cinco scripts: `appearance.js`, `discipline.js`,
`session-break.js`, `experience.js` y `app.js`. La lista `ARCH` de
`comparaPublicado` en `sw.js` nombraba tres ficheros —`index.html`, `app.js` y
`appearance.js`— porque nació cuando eran tres. Al salir los tres módulos nuevos
del documento se añadieron al `CASCO` y a `pagina.yml`, y aquí no.

Consecuencia medible: un despliegue que cambie **sólo** `discipline.js`,
`session-break.js` o `experience.js` se compara en verde y la pantalla responde
«al día · estás en la versión publicada». No es un aviso que falta: es una
afirmación falsa, en la única pantalla que existe para no mentir sobre la versión
cargada. El comentario del propio `app.js` dice «un solo fichero omitido impide
decir al día» mientras tres quedaban fuera por construcción.

| Antes | Ahora |
| --- | --- |
| Compara 3 ficheros de 6 | Compara `index.html` y los cinco `<script src>` |
| «6 archivos comparados» era imposible | La nota dice 6 |
| Nada vigilaba la divergencia | `test/pwa.mjs` §1 la exige contra `index.html` |

La guarda nueva se verificó sabotéandola: quitando dos ficheros de `ARCH`,
`pwa.mjs` pasa de 36 verdes a «la página lo carga y el botón NO lo compara:
session-break.js · experience.js».

## 2 · El paso que impide el 404 de `og.png` comprobaba cero ficheros

`pagina.yml` lleva un paso escrito expresamente para que no se repita un fallo
que ya ocurrió: se referenció `og.png`, se publicó sin copiarla y Pages sirvió un
404 durante horas. El paso recorría las URL absolutas al propio sitio en
`index.html` con el host incrustado en el `grep`:

    grep -oE 'https://axcelsosa15\.github\.io/Cabina/[A-Za-z0-9_./-]+' index.html

Al migrar la página a su dominio propio, `index.html` dejó de contener ese host
—hoy tiene cero apariciones—. El patrón no coincide con nada, el bucle no itera
una sola vez, `faltan` se queda en `0` y el paso sale en verde habiendo
comprobado **cero** ficheros. Un verde que medía lo que no era, justo en el
guardián escrito para que ese 404 no volviera.

Ahora el origen se lee de `rel=canonical`, que es donde la decisión existe de
verdad, y una lista vacía es **rojo**: si el paso no tiene nada que comprobar, el
que ha fallado es el paso.

Ejecutado el script del paso tal cual contra un `sitio/` montado a mano:

| Caso | Resultado |
| --- | --- |
| `og.png` publicada | `✅ og.png publicado` · salida 0 |
| `og.png` sin copiar | `::error::index.html pide og.png y no está en sitio/` · salida 1 |
| El dominio cambia y nadie toca el paso | Sigue el canonical nuevo y detecta el fichero que falta · salida 1 |
| `index.html` sin `rel=canonical` | Error explícito · salida 1 |
| Canonical presente y ninguna URL propia | `ninguna URL absoluta … este paso no estaría comprobando nada` · salida 1 |

## 3 · `test/actualizacion-inicio.mjs` era inestable, y ya lo era en `main`

Al revisar el punto 1 la prueba se puso roja. Medido en `main`, sin ningún otro
cambio: **1 de cada 4** ejecuciones en rojo. No es una regresión de esta rama.

La causa no es la aplicación. La prueba muta lo que publica el servidor a partir
de `version = 2`, y la copia guardada se mueve por dos caminos a la vez: el
`fetch` de la página, que cachea `index.html` y sus scripts al cargar, y el
`install` del trabajador, que hace su propio `c.add()` de los 16 ficheros del
casco en paralelo. Esperar a que `index.html` «esté» en caché lo satisface el
primer camino mientras el `c.add('./index.html')` del segundo sigue en vuelo:
aterriza después de `version = 2`, guarda la v2, y entonces caché y red
coinciden. El veredicto correcto pasa a ser «al día» y la prueba se pone roja por
el reloj.

Se espera a `serviceWorker.ready`, que resuelve con un trabajador **activo** —o
sea, con `install` ya terminado—: el único momento en que la copia está quieta.
Seis pasadas seguidas en verde, 8 de 8 aserciones.

## Lo que esta revisión NO cambia

- Ninguna fórmula, ningún cálculo, ningún dato guardado. `QE.*` no se toca.
- Ninguna regla de la CSP, de la red ni del aislamiento por dueño.
- El punto abierto de `discipline.js` (abajo) se deja **sin tocar**: es una
  decisión de producto, no un despiste.

## Punto abierto · operaciones que nunca podrán puntuar

`SESSIONS` en `app.js` marca `pre: true` en cinco franjas; `premkt`, `cierre` y
`pausa` no tienen lista propia, y `sesSel()` nunca devuelve una de ellas, así que
`day.pres` jamás recibe esas claves. Pero `preparation()` en `discipline.js`
calcula `session(minute(t.time))` y sí puede devolverlas.

Comprobado ejecutando `scoreTrade` con una operación completa e impecable
—riesgo, condiciones, reglas y revisión en `pass`—:

| Hora de entrada (ET) | Franja | Resultado |
| --- | --- | --- |
| 09:30 | `nyam` | `scored` · 100 |
| 16:30 | `cierre` | `insufficient` · `null` |
| 18:00 | `pausa` | `insufficient` · `null` |

El motivo que se le enseña al usuario es «No hay una pre-sesión guardada para
esta sesión», y el usuario **no puede** guardarla: la app no ofrece checklist
para esas franjas. Cualquier operación entrada entre 07:00–08:30, 16:00–17:00 o
17:00–20:00 ET queda sin puntuación para siempre, por una franja que no eligió.

Hay tres salidas y la elección es de producto, no técnica:

1. `preparation()` devuelve un estado **no aplicable** que no cuenta como hueco,
   y la operación puntúa sobre los otros cuatro criterios.
2. Las tres franjas pasan a tener lista propia (`pre: true`).
3. Se deja como está y la pantalla lo dice: «fuera de franja preparable».

Recomendada la 1: es la única que no cambia el producto ni deja al usuario con un
motivo que no puede satisfacer. No se implementa aquí porque cambia lo que
significa la puntuación, y eso lo decides tú.
