# Cabina 2.0 · Handoff de navegación para Claude y revisores

Fecha: 2026-10-31 · Rama: `design/cabina-2-navigation-groups-20261031`

## Alcance real de este incremento

Se ha añadido agrupación navegable sobre los 11 tabs existentes sin otro router ni otra fuente de datos.

- Escritorio: barra superior con **Todas**, Operar, Analizar, Mejorar, Portafolio, Herramientas y Sistema.
- Al pulsar un grupo se navega por el `.tabbtn` original y se reduce la subnavegación a los tabs de esa área.
- **Todas es la selección inicial:** conserva los 11 enlaces visibles, importante para los recorridos automáticos existentes que hacen `page.click('.tabbtn[data-tab="..."]')` sin pulsar antes un grupo.
- Las rutas internas que cambian pestaña (búsqueda, hash, acciones en otras pantallas) actualizan la selección agrupada mediante observación de la clase `active`.
- Un grupo recuerda su última pestaña visitada mientras la página permanece abierta; no escribe en Supabase/localStorage.
- Móvil (<=700px) mantiene los cuatro accesos directos y el botón Más. La hoja Más conserva sus siete destinos, ordenados por categoría.
- El botón Más ahora indica que una vista secundaria está activa incluso en Historial o Ajustes, casos antes omitidos del conjunto `secondary`.

El nuevo test `test/navegacion-grupos.mjs` comprueba rutas, hashes, acciones, visibilidad, accesibilidad, ambos temas y dock móvil a 390/320px. El test de estructura vigente sigue exigiendo cinco `<style>`.

## Separación de trabajos simultáneos

PR #97 y PR #98 tocan el editor genérico (`app.js` / `index.html`) y deben ser **reconciliados por separado**. Este incremento sólo toca el markup/estilos de navegación y un controlador fuera del IIFE principal en `app.js`; no debe copiarse el código de validación de ambos PR ni fusionarlos a ciegas.

Recomendación para Claude:
1. Revisar la rama con su diff contra `main`, sin reescribir el sistema visual ni QuantEngine.
2. Auditar el recorrido de teclado de la nueva barra, visibilidad del grupo elegido y scroll del menú en 701/768/1024/1280px, y mobile a 320/390/430px.
3. Revisar claro/oscuro y acento personalizable mediante **colores computados**; no basta revisar tokens.
4. Ejecutar `npm run compuerta` y especialmente `test/navegacion-grupos.mjs`, `test/idioma.mjs`, `test/vista-personalizable.mjs`, `test/ui.mjs`, `test/pwa.mjs`.
5. Si falla algo, aportar el log exacto y corregir la causa en esta rama, conservando las 11 rutas y el mapa de grupos.
6. Antes de proponer merge, comprobar PR #97/#98 y `main` para evitar sobrescrituras concurrentes. No modificar ni borrar reglas de firma, operaciones, snapshots, filtros, motor, importador, persistencia o autenticación.

## Compuerta de publicación

**No desplegar ni anunciar PASS** hasta que CI de esta rama sea verde, tests nuevos estén ejecutados, y una revisión visual de escritorio/móvil sea completada. Sin un navegador accesible para la página publicada, la revisión visual queda **BLOCKED**. El merge requiere aprobación explícita del propietario conforme a `docs/DISENO.md`.
