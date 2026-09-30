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

Una sola tabla, `cabina_docs (user_id, path, data, updated_at)`, con la misma forma
que la base del artefacto: `settings/main`, `days/<fecha>`, `trades/<id>`. Por eso la
app cambia un **adaptador**, no su modelo de datos ni sus 11.000 líneas.

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
| 3 | Migrar la data del dueño (respaldo del artefacto → importar en su cuenta) | pendiente · ya no necesita código: con sesión, «Importar copia» escribe en la cuenta |
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

- **Botón «Entrar»** arriba, sólo fuera del artefacto. Email y contraseña: entrar,
  crear cuenta (confirmación por email), olvidé mi contraseña. Los enlaces del correo
  vuelven a la página; el token se recoge y **se borra de la barra de direcciones**.
- **`nubeDb()`**: el mismo idioma que la base del artefacto, sobre `fetch` y sin
  librería. Una sola función llama a la red, a un solo origen, con la clave publicable.
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

Un arreglo que salió de aquí y **también afectaba al artefacto**: borrar varias
sesiones a la vez leía y borraba de `localStorage`. Con base, la confirmación decía
«sin resultados», no se borraba nada de la base y el historial se quedaba en blanco.

### Fase 2 — cómo se verificó, y lo que NO

| | |
|---|---|
| `test/cuentas.mjs` | 63 comprobaciones contra un doble de Supabase: login, escritura con el `user_id` correcto, recarga, token caducado y revocado, salir sin dejar rastro, dos personas en el mismo navegador, borrado en lote, subir lo local, enlaces del correo, abrir sin red, 1005 operaciones, artefacto sin botón |
| Sabotajes | sin vaciar la papelera → 2 rojos; cargando lo local con sesión → rojo; sin el rótulo «sin conexión» → 2 rojos. Los tres cazados |
| `test/seguridad.mjs` | un origen, una clave publicable, `fetch` sólo a la nube y a imágenes filtradas; sin cuenta, ninguna petición fuera |
| Proyecto real, SQL | el upsert que hace el adaptador, bajo RLS: una fila por ruta, la segunda escritura reemplaza, el orden por fecha es el que espera la app, y B no puede escribir sobre la fila de A. En una transacción que se deshace |
| **No verificado** | la app contra el proyecto real. El proxy del entorno de desarrollo devuelve **403** a `supabase.co`: desde aquí no hay túnel. La primera prueba real es la tuya (abajo) |

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
