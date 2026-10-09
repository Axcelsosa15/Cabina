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

**Actualización, 2026-09-30:** el dueño eligió dar el paso — cuentas con contraseña y
sync entre dispositivos, sobre Supabase, sin perder el modo local. Plan, decisiones y
estado en [`MULTIUSUARIO.md`](MULTIUSUARIO.md). La fase 1 (reglas de la base y la
prueba de que un usuario no ve la data de otro) está hecha y verificada.

---

## El interruptor

La cabecera de `index.html` dice:

```html
<meta name="robots" content="noindex, nofollow">
```

Mientras esté, los buscadores no indexan la página: sólo la encuentra quien tenga el
enlace. **Quitar esa línea es el lanzamiento.** Se deja puesta a propósito hasta que
esté decidida la licencia — publicar indexable un producto sin licencia es publicarlo
con todos los derechos reservados.

`test/lanzamiento.mjs` exige que, mientras la línea exista, este documento la explique.
Cuando se quite, deja de exigirlo.

---

## Hecho y verificado

| | Verificado en |
|---|---|
| **Primer arranque neutral.** Un desconocido arranca sin cuentas, con las reglas presentes pero sin valor —y una regla sin valor no bloquea nada—, sin restricción de instrumento y sin una sola cadena de la configuración del autor. | `primer.mjs` |
| **Nadie pierde lo suyo.** La configuración guardada no se toca, ni sus cuentas ni sus reglas. A una guardada antigua a la que le falte un bloque se le rellena con el bloque neutral, y conserva el resto. Una instalación sin configuración guardada arranca neutral y sus operaciones siguen ahí. En el navegador y en la base del artefacto, sin escribir nada al abrir. | `primer.mjs` |
| **Sin rastro de la configuración del autor.** Sus cuentas, firmas y reglas salieron del código, de las pruebas, de la semilla y de la documentación; la recuperación que dependía de ellas, también. Antes de quitarla se comprobó que la instalación del autor no la necesitaba: su configuración está guardada completa y ninguna cuenta en uso depende de los identificadores antiguos. Una prueba recorre cada fichero versionado para que no vuelvan. | `lanzamiento.mjs` · `primer.mjs` |
| **Una carrera que ya existía, cerrada.** Con base remota, guardar configuración antes de que la base contestara escribía los valores por defecto encima de la real. Con el arranque neutral eso habría borrado todas las cuentas: medido, «SIN CUENTAS». Ahora no se guarda hasta que la base contesta. | `primer.mjs` |
| **No es asesoramiento financiero**, dicho en las siete pestañas y en un teléfono, con el riesgo de pérdida. | `lanzamiento.mjs` |
| **Privacidad**: el pie dice dónde viven los datos. Sin cuenta, «no se envían a ningún servidor», y es cierto: ninguna petición sale. Con cuenta, «guardado en tu cuenta» y que sólo tu sesión puede leerlos. Un solo `fetch` en todo el código, al proyecto Supabase; ni `sendBeacon` ni `<script src>`. | `lanzamiento.mjs` · `seguridad.mjs` |
| **El enlace compartido** muestra título y descripción de producto, e icono de pestaña — dentro del propio fichero, sin ningún recurso externo nuevo. | `lanzamiento.mjs` |
| **Se ve bien** en las siete pestañas a 1440, 834 y 430 px, sin desborde. | `vista.mjs` |
| **Un guardado que falla se dice**, en la barra y en las siete pestañas, también en un teléfono y también a un lector de pantalla. | `guardado.mjs` |
| **Las pérdidas se clasifican** en análisis, ejecución, psicológico y sistema, sin absolver por defecto. | `errores.mjs` |

---

## Decisiones tuyas — bloquean el interruptor

1. **Licencia — pendiente.** Hoy no hay: el repositorio es «todos los derechos
   reservados», público para leer y sin permiso para usar. Si quieres que otros lo
   usen y lo mejoren, una licencia abierta (MIT es la más simple). Si quieres venderlo
   algún día, puede convenir mantenerlo cerrado. No es una decisión técnica.
2. **Idioma.** Sólo español. Es un mercado, y es una decisión.

Decididas: el **nombre** es Cabina, y desde 2026-10-08 el repositorio también se
llama así —antes era TURBOK2—, de modo que la URL pública pasó a
`https://axcelsosa15.github.io/Cabina/`; las **cuentas del autor** se quitaron del código (arriba).

**Lo que quitarlas del código no quita:** la historia de git. Los commits anteriores
siguen conteniendo los nombres y el repositorio es público. Borrarlos de ahí exige
reescribir la historia y forzar la subida a `main`, lo que invalida todo clon, toda
rama y la PR abierta. Es posible, pero es una decisión tuya y no se hace sin pedirla.

---

## Acciones tuyas fuera del código

1. **Borrar el artefacto viejo de claude.ai, o al menos dejar de compartirlo.** La app
   ya no lo usa, pero sigue existiendo con datos reales y, si se compartió por enlace,
   abierto a quien lo tenga. Sólo su dueño puede hacerlo.
2. **Abrir la URL de Pages** y comprobar que sirve. Desde este entorno no se puede: el
   proxy devuelve 403. La compuerta lo marca `UNKNOWN`, y así se queda hasta que alguien
   la abra.
3. **Cerrar o fusionar la PR #1.**
4. **Si vas a dárselo a alguien para que entre con su cuenta**, el orden exacto de
   pasos —fusionar, migración, URL de Supabase, política de contraseñas— está en
   [`COMPARTIR.md`](COMPARTIR.md), con la comprobación de dos minutos para verificar
   tú mismo que no os veis los datos.

---

## Lo que falta y es de producto, no de lanzamiento

- **Recordatorio de copia de seguridad.** En un producto local-first, borrar los datos
  del navegador borra todo. La copia existe —«Ver el texto», importar—, pero nada te
  recuerda hacerla. Es el hueco más importante que queda para un usuario que no es el
  autor.
- **Imagen para compartir** (`og:image`). El nombre ya está; falta la imagen, y tiene
  que ir dentro del repositorio, no en un servidor ajeno.
