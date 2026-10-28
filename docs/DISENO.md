# Sistema visual de Cabina — v3

## Alcance
Capa de presentación aditiva inspirada en los principios de Bitácora: jerarquía sobria, superficies planas, espacio consistente, números tabulares, controles claros y estados de foco visibles. No se importa código de `trading-journal2`.

## Decisiones
- Mantener la aplicación sin framework ni build adicional.
- Mantener los nueve destinos actuales y sus identificadores.
- Adoptar la paleta clara de Bitácora: papel cálido `#FAF8F4`, tinta `#16181C`, verde `#16915B`, rojo `#D6483B`, azul `#3D6FB0`, superficies blancas y líneas `#E7E4DC`.
- Mantener intactos los mecanismos de preferencias y persistencia; el sistema visual establece una presentación clara coherente en Cabina.
- Centralizar los valores nuevos en tokens `--ds-*` (superficies, líneas, texto, semántica, espaciado, radios, foco y movimiento).
- Reducir sombras/gradientes redundantes; usar verde para resultados positivos, rojo para pérdidas y azul para foco e información.
- Preservar el scroll horizontal intencional de tablas, evitando que se propague al viewport.
- Mejorar tamaños táctiles y legibilidad de controles en móvil; conservar los patrones existentes de navegación móvil.
- Respetar `prefers-reduced-motion`.

## Límites de esta iteración
Es un primer pase global de sistema visual, no la reescritura funcional de cada pantalla. Los flujos complejos (importación, cuentas, inversión, capturas, conflictos y sincronización) requieren pruebas de comportamiento y revisión visual por pestaña antes de considerar el rediseño completo.
