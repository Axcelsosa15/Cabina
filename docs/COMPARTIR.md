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

## 2 · Fusionar lo que quede abierto

Antes aquí ponía «fusiona las PR #5, #3 y #4, en este orden». **Ya no hay que
hacer nada de eso: las tres están dentro de `main`.** Comprobado en el código,
no en la memoria — la migración `…_version_occ.sql`, el código de conflictos de
la app y `QE.contratosDe` (el arreglo de la comisión y la cantidad en negativo)
están los tres en el repositorio.

Lo único que puede quedar abierto es la **PR #13**, que hace que el primer
arranque pida la cuenta. Sin ella la cabina funciona igual y el aislamiento es
el mismo, pero tu amigo abrirá el enlace y no habrá nada que le invite a crear
cuenta: se pondrá a apuntar operaciones en el `localStorage` de su navegador. Es
exactamente el problema que quieres evitar, así que fusiónala.

Es un borrador: quítale el borrador («Ready for review») y fusiónala.

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

1. **URL Configuration**, con estos dos valores exactos:

   | campo | valor |
   |---|---|
   | *Site URL* | `https://axcelsosa15.github.io/Cabina/` |
   | *Redirect URLs* | `https://axcelsosa15.github.io/Cabina/**` |

   **Pasó el 2026-10-08, con esta guía ya escrita y este paso sin hacer:** al pulsar
   «Crear cuenta» el enlace del correo llevó a `http://localhost:3000`, que es el
   valor de fábrica del *Site URL*. No es un fallo de la app — envía su `redirect_to`
   correcto—, pero Supabase lo descarta si no está en la lista blanca y cae al *Site
   URL*. Por eso van **los dos** campos, no sólo el primero.

   Si ya intentaste crear la cuenta antes de arreglarlo, ese usuario existe pero sin
   confirmar y volver a registrarlo con el mismo correo falla. Bórralo en
   **Authentication → Users** y repite.

   La URL sale del propio despliegue: `pagina.yml` la imprime y comprueba byte a byte
   que sirve el `index.html` probado. Si algún día renombras el repositorio, **cambia
   también estos dos campos** — pasó: el repositorio se llamaba TURBOK2 y la URL vieja
   quedó escrita en tres documentos.
2. **Que el alta esté abierta.** «Allow new users to sign up» tiene que estar
   encendido, o su registro se rechaza sin explicar por qué.
3. **Contraseñas: mínimo 8 y protección de contraseñas filtradas encendida.** Con
   login por contraseña no es opcional: es lo único que impide que entre con una
   contraseña que ya está en una filtración pública.

## 5 · Dale el enlace

Él abre la URL y lo primero que ve, arriba del todo, es esta barra:

> **SIN CUENTA** — Lo que apuntes se queda sólo en este navegador y se pierde si
> borras sus datos. Con cuenta, tu cabina es tuya: nadie más la ve, ni quien te
> dio el enlace.  ·  **[Crear cuenta]**  **[Ahora no]**

**Crear cuenta** → confirma el correo → ya está dentro, con su cabina vacía.

La barra sale sola y sólo en un navegador que no tenga nada guardado todavía.
Antes no existía: la cabina abría en local con un botón «Entrar» discreto arriba
y nada que invitara a usarlo, así que quien recibía el enlace se ponía a apuntar
operaciones sin crear cuenta nunca —sus datos no vivían en ninguna cuenta y
borrar los datos del navegador los borraba—.

Es una **barra y no una ventana** por dos razones. Una ventana al arrancar
intercepta los clics de toda la app: la cabina deja de responder hasta que
alguien cierre algo, y eso se midió —tumbó doce filas de la compuerta—. Y una
ventana se cierra una vez y no vuelve, mientras que la barra se queda hasta que
haya cuenta o hasta que él diga «Ahora no».

**No es un muro**, y es a propósito: un login obligatorio encima del paso 4 de
aquí abajo, todavía sin hacer, dejaría fuera a todo el mundo, tú incluido.

Lo vigila `test/bienvenida.mjs`.

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
