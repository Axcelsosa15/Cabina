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

## El interruptor — quitado

La cabecera de `index.html` llevó `<meta name="robots" content="noindex, nofollow">`
hasta que se decidió la licencia. **Ya no está: la página es indexable.** Publicar
indexable un producto sin licencia es publicarlo con todos los derechos reservados; con
la AGPL-3.0 puesta, eso dejó de ser cierto.

`test/lanzamiento.mjs` exigía que, mientras la línea existiera, este documento la
explicara. Al no estar, deja de exigirlo.

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
| **Se instala y abre sin conexión.** El trabajador de servicio se registra, guarda el casco —página, manifiesto e iconos— y con la red cortada la página recarga y la aplicación arranca. Medido cortando la red de verdad, no simulándola. Lo que la nube devuelve NUNCA entra en la caché: servir una respuesta de Supabase de una sesión a la siguiente movería la frontera entre dos usuarios de la base al disco del cliente. | `pwa.mjs` |
| **Lo legal existe y se enlaza**: privacidad, términos y seguridad, sin una etiqueta `<script>` y sin pedir un solo recurso externo. El canal para reportar una vulnerabilidad es privado y no publica el correo de nadie. | `pwa.mjs` §5 |
| **Un guardado que falla se dice**, en la barra y en las siete pestañas, también en un teléfono y también a un lector de pantalla. | `guardado.mjs` |
| **Las pérdidas se clasifican** en análisis, ejecución, psicológico y sistema, sin absolver por defecto. | `errores.mjs` |

---

## Decisiones tuyas — bloquean el interruptor

1. ~~**Licencia — pendiente.**~~ **Decidida: AGPL-3.0-only** ([`LICENSE`](../LICENSE)).
   Cualquiera puede usar Cabina y mejorarla; quien publique una versión modificada —
   también ofreciéndola como servicio — tiene que publicar su código igual. El autor
   sigue siendo dueño del copyright, así que puede licenciarla aparte a quien quiera
   otras condiciones. **Aviso honesto:** en una aplicación que corre entera en el
   navegador, el artículo 13 de la AGPL — el que cubre el uso en red — tiene un
   alcance discutido, porque el programa se ejecuta en la máquina del visitante y no
   en el servidor. Protege menos de lo que su fama sugiere; lo que sí hace es dejar la
   intención por escrito y cubrir con claridad a quien reparta una copia modificada.
2. **Idioma.** Sólo español. Es un mercado, y es una decisión.

Decididas: el **nombre** es Cabina — y desde el 11/10/2026 el repositorio también
(se renombró TURBOK2 → Cabina; GitHub redirige el nombre viejo, pero **Pages no**: la
URL pasó a `https://axcelsosa15.github.io/Cabina/` y la vieja da 404); las **cuentas del autor** se quitaron del código (arriba).

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
- ~~**Imagen para compartir** (`og:image`).~~ **Hecha**: `og.png` (1200×630) vive en el
  repositorio y la sirve Pages, sin servidor ajeno. `index.html` la declara con URL
  absoluta porque Twitter y LinkedIn no resuelven una relativa — esas dos líneas
  (`og:url`, `og:image`) son el único sitio del código donde la URL de Pages está
  escrita a mano. **Falta comprobarlo**: abrir la URL de Pages y pasarla por el
  validador de enlaces de la red donde vayas a compartirla.
