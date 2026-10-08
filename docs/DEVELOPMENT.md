# Desarrollo

## Arrancar

```sh
npm ci            # instala Playwright (fijado en 1.56.1); es la única dependencia
npm run serve     # http://localhost:8000/
```

`index.html` también se abre como archivo suelto.

## Pruebas

```sh
npm test                    # todas las suites, un proceso por archivo
npm test capturas           # sólo las suites cuyo nombre empieza por «capturas»
node engine/quant/quant.test.js   # sólo el motor, sin navegador
npm run compuerta           # la suite + la tabla de la cadena: lo que corre CI
```

La compuerta imprime una fila por eslabón con `PASS`, `FAIL` o `UNKNOWN`. `UNKNOWN`
es lo que no se puede comprobar desde el repositorio (que Pages sirva lo mismo que
`index.html`, que la base real aísle a los usuarios) y nunca cambia el código de
salida.

**No edites ficheros que la compuerta lee mientras corre** (`index.html`, `test/`,
`engine/`, `docs/`, `PROTOCOLOS.md`): mide lo que haya en disco en cada momento.

Las pruebas de cuentas y capturas corren contra `test/nube-doble.mjs`, un doble de
Supabase dentro de Playwright (auth, `cabina_docs` con RLS, el bucket `capturas`), que
además se puede romper a propósito (`e.caida`, `e.roto`, …). Lo que el doble no
demuestra —que la base real aísle a los usuarios— lo demuestran
`supabase/pruebas/aislamiento.sql` y `capturas.sql`, que se corren a mano contra el
proyecto.

## Cambiar el motor

1. Edita `engine/quant/<módulo>.js` y su prueba en `quant.test.js`.
2. `npm run bundle`.
3. Reincrusta el bundle en `index.html` desde `const QE = (function () {` hasta el
   `})();` que cierra el `return { QE_VERSION, … }`, con dos espacios de sangría.
4. `npm test capa2`: §15 dice si lo incrustado es exactamente el bundle.

Una función nueva del motor sólo es pública si está en `PUBLICOS` de `bundle.mjs`.

## Cambiar el esquema de Supabase

1. Escribe la migración en `supabase/migrations/<fecha>_<nombre>.sql`.
2. Aplícala al proyecto «cabina».
3. Si toca permisos, añade o actualiza la prueba de `supabase/pruebas/` y córrela,
   incluido un sabotaje que demuestre que caza la fuga.
4. Revisa los avisos de seguridad del proyecto.

## Antes de publicar

- `npm run compuerta` en verde.
- Un cambio que arregla un fallo lleva una prueba que se pone roja con el código
  anterior. Compruébalo: corre la prueba contra `git show HEAD:index.html`.
- Ni `service_role` ni `sb_secret_` en ningún fichero: `seguridad.mjs` lo comprueba.

Los procedimientos, y el fallo que produjo cada uno, están en
[../PROTOCOLOS.md](../PROTOCOLOS.md).


<!-- CI validation checkpoint: backend-final-validation -->
