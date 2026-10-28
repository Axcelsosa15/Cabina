# Sistema visual de Cabina — v3

## Alcance
Capa de presentación aditiva inspirada en los principios de Bitácora: jerarquía sobria, superficies planas, espacio consistente, números tabulares, controles claros y estados de foco visibles. No se importa código de `trading-journal2`.

## Decisiones
- Mantener la aplicación sin framework ni build adicional.
- Mantener los nueve destinos actuales y sus identificadores.
- Mantener el tema oscuro existente y sus preferencias; esta capa no cambia el mecanismo de tema.
- Centralizar los valores nuevos en tokens `--ds-*` (superficies, líneas, texto, semántica, espaciado, radios, foco y movimiento).
- Reducir sombras/gradientes de paneles redundantes y mantener el color semántico para datos y estados.
- Preservar el scroll horizontal intencional de tablas, evitando que se propague al viewport.
- Mejorar tamaños táctiles y legibilidad de controles en móvil; conservar los patrones existentes de navegación móvil.
- Respetar `prefers-reduced-motion`.

## Límites de esta iteración
Es un primer pase global de sistema visual, no la reescritura funcional de cada pantalla. Los flujos complejos (importación, cuentas, inversión, capturas, conflictos y sincronización) requieren pruebas de comportamiento y revisión visual por pestaña antes de considerar el rediseño completo.
