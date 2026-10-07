# Usuarios con cuenta y sincronización

Cabina pasa de «cada uno en su navegador» a **cuentas con sync entre dispositivos**,
sin que la data de un usuario se vea desde otro. Decidido el 2026-09-30.

---

## Decisiones

| | Elegido | Por qué |
|---|---|---|
| Dónde vive la data | Proyecto Supabase **nuevo**, `cabina` (`us-east-1`), solo para Cabina | Aislado de la bitácora que ya existe: un error en uno no toca al otro |
| Inicio de sesión | **Email y contraseña** | Elegido por el dueño. Obliga a activar la protección de contraseñas filtradas |
| Plan | **Gratis para construir, Pro al lanzar** | El plan gratis pausa el proyecto tras días sin uso: no vale para usuarios reales |
| Sin cuenta | La app sigue funcionando como hoy, en el navegador | Local-first no se pierde: la cuenta añade sync, no la exige |

---

## El diseño, y la regla que lo sostiene

La clave pública del proyecto va **dentro de la página**, que cualquiera puede leer.
Es así por diseño en Supabase, y significa que **lo único que separa la data de dos
usuarios son las reglas de la base** (Row Level Security). No la app, no la clave.

Una sola tabla, `cabina_docs (user_id, path, data, updated_at)`, con el mismo modelo
de documentos que usa la app sin cuenta: `settings/main`, `days/<fecha>`,
`trades/<id>` ([DATA_MODEL.md](DATA_MODEL.md)). La app cambia de **backend**, no de
modelo de datos.

Reglas (`supabase/migrations/20260930063500_cabina_docs_por_usuario.sql`):

- cada usuario lee, crea, cambia y borra **sólo** sus filas (`auth.uid() = user_id`);
- RLS **forzado**, también para el dueño de la tabla;
- el rol anónimo **no tiene ningún permiso** sobre la tabla;
- borrar un usuario borra toda su data (`on delete cascade`);
- `updated_at` lo pone el servidor; rutas y tamaño validados en la propia tabla.

---

## Fases

| | Fase | Estado |
|---|---|---|
| 1 | Tabla, reglas y prueba de aislamiento | **Hecha** · 2026-09-30 |
| 2 | Adaptador en la app + pantalla de login | **Hecha en código** · 2026-09-30 · falta la primera prueba real (abajo) |
| 3 | Migrar la data del dueño | **Descartada** por el dueño el 2026-09-30: empieza de cero. Si hiciera falta, con sesión «Importar copia» escribe en la cuenta |
| 4 | Lanzamiento: plan Pro, email propio, política de privacidad, borrar cuenta, `noindex` fuera | pendiente |

### Fase 1 — verificada

`supabase/pruebas/aislamiento.sql`, corrida contra el proyecto real dentro de una
transacción que se deshace sola:

```
A_ve_lo_suyo=2  B_lee_de_A=0  B_modifica_de_A=0  B_borra_de_A=0
B_escribe_como_A_bloqueado=true  B_ve_solo_lo_suyo=1  anonimo_bloqueado=true  A_intacto=1
```

**Sabotaje**: con la regla de lectura cambiada a «todos leen todo», B leyó el
documento de A. La prueba caza la fuga. Después: 0 documentos, 0 usuarios de prueba,
regla real intacta. El revisor de seguridad de Supabase: **sin avisos**.

---

### Fase 2 — lo que hay

- **Botón «Entrar»** arriba. Email y contraseña: entrar,
  crear cuenta (confirmación por email), olvidé mi contraseña. Los enlaces del correo
  vuelven a la página; el token se recoge y **se borra de la barra de direcciones**.
- **`nubeDb()`**: la misma interfaz que el almacén local (`localDb()`), sobre
  `fetch` y sin librería. Una sola función llama a la red, a un solo origen, con la clave publicable.
- **El almacén se elige al arrancar y una sola vez.** Entrar y salir recargan la
  página: nunca conviven en memoria los datos de dos personas.
- **Con sesión, lo local no se carga.** Si se pintara, la configuración de este
  navegador entraría en la cuenta al primer cambio. Lo local queda intacto, y el
  diálogo ofrece **subirlo** — con doble clic, sin borrar nada de la cuenta y sin
  pisar una configuración que la cuenta ya tenga.
- **La papelera (Deshacer) se vacía al entrar y al salir.** Vive en el navegador; sin
  esto, lo borrado por una persona se podía «deshacer» dentro de la cuenta de otra.
- **Sesión caducada**: se renueva sola (una vez, aunque tres escrituras la pidan a la
  vez). Si el servidor la revoca, el rótulo dice «sesión caducada» y el pie que no se
  guarda nada — no «sincronizado».
- **Sin red**: el rótulo dice «sin conexión» y que no se guarda, no «sincronizado»
  sobre una cabina vacía. Al volver la red, todo se recarga solo.
- **Sin tope de 1000** por colección: el adaptador pagina.
- **No es tiempo real.** Lo que escribes se ve al instante; lo de otro dispositivo,
  al volver a la pestaña (como mucho cada 20 s).
- **Un documento viejo no pisa uno nuevo.** Cada documento lleva un sello
  `updatedAt` y gana el más alto; empate o ausencia la deja ganar al servidor.
  `days/<fecha>` ya lo hacía; `settings/main` —el documento que guarda TODAS las
  cuentas de prop firm y TODAS las reglas— no, y las fichas de colección lo llevaban
  escrito pero nadie lo miraba al leer. Dos pérdidas silenciosas, medidas:
  (1) crear una cuenta y volver a la pestaña dentro de los 500 ms del `debounce`
  dejaba la pantalla sin la cuenta recién creada **y** guardaba los valores remotos,
  así que no quedaba en ningún sitio desde el que recuperarla, con el rótulo diciendo
  «sincronizado»; (2) una lectura que llegaba tarde con la versión anterior de una
  operación borraba la edición que se acababa de guardar. `test/sello.mjs`.

---

## Dos dispositivos escribiendo a la vez: resuelto, y cómo

**Antes** el adaptador escribía con un upsert **sin condición**
(`POST … on_conflict=user_id,path` + `resolution=merge-duplicates`) y borraba con un
`DELETE ?path=eq.<p>` a secas. La base no miraba nada antes de escribir: el último
que llegaba ganaba, el otro cambio desaparecía, y nadie lo detectaba. Medido: A
guarda «Setup validado», B guarda «Setup rechazado» desde la misma versión, la base
queda con la de B y el rótulo dice **«sincronizado»**.

**Ahora** cada documento lleva una columna `version` y toda escritura va condicionada:

```
PATCH /cabina_docs?path=eq.<p>&version=eq.<la que leí>
Prefer: return=representation
```

PostgREST devuelve **las filas afectadas**. Cero filas significa que alguien escribió
entre mi lectura y mi escritura, y entonces mi escritura **no ocurrió**: se levanta
como conflicto. El borrado va igual condicionado, porque un borrado ciego es peor que
un update perdido: no deja nada que recuperar.

**La versión la pone la base**, con el trigger `cabina_docs_sello`. El cuerpo del
PATCH lleva `data` y nada más; si el cliente pudiera mandar el número, un cliente con
un fallo volvería a tener last-write-wins y la base no podría impedirlo. El cliente
sólo puede **decir qué versión cree que hay**, en el WHERE.

**No se usó una RPC.** Una función `security definer` salta la RLS, así que el
aislamiento entre usuarios pasaría a depender de que la función esté bien escrita en
vez de de la política. Un UPDATE condicional ya es atómico y no cambia quién ve qué.

### Los seis estados del rótulo, de más grave a menos

| | qué significa |
|---|---|
| **CONFLICTO · n** | otro dispositivo cambió el documento; lo de aquí NO se guardó y no se guardará solo |
| sesión caducada | todo lo que escribas a partir de ahora se rechaza |
| sin conexión | no hay red; lo que ves puede no estar al día |
| SIN GUARDAR · n | una escritura falló por otra razón |
| guardando… | hay algo en vuelo |
| sincronizado | la base tiene lo que hay en la pantalla |

CONFLICTO va primero porque es el único estado en el que existen dos versiones de un
dato del usuario y una se pierde si no decide.

**`LOCAL_CHANGES` no existe en esta app, y no se inventa.** Aquí una edición se
escribe en cuanto se hace (con 400–500 ms de `debounce`), no se acumula en una cola
que el usuario sincroniza a mano. El hueco del `debounce` es lo más parecido y ya
está cubierto: el sello `updatedAt` impide que una lectura lo pise, y si la escritura
falla el estado pasa a SIN GUARDAR.

### El diálogo no elige

Enseña **las dos versiones a la vez** —no detrás de un botón «ver cambios remotos»—
y ofrece *mantener las mías* o *usar la de la cuenta*, **sin ninguna preseleccionada**.
Se abre solo al detectar el conflicto, salvo que ya haya otro diálogo abierto (no se
roba una edición a medias); entonces la vía de entrada es un **botón de verdad**
(«Resolver conflicto», junto al rótulo), que sólo existe mientras haya algo que
resolver. No es el rótulo disfrazado de botón: el rótulo es una región viva
(`role="status"` + `aria-live="polite"`) cuyo trabajo es que un lector de pantalla
anuncie los cambios de estado sin interrumpir, y ponerle `role="button"` encima se lo
quita —eso se intentó primero y lo cazó `test/ui.mjs`—. Un `<button>` trae foco,
Enter y espacio sin escribir un manejador de teclado. Cerrar el diálogo con Escape
**no resuelve nada**: el rótulo sigue diciendo CONFLICTO y el botón sigue ahí, porque
cerrar no es decidir.

**No hay fusión automática.** Un `Object.assign` de dos versiones de una operación
puede producir una tercera que nunca existió —la entrada de una y la salida de la
otra— y eso es peor que perder una, porque nadie se da cuenta. Donde una fusión fuera
demostrablemente segura para una entidad concreta se podría añadir; no en genérico.

### Si la migración no está aplicada

`index.html` se publica solo en cuanto la suite pasa; la migración la aplica el dueño
**a mano**. En esa ventana la página nueva habla con una base sin columna `version`, y
`select=data,version` daría 42703: la cabina no cargaría. Así que se detecta una vez,
se vuelve al upsert anterior, **y el pie lo dice**: deja de prometer protección entre
dispositivos, porque sin la columna no la hay. Al aplicar la migración vuelve solo.

### Cómo se verifica, en dos niveles que no se confunden

| | qué demuestra | estado |
|---|---|---|
| `test/db.mjs` | **Postgres 16 real, local.** Aplica las migraciones del repositorio tal cual sobre un arnés con lo mínimo de `auth` y `storage` y corre `concurrencia.sql`, `aislamiento.sql` y `capturas.sql`. Demuestra el DDL, el trigger, el UPDATE condicional y la RLS entre dos usuarios | **PASS** |
| `test/conflicto.mjs` | la app real contra el doble: A gana, B ve conflicto, la base conserva lo de A. Contra el upsert anterior se pone roja | **PASS** |
| el proyecto Supabase real | que el proyecto **tenga** la migración aplicada, que el `auth.uid()` de GoTrue se comporte como el sustituto, que PostgREST devuelva `[]` con 0 filas, y que el Storage aplique las políticas igual | **UNKNOWN** |

El UNKNOWN no es un hueco por rellenar: desde este entorno la política de red deniega
`supabase.co` (403 al CONNECT, medido con `curl`). Lo corre el dueño:
`supabase/pruebas/concurrencia.sql` en el editor SQL del proyecto, con el sabotaje que
el propio fichero describe.

### Lo que sigue sin resolverse

Esto detecta el conflicto; **no** hace la cabina en tiempo real. Lo que escribes se ve
al instante y lo de otro dispositivo llega al volver a la pestaña. Y la primera
escritura de una sesión sobre un documento que esa pestaña no ha leído cuesta **una
ronda más** (lee para saber la versión); es el precio de no escribir a ciegas.

Un arreglo que salió de aquí: borrar varias sesiones a la vez leía y borraba de
`localStorage`. Con base, la confirmación decía
«sin resultados», no se borraba nada de la base y el historial se quedaba en blanco.

### Capturas — bucket privado

`supabase/migrations/20260930120000_capturas_por_usuario.sql`: bucket `capturas`,
privado, 20 MB, sólo png/jpeg/webp/gif. Cada objeto vive en `<user_id>/<id>` y las
políticas de `storage.objects` sólo dejan leer, subir y borrar bajo la carpeta propia.
No hay URL pública de ninguna imagen: la app la pide con el token y la enseña desde un
`objectURL`.

`supabase/pruebas/capturas.sql`, contra el proyecto real, 2026-09-30:

```
A_ve_lo_suyo=1  A_fuera_de_su_carpeta_bloqueado=true  B_lee_de_A=0
B_sube_en_carpeta_de_A_bloqueado=true  anonimo_ve=0  A_intacto=1
```

**Sabotaje**: con la lectura abierta a todos, B leyó 1 objeto de A. Después: política
real intacta, 0 objetos, 0 usuarios de prueba. Avisos de seguridad de Supabase: 0.

**No probado en SQL**: el borrado. Supabase prohíbe `delete from storage.objects`
desde SQL con un trigger; la política de borrado usa la misma expresión que la de
lectura. En la app lo cubre `test/capturas.mjs` contra el doble.

### Fase 2 — cómo se verificó, y lo que NO

| | |
|---|---|
| `test/cuentas.mjs` | contra un doble de Supabase: login, escritura con el `user_id` correcto, recarga, token caducado y revocado, salir sin dejar rastro, dos personas en el mismo navegador, borrado en lote, subir lo local, enlaces del correo, abrir sin red, 1005 operaciones |
| Sabotajes | sin vaciar la papelera → 2 rojos; cargando lo local con sesión → rojo; sin el rótulo «sin conexión» → 2 rojos. Los tres cazados |
| `test/seguridad.mjs` | un origen, una clave publicable, un solo `fetch` en toda la app y va a la nube; sin cuenta, ninguna petición fuera |
| Proyecto real, SQL | el upsert que hace el adaptador, bajo RLS: una fila por ruta, la segunda escritura reemplaza, el orden por fecha es el que espera la app, y B no puede escribir sobre la fila de A. En una transacción que se deshace |
| **No verificado** | la app contra el proyecto real. El proxy del entorno de desarrollo devuelve **403** a `supabase.co`: desde aquí no hay túnel. La primera prueba real es la tuya (abajo) |

### Fase 3 — romper a propósito, para saber si la prueba sirve

Una prueba que pasa igual con la protección quitada no prueba nada. Cada protección
nueva se desarmó, se corrió la suite que la cubre, y se deshizo el sabotaje. Las seis
veces la suite se puso roja; el árbol quedó limpio después de cada una.

| qué se rompió | quién lo cazó | qué se vio |
|---|---|---|
| el cliente escribe sin decir qué versión leyó (`parchea` sin `version=eq.`) | `test/conflicto.mjs` | **10 rojos**: la base acepta la escritura tardía, el texto de A desaparece y el rótulo sigue diciendo «sincronizado» |
| el borrado no mira la versión (`borra` sin `version=eq.`) | `test/conflicto.mjs` | 1 rojo: el borrado de B se lleva la edición que A acababa de guardar |
| la política de lectura deja de mirar `user_id` (`using (true)`) | `test/db.mjs` → `aislamiento.sql` | `B_lee_de_A=2` donde debe ser 0 |
| la propiedad de las capturas deja de mirar la carpeta (`with check` sin la carpeta) | `test/db.mjs` → `capturas.sql` | `A_fuera_de_su_carpeta_bloqueado=false` y `B_sube_en_carpeta_de_A_bloqueado=false` |
| la base deja que el cliente fije la versión (`coalesce(new.version, …)` en el trigger) | `test/db.mjs` → `concurrencia.sql` | `B_no_piso_a_A=false` y `cliente_no_decide_version=false`: last-write-wins otra vez, exactamente |
| la versión de reglas anclada se ignora y manda la vigente hoy | `test/versiones.mjs` | 21 rojos: el pasado vuelve a juzgarse con las reglas de ahora |

**Dos de los sabotajes del encargo no tienen dónde aplicarse**, y eso no se disimula:
una fila mala de CSV y una operación duplicada. No hay importador de CSV ni huella de
deduplicación en esta fase (ver «Lo que no está hecho»), así que no hay protección que
desarmar. Inventar un sabotaje contra un código que no existe sería el peor resultado
posible: un informe en verde sobre nada.

## Lo que tiene que hacer el dueño — y nunca por el chat

Para abrir las cuentas, en este orden:

1. **GitHub Pages activado** (Settings → Pages → Source: GitHub Actions). Sin eso no
   hay página pública donde entrar.
2. **Supabase → Authentication → URL Configuration**: *Site URL* =
   `https://axcelsosa15.github.io/TURBOK2/`, y la misma URL en *Redirect URLs*. Sin
   esto, los enlaces de confirmar y de recuperar vuelven a `localhost`.
3. **Activar la protección de contraseñas filtradas** y poner el **mínimo en 8**
   (Authentication → contraseñas). Con login por contraseña no es opcional. El
   proyecto viejo la tenía apagada.
4. **La primera prueba real**: en la página de Pages, crear cuenta con tu email,
   abrir el enlace, crear una operación, abrirla desde el teléfono. Es lo único
   que ninguna prueba de aquí cubre.
- **Al lanzar**: pasar a Pro, y configurar un proveedor de email propio (SMTP) en el
  panel. El email integrado de Supabase manda muy pocos por hora y, hasta donde sé,
  **sólo a direcciones del equipo del proyecto**: con él puedes probar tú, pero un
  desconocido no recibirá el enlace de confirmación. Sin SMTP propio, las cuentas
  no están abiertas al público aunque el botón exista.
- Ninguna clave secreta (`service_role`, SMTP) se pega en el chat ni entra al
  repositorio. La app sólo lleva la clave **pública**, y está bien que la lleve.

## Lo que cambia en el repositorio en la fase 2, y por qué

- `test/seguridad.mjs` hoy exige que el único origen externo sean las fuentes de
  Google y que no haya `<script src>`. Pasará a permitir **exactamente** el origen
  del proyecto, y el cliente se escribe con `fetch`, sin librería de terceros.
- El pie dice «tus operaciones no se envían a ningún servidor». Con sesión iniciada
  deja de ser verdad, y el texto cambiará para decir cuándo sí.
- La prueba de aislamiento entra en la compuerta. Desde CI necesita credenciales de
  un proyecto de pruebas, que el dueño guarda en los secretos de GitHub: mientras no
  estén, la fila es `UNKNOWN`, nunca `PASS`.

Hecho así en la fase 2: `seguridad.mjs` exige un único origen y una clave
`sb_publishable_`; el pie sin cuenta sigue diciendo «no se envía nada» y es verdad
(comprobado sobre todas las peticiones); con cuenta dice a qué cuenta se guarda. La
compuerta tiene dos filas nuevas: `cuentas` (PASS/FAIL) y «La base real aísla a los
usuarios» (`UNKNOWN` en CI).
