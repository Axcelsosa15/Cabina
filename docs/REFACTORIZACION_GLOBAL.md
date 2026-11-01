# Cabina · refactorización global

Entrega local revisada el 1 de noviembre de 2026. La auditoría inicial del 31 de octubre inspeccionó las once pantallas vacías en navegador y el código de sus componentes. La revisión posterior añade escenarios sintéticos, escritorio de 1440 px y móvil de 390 px. Las observaciones originales se conservan en `AUDITORIA-Y-MAPA.md`; las capturas iniciales, en `auditoria/`.

## Base y alcance

Se trabajó sobre una copia aislada del proyecto existente. Se conservaron los cambios locales previos de personalización en el commit `1124b03`. La base remota comprobada al comenzar fue `fadc4f98`; la rama de esta entrega es `codex/global-interface`.

La aplicación sigue siendo HTML, CSS y JavaScript sin compilación de interfaz. Se conservaron sus once rutas, navegación, edición, importadores, almacenamiento, integración con Supabase y motor financiero. No se publicaron cambios. Los resultados de validación y sus límites están en `VALIDACION-GLOBAL.md`.

La integración con la principal del 1 de noviembre parte de `192a84b`: conserva su disciplina de proceso, límites históricos por operación, guía opcional, pausas, aislamiento de demo y drenaje de guardados pendientes. La guía y las pausas quedan en Ajustes → Preferencias; disciplina sigue visible en Resumen y Futuros. Se mantienen los filtros móviles y el dominio de publicación incorporados en esa principal. Las pruebas de estos recorridos usan las categorías y confirmaciones de los nuevos Ajustes.

## Problemas observados y solución aplicada

| Pantalla | Evidencia observada | Cambio aplicado |
|---|---|---|
| Resumen | Preparación posterior al registro en el orden del documento; duplicación de Añadir cuenta en el vacío; explicación larga sin sesiones. | Pre-sesión antes de registrar; un acceso para añadir cuenta; vacío breve. En las cuentas, registrar precede a gráficos e historial, que quedan bajo demanda. Los límites y el estado de riesgo siguen visibles; en móvil las cifras usan dos columnas cuando caben. Reglas desplegables, abiertas ante avisos, límites sin configurar o edición. |
| Futuros | Diez métricas con peso similar, varios gráficos y análisis profundo permanentes; nombres distintos para registrar. | Resultado neto, expectativa y drawdown primero; otras siete métricas bajo demanda. Gráficos secundarios y análisis cuantitativo desplegables. El aviso de muestra permanece visible. |
| Cuentas | Cuatro paneles sin datos repetían dos estados vacíos. | Un vacío con Añadir cuenta. La tabla aparece al existir cuentas y la revisión de cuentas quemadas al tener casos. Costes faltantes y base del neto permanecen visibles. |
| Inversiones | Diez métricas, cuatro gráficos y salud vacíos; dos accesos para añadir posición; guía extensa. | Posiciones y operaciones primero. Tres cifras principales y siete secundarias, análisis disponible cuando hay datos. Un acceso contextual de posición. Guía y explicación del coste de salir del plan bajo demanda; desviaciones calculadas siguen visibles. |
| Historial | Filtros y fechas con igual presencia; párrafo vacío que explicaba procedencias. | Búsqueda y filtros principales visibles; período y fechas desplegables; vacío breve. Se conservan tabla, exportación y apertura del registro original. |
| Rendimiento | Fórmulas y condiciones repetidas junto a métricas con igual rango. | Muestra, expectativa monetaria y drawdown primero. El catálogo de 160 estadísticas, indicadores restantes, fórmulas y operaciones del cálculo quedan bajo demanda; el catálogo conserva búsqueda, categorías y CSV. Muestra insuficiente, datos ausentes y resultados netos se mantienen explícitos. |
| Estrategias | Introducción y vacío repetían instrucciones; transferencia y creación competían. | Crear estrategia como acción principal, importar/exportar en Más acciones y contexto extenso desplegable. Condiciones, costes e invalidación siguen visibles. |
| Estudio | Biblioteca, filtros, métricas y recuperación activa competían con la revisión del trade; en móvil los cinco filtros desplazaban la operación. | Revisión primero, biblioteca después. Área amplia para captura y nota. Filtros con contador activo, preguntas orientativas y comparativa desplegables. Estados vacíos sin métricas ni flashcards inexistentes. Todos los campos, vínculos y documentos se conservan. |
| Oportunidades | La acción «Nueva forma» no nombraba la tarea; vacío extenso. | Añadir oportunidad, vacío breve y fundamento opcional. Riesgo, requisitos y condición de descarte visibles. |
| Calculadora | Fórmulas, interpretación y tabla anual ocupaban el primer nivel. | Supuestos y resultados visibles; explicación y tabla anual desplegables. Advertencia del escenario de trading, capital ausente y stop faltante visibles en su contexto. |
| Ajustes | Trece explicaciones y once tarjetas interiores mezclaban tareas. | Apariencia / Preferencias / Datos. Filas, atmósferas visuales, borrador con Cancelar y Aplicar, vista previa, diálogos de respaldo y ayuda buscable. |

Los cambios de texto se comprobaron sobre la interfaz renderizada: el estado de protocolo reescribía las etiquetas de Futuros y Resumen, y la barra móvil recortaba la nueva etiqueta larga. Ambos casos se corrigieron en su origen.

## Mapa de ubicación

No se fusionan ni eliminan pantallas. Este mapa desarrolla el que se presentó antes de la fase global:

| Tarea | Ubicación anterior | Ubicación final |
|---|---|---|
| Preparar sesión | Resumen: checklist después del registro; reglas y niveles laterales | Resumen: checklist antes de Sesión de hoy; reglas y niveles en el mismo espacio |
| Registrar operación | Rápido, Registrar y Nueva operación | Registrar operación en barra global, Resumen, Futuros e Inversiones; mismo acceso previo y contexto |
| Encontrar una operación | Historial, con todos los filtros permanentes | Historial: búsqueda, filtros y fechas bajo demanda |
| Revisar una operación | Estudio, junto a biblioteca y estadísticas | Estudio: revisión al inicio; capturas, nota, plan, lección y estado |
| Investigar | Biblioteca de Estudio, antes de la revisión | Biblioteca de Estudio, en su propia sección posterior |
| Analizar futuros | Futuros y Rendimiento | Mismos destinos: cifras prioritarias y detalle opcional |
| Analizar cuentas | Cuentas: paneles permanentes, incluso vacíos | Cuentas: resumen y tabla; cuentas quemadas bajo demanda |
| Gestionar inversiones | Métricas y gráficos antes de posiciones | Inversiones: operaciones y posiciones antes del análisis ampliado |
| Organizar estrategias y oportunidades | Estrategias / Oportunidades | Mismas pantallas y formularios; instrucciones secundarias opcionales |
| Calcular escenarios | Calculadora: resultados, explicación y tabla | Calculadora: resultado; explicación y tabla bajo demanda |
| Personalizar apariencia | Ajustes y controles dispersos | Ajustes → Apariencia; Vista conserva distribución por página y comparte la densidad |
| Idioma y demo | Ajustes: tarjetas permanentes | Ajustes → Preferencias |
| Respaldar y restaurar | Ajustes: múltiples opciones permanentes | Ajustes → Datos → diálogo de la tarea |

## Sistema compartido

Se ampliaron las primitivas existentes, sin añadir otra hoja visual: escala de lectura, colores semánticos, espacios y densidades; controles y áreas táctiles; encabezados; estados vacíos; avisos; métricas principales/secundarias; filtros; desplegables; acciones secundarias y diálogos. La fuente de interfaz se aplica a los controles y la monoespaciada se reserva principalmente para cifras e instrumentos.

Se conservan las claves heredadas de Vista para módulos y columnas, incluso tras reordenar Inversiones y Estudio. El plegado anterior se adapta a los detalles nativos, manteniendo accesible su apertura.

Las atmósferas Calma, Estudio, Precisión y Noche usan el mismo sistema. Tema claro/oscuro/sistema, fuente, tamaño, densidad y acento se conservan al recargar. El texto grande también se respeta en móvil. La densidad cambia espaciado, sin empequeñecer la letra. Los campos mantienen el tamaño móvil que evita el zoom involuntario de Safari.

## Conservación y límites

Abrir o cerrar detalles no modifica registros. Cambiar la presentación no cambia cuentas, operaciones, documentos ni escenarios. Se mantuvieron los cálculos, las comisiones, los filtros y los identificadores de controles y rutas. Los módulos del motor, migraciones Supabase, trabajador sin conexión y flujos de publicación no se modificaron.

Las capturas con datos son demostraciones sintéticas identificadas como tales, no información personal ni rentabilidades reales. La revisión local y los dobles de la suite no verifican una sesión real de Supabase, sus políticas en producción ni archivos de un bróker real.
