# Lanzamiento

Qué hace falta para que una persona que no es el autor use Cabina, qué está hecho y
verificado, y qué **no** es una decisión de ingeniería.

---

## Qué lanzamiento es este

**Local-first, en GitHub Pages.** Cualquiera abre la URL y la usa; sus datos se quedan
en su navegador. Sin cuentas, sin servidor, sin coste por usuario, y sin
responsabilidad sobre datos ajenos, porque nunca llegan a ningún sitio.

Es el lanzamiento que la arquitectura ya permite. Un SaaS —cuentas, sincronización
entre dispositivos, cobro— necesitaría servidor, autenticación, base de datos por
usuario, textos legales de verdad y credenciales que no pasan por un chat. Todo lo que
se hace aquí lo necesitaría también un SaaS; lo contrario no.

---

## El interruptor

La cabecera de `index.html` dice:

```html
<meta name="robots" content="noindex, nofollow">
```

Mientras esté, los buscadores no indexan la página: sólo la encuentra quien tenga el
enlace. **Quitar esa línea es el lanzamiento.** Se deja puesta a propósito hasta que
estén resueltas las decisiones de abajo — publicar indexable un producto sin licencia
es publicarlo con todos los derechos reservados, y con un nombre que puede cambiar.

`test/lanzamiento.mjs` exige que, mientras la línea exista, este documento la explique.
Cuando se quite, deja de exigirlo.

---

## Hecho y verificado

| | Verificado en |
|---|---|
| **Primer arranque neutral.** Un desconocido arranca sin cuentas, con las reglas presentes pero sin valor —y una regla sin valor no bloquea nada—, sin restricción de instrumento y sin una sola cadena de la configuración del autor. | `primer.mjs` |
| **Nadie pierde lo suyo.** La configuración guardada no se toca. Una guardada antigua a la que le falte un bloque lo rellena con la configuración de siempre. Una instalación que nunca guardó configuración pero tiene operaciones en las cuentas de siempre las recupera sola — sin escribir nada. En el navegador y en la base del artefacto. | `primer.mjs` |
| **Una carrera que ya existía, cerrada.** En el artefacto, guardar configuración antes de que la base contestara escribía los valores por defecto encima de la real. Con el arranque neutral eso habría borrado todas las cuentas: medido, «SIN CUENTAS». Ahora no se guarda hasta que la base contesta. | `primer.mjs` |
| **No es asesoramiento financiero**, dicho en las seis pestañas y en un teléfono, con el riesgo de pérdida. | `lanzamiento.mjs` |
| **Privacidad**: el pie dice dónde viven los datos y que no se envían a ningún servidor. Lo sostiene que el código no tenga `fetch` externo, `sendBeacon` ni `<script src>`. | `lanzamiento.mjs` · `seguridad.mjs` |
| **El enlace compartido** muestra título y descripción de producto, e icono de pestaña — dentro del propio fichero, sin ningún recurso externo nuevo. | `lanzamiento.mjs` |
| **Se ve bien** en las seis pestañas a 1440, 834 y 430 px, sin desborde. | `vista.mjs` |
| **Un guardado que falla se dice**, en la barra y en las seis pestañas, también en un teléfono y también a un lector de pantalla. | `guardado.mjs` |
| **Las pérdidas se clasifican** en análisis, ejecución, psicológico y sistema, sin absolver por defecto. | `errores.mjs` |

---

## Decisiones tuyas — bloquean el interruptor

1. **Licencia.** Hoy no hay: el repositorio es «todos los derechos reservados»,
   público para leer y sin permiso para usar. Si quieres que otros lo usen y lo
   mejoren, una licencia abierta (MIT es la más simple). Si quieres venderlo algún
   día, puede convenir mantenerlo cerrado. No es una decisión técnica.
2. **Nombre.** El repositorio se llama TURBOK2 y la app se presenta como Cabina. El
   nombre va en el título, en la tarjeta del enlace, en la imagen para compartir —que
   no se ha hecho por eso— y en la URL de Pages.
3. **¿Las tres cuentas de la configuración de siempre son reales?** Están en el código
   (`LEGADO_SETTINGS`) y en la historia del repositorio, que es público. Ya no se
   enseñan a nadie, pero se pueden leer. La recuperación sólo necesita sus
   **identificadores**, no sus nombres: si son reales y te importa, los nombres se
   pueden anonimizar, con un coste — si tu instalación dependiera de ellos, verías los
   nombres anónimos en tu propia cabina. Antes de hacerlo habría que comprobar que tu
   configuración está guardada.
4. **Idioma.** Sólo español. Es un mercado, y es una decisión.

---

## Acciones tuyas fuera del código

1. **Cerrar el compartido público del artefacto** — menú Share. Es el único riesgo vivo
   y explotable: el artefacto tiene datos reales y está abierto a quien tenga el enlace.
   El producto para terceros es Pages, no el artefacto.
2. **Abrir la URL de Pages** y comprobar que sirve. Desde este entorno no se puede: el
   proxy devuelve 403. La compuerta lo marca `UNKNOWN`, y así se queda hasta que alguien
   la abra.
3. **Cerrar o fusionar la PR #1.**

---

## Lo que falta y es de producto, no de lanzamiento

- **Recordatorio de copia de seguridad.** En un producto local-first, borrar los datos
  del navegador borra todo. La copia existe —«Ver el texto», importar—, pero nada te
  recuerda hacerla. Es el hueco más importante que queda para un usuario que no es el
  autor.
- **Imagen para compartir** (`og:image`), cuando haya nombre.
- **Política de seguridad de contenido (CSP).** Endurecería la página, pero el
  artefacto inyecta su propio entorno y una política mal ajustada lo rompe. Hay que
  probarla dentro del artefacto, no sólo en Pages.
