# Etiqueta previa a Asia · 4 de noviembre de 2026

En producción, a las 6:08 PM ET la barra mostraba «Pausa diaria · reabre a las
6 PM ET». La tabla interna mantenía esa misma etiqueta desde las 5 hasta las
8 PM, cuando comienza Asia: después de las 6 el aviso ya anunciaba una hora
pasada y no describía la franja que usa el reloj.

La etiqueta pasa a «Antes de Asia» y, en inglés, «Before Asia». Se aplica tanto
a la barra como a Sesión de hoy y se incorpora el idioma a la identidad del
texto cacheado. La tabla de horas, los identificadores, las clases de estado y
los cálculos del protocolo se conservan.

`test/transicion-asia.mjs` fija las 5:30, 6:30, 7:59 y 8 PM ET, más una revisión
en inglés. Sus 14 comprobaciones vigilan la etiqueta, su coincidencia entre los
dos lugares y la siguiente sesión de la cuenta atrás. Reproduce cuatro fallos
con la etiqueta anterior.

Esta corrección describe la franja del producto; no cambia horarios de mercado
ni reglas de entrada. Se revisa junto con la validación de precios spot en la
compuerta completa antes de integrar.
