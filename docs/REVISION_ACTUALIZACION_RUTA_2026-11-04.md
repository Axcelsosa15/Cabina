# Bucle de actualizaciones · 4 de noviembre de 2026

Durante la comprobación de la PR #137, los archivos públicos coincidían con los
validados y el navegador cargaba los controles nuevos. Sin embargo, Buscar
actualizaciones volvía a anunciar `index.html` después de pulsar Actualizar y
recargar dos veces.

## Causa y corrección

El navegador abría `/Cabina/`. El trabajador de servicio renovaba la caché de esa
URL, pero el comparador leía `/Cabina/index.html`, que conservaba la copia del
primer arranque. Abrir directamente `index.html` también podía dejar antigua la
entrada corta usada al volver sin conexión.

Al navegar a cualquiera de las dos entradas se guardan ambas copias con el mismo
HTML, esperando a que termine la escritura. Las páginas legales mantienen sus
propias entradas y nunca sustituyen la aplicación. Un fallo al guardar la caché
no impide entregar la respuesta de red. Los datos, sesión y capturas no cambian;
la exclusión de Supabase y de orígenes externos permanece igual.

## Evidencia

1. Web publicada: aviso repetido de `index.html` tras dos recargas, con los nuevos
   controles del visor presentes y los bytes públicos idénticos a los validados.
2. `test/actualizacion-inicio.mjs`: servidor mutable bajo `/Cabina/`, dos cambios
   consecutivos de HTML y posterior navegación explícita a `index.html`.
3. Contra el trabajador anterior, cuatro de ocho comprobaciones fallan. Con la
   corrección pasan las ocho, conservando los registros locales y evitando que
   Privacidad reemplace la aplicación en caché.
4. Pasan también `actualizacion` y `pwa`: 69 aserciones en tres suites. La
   compuerta completa se ejecuta antes de integrar.

Las pruebas usan datos sintéticos. La instalación y persistencia del sistema
operativo en un teléfono físico siguen fuera de esta verificación.
