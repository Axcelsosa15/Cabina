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
| 2 | Adaptador en la app + pantalla de login | pendiente |
| 3 | Migrar la data del dueño (respaldo del artefacto → importar en su cuenta) | pendiente |
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

## Lo que tiene que hacer el dueño — y nunca por el chat

- **Activar la protección de contraseñas filtradas** (panel de Supabase → Auth →
  seguridad de contraseñas). Con login por contraseña no es opcional. El proyecto
  viejo la tenía apagada.
- **Al lanzar**: pasar a Pro, y configurar un proveedor de email propio (SMTP) en el
  panel. El email integrado de Supabase sólo manda unos pocos por hora: sirve para
  probar, no para registrar usuarios.
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
