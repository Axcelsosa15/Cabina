# Darle Cabina a otra persona

Para que alguien más entre con **su** cuenta, vea **sus** datos y no vea los tuyos —ni
tú los suyos—. Es el escenario para el que se construyó la fase de multiusuario, y lo
único que falta es configuración, no código.

Léelo en orden. Los pasos 1 a 5 son tuyos y nadie más puede hacerlos: viven en tu
cuenta de GitHub y en tu proyecto de Supabase.

---

## Lo que ya está garantizado, y por qué puedes creerlo

| | cómo está probado |
|---|---|
| Él no lee tus operaciones, ni tú las suyas | La política de la base es `auth.uid() = user_id` para leer, crear, cambiar y borrar, con RLS **activada y forzada** (también para el dueño de la tabla). `supabase/pruebas/aislamiento.sql`: `B_lee_de_A=0 B_modifica_de_A=0 B_borra_de_A=0 B_escribe_como_A_bloqueado=true`. Corrido contra el proyecto real el 2026-09-30 y contra un Postgres 16 local en `test/db.mjs` |
| No depende de que la app filtre bien | **Sabotaje medido**: con la política abierta (`using (true)`) y sin tocar una línea de la app, `B_lee_de_A` pasó de 0 a 2. Lo que protege es la base, no el frontend |
| Sus capturas de pantalla son suyas | Bucket privado, cada imagen en `<user_id>/<id>`, y la política sólo deja tocar lo que cuelga de la carpeta propia. `capturas.sql`: `B_lee_de_A=0 B_sube_en_carpeta_de_A_bloqueado=true anonimo_ve=0` |
| Ninguna imagen tiene URL pública | Se piden con su token y se muestran desde un `objectURL` |
| Dos personas en el mismo navegador | Al salir no queda rastro de la sesión anterior: `test/cuentas.mjs`, 61 aserciones |
| Si algo no se guarda, la app lo dice | Nunca pone «sincronizado» sobre un cambio que la base rechazó: `test/guardado.mjs` y `test/conflicto.mjs` |

La clave pública de Supabase está en el `index.html` y **eso es correcto**: es
publicable por diseño, y lo que separa a un usuario de otro son las políticas, no el
secreto de esa clave. No hay ninguna credencial privada en el repositorio.

---

## 1 · Que `main` esté verde

`pagina.yml` **sólo** publica cuando la compuerta sale verde. Si `main` está rojo, la
página sigue sirviendo la versión anterior y nada de lo que hagas abajo se ve.

Compruébalo en **Actions → pruebas**, en la última corrida de `main`.

## 2 · Fusionar las PR, en este orden

Son borradores: hay que quitarles el borrador («Ready for review») y fusionarlas.

1. **#5** — reincrusta el motor refactorizado. Sin esto `main` sigue rojo.
2. **#3** — los arreglos de dinero. **Esta es la importante**: sin ella, una comisión
   escrita en negativo *suma* dinero y una cantidad negativa da dos R distintas en dos
   pestañas. No le des a nadie una versión sin esto.
3. **#4** — la concurrencia entre dispositivos (abajo, paso 3).

Entre #3 y #4 puede salir conflicto en `index.html`: se resuelve, se corre
`npm run bundle`, se reincrusta (paso 2–3 de «Cambiar el motor» en
[`DEVELOPMENT.md`](DEVELOPMENT.md)) y se vuelve a pasar la compuerta.

## 3 · Aplicar la migración de la versión

En **Supabase → SQL Editor**, pega y ejecuta el contenido de
`supabase/migrations/20261007010000_cabina_docs_version_occ.sql`.

**Qué pasa si no lo haces:** la app sigue funcionando y el aislamiento entre vosotros
sigue intacto —eso no depende de esto—, pero si una sola persona abre la cabina en el
portátil y en el móvil a la vez, un cambio puede perderse. La app lo detecta y lo dice
en el pie («esta base todavía no detecta si otro dispositivo cambió un documento»), no
se lo calla.

Para comprobar que quedó aplicada, pega también
`supabase/pruebas/concurrencia.sql`. Tiene que dar exactamente:

```
v_inicial=1 A_escribe=1 v_tras_A=2 B_con_version_vieja=0 B_no_piso_a_A=true
A_con_version_nueva=1 v_tras_A2=3 cliente_no_decide_version=true
borrado_viejo=0 borrado_bueno=1 update_despues_de_delete=0
delete_despues_de_update=0 aislamiento_sigue=0
```

Termina con un error a propósito (`RESULTADO …`): la transacción se deshace y no deja
nada en la base. Eso es lo que tiene que pasar.

## 4 · Supabase → Authentication

Tres cosas, y la primera es la que rompe el alta si falta.

1. **URL Configuration.** *Site URL* = la URL de tu página de Pages, y la misma en
   *Redirect URLs*.
   **Si no lo pones, el enlace del correo de confirmación le lleva a `localhost` y no
   puede terminar de crear la cuenta.** Es el fallo número uno de este paso.
2. **Que el alta esté abierta.** «Allow new users to sign up» tiene que estar
   encendido, o su registro se rechaza sin explicar por qué.
3. **Contraseñas: mínimo 8 y protección de contraseñas filtradas encendida.** Con
   login por contraseña no es opcional: es lo único que impide que entre con una
   contraseña que ya está en una filtración pública.

## 5 · Dale el enlace

Él abre la URL → **Entrar** → **Crear cuenta** → confirma el correo → ya está dentro,
con su cabina vacía.

La página lleva `<meta name="robots" content="noindex, nofollow">`, así que no sale en
buscadores: sólo entra quien tenga el enlace. Para dárselo a un amigo es justo lo que
quieres; cuando quieras abrirlo al público, ver [`LANZAMIENTO.md`](LANZAMIENTO.md).

---

## Compruébalo tú, en dos minutos

No te fíes de esta tabla ni de mí. Hazlo:

1. Entra con tu cuenta y mira que estén tus operaciones.
2. Sal. Crea una cuenta de prueba con otro correo.
3. Esa cuenta tiene que arrancar **vacía**: sin tus cuentas, sin tus reglas, sin tus
   operaciones. Si ves algo tuyo, **para y dímelo**: eso sería el fallo grave.
4. Apunta una operación en la cuenta de prueba. Sal. Entra con la tuya.
5. Esa operación **no** puede estar. Si está, lo mismo: para.

Luego borra la cuenta de prueba desde Supabase → Authentication → Users.

---

## Lo que él tiene que saber

- **No es asesoramiento financiero.** Lo dice la app en las siete pestañas, y es cierto.
- **Sin cuenta, los datos viven sólo en su navegador**, y borrar los datos del
  navegador los borra. Con cuenta están en tu proyecto de Supabase.
- **La copia de seguridad la tiene que hacer él**, con «Ver el texto» en el respaldo.
  Nada se lo recuerda todavía: es el hueco más importante que queda
  ([`LANZAMIENTO.md`](LANZAMIENTO.md)).
- **Sus datos están en TU proyecto de Supabase.** Tú no los puedes leer desde la app
  —la RLS te lo impide igual que a él—, pero sí desde el panel de Supabase, porque eres
  el dueño del proyecto. Es honesto decírselo antes, no después.

## Lo que todavía no hay

- Importar desde bróker o CSV: se meten a mano.
- Formulario para crear versiones del contrato de una firma: la arquitectura está, la
  interfaz no.
- Sincronización en vivo: los cambios de otro dispositivo llegan al volver a la
  pestaña, no al instante.
- Al borrar una operación, sus capturas se quedan en el bucket.
