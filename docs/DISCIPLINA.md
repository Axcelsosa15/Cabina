# Disciplina de proceso · primera entrega

Cabina hace visible la preparación y la revisión, sin premiar ganancias, número
de operaciones, tamaño ni riesgo asumido. Los puntos y las estrellas describen
datos registrados; no demuestran habilidad, cumplimiento ante una firma ni
rentabilidad futura. Se mantiene el aviso de que Cabina no es asesoría financiera.

## Contrato de la primera entrega

- **Estrellas por operación cerrada:** valoración derivada de evidencia de proceso,
  con explicación y cobertura visibles. Un dato desconocido no cuenta como un
  incumplimiento ni como un paso correcto. Una operación sin evidencia suficiente
  queda sin calificación, en lugar de recibir cinco estrellas por defecto.
  Importaciones, registros rápidos y datos antiguos conservan esa incertidumbre.
- **Racha de checklist:** se apoya en pre-sesiones guardadas y completas. Se usa
  la cantidad real de pasos de cada snapshot, no un número fijo. La lista actual
  tiene seis pasos por defecto y es editable; cambiarla hoy no modifica el pasado.
- **Racha de journal:** se apoya en reflexión registrada. Cerrar más operaciones
  o escribir repetidamente el mismo día no multiplica los puntos del día.
- **Racha de no operar por falta de edge:** requiere una decisión explícita
  `no_edge` y ausencia de operaciones en esa fecha. Un día vacío no es evidencia
  de esa decisión. Si posteriormente se registra una operación de ese día,
  se recalcula el reconocimiento. También lo impiden operaciones declaradas en
  el contador manual o un resultado manual, incluso cero: ese resultado no
  demuestra que se permaneciera fuera del mercado.
- **XP de proceso:** máximo de **20 puntos por día**, recalculado desde los datos.
  No se acumulan puntos con cada clic ni se asignan por P&L. Editar o borrar
  evidencia cambia el cálculo; no existe un saldo de premios separado que pueda
  quedar desincronizado del registro.
- **Progreso inicial:** un nivel por cada 100 XP y tres hitos de proceso:
  diez días de checklist, diez cierres con reflexión y cinco días sin edge
  respetados. Describen el registro; no son una certificación de capacidad.
- **Tarjeta para compartir:** imagen generada a petición, con vista previa y sólo
  agregados de proceso. Excluye P&L, saldos, nombres de cuenta, IDs, correos,
  notas, instrumentos y capturas. No publica nada automáticamente ni crea una
  página pública del usuario. Antes de compartir, la persona revisa la imagen;
  descargarla es la alternativa cuando el dispositivo no permite compartirla.
- **Recap semanal:** días de proceso, mejor día según XP de proceso, criterio
  incumplido más frecuente y rachas. Empieza el lunes de la fecha de Nueva York
  e incluye sólo fechas transcurridas. Sin XP, no se elige un mejor día; sin
  fallos documentados, no se inventa un error. Se comparte con la misma imagen
  y los mismos límites de privacidad. En un empate de XP, el mejor día mostrado
  es el más reciente; no se compara rentabilidad.

La puntuación contiene cinco criterios de 20 puntos: preparación guardada antes
de la entrada, stop coherente e invalidación escrita, condiciones de entrada,
reglas registradas al operar y revisión del plan. Cada criterio es correcto,
incumplido, desconocido o **no aplicable**. La cobertura expresa cuántos de los
criterios *aplicables* se conocen; las estrellas aparecen sólo con todos ellos
conocidos, una operación cerrada y una fuente verificable.

**No aplicable no es desconocido.** La app prepara cinco de las ocho franjas con
lista propia; pre-mercado, cierre y pausa no tienen. Una operación entrada en
esas tres no tiene preparación previa que comprobar, así que su criterio sale no
aplicable, pesa 0 y sale del denominador: un registro impecable puntúa 100 sobre
80 puntos observables, no 80 sobre 100. Antes pedía una pre-sesión que el usuario
no puede guardar, y cualquier operación entre 07:00–08:30, 16:00–17:00 o
17:00–20:00 ET quedaba sin puntuación para siempre por una franja que no eligió.
Un no aplicable no regala nada: con cuatro criterios, fallar uno da 75. La presencia actual de un stop o una
invalidación escrita no demuestra por sí sola que existieran antes de operar.

`processRules` congela límites al crear manualmente una operación de hoy, cuando
hay una cuenta con límites configurados. Registra máximo de contratos,
instrumentos y ventana, y conserva una evaluación desfavorable del motor cuando
corresponde. Esa evaluación describe los límites configurados al registrar;
no verifica todos los requisitos del bróker ni demuestra que el registro
precediera a la entrada. Un trade antiguo sin snapshot conserva el estado
desconocido y no se completa retrospectivamente con las reglas actuales.
Al editar la fecha o la cuenta de una operación se invalida ese snapshot: sus
límites pertenecían al contexto original. Editar sólo la revisión o la salida
conserva los límites registrados, sin reconstruirlos con los de hoy.

El XP diario se reparte en 10 puntos por checklist guardada completa, 5 por día
cerrado con reflexión y 5 por decisión `no_edge` explícita y fechada sin
operaciones. Varias pre-sesiones o notas en una fecha no multiplican ese XP.
Para las rachas, hoy sólo cuenta después de cerrar el día; un fin de semana sin
actividad se omite, mientras que un hueco laborable rompe la continuidad.

Las rachas reconocen continuidad de proceso, no una obligación de operar. Los
días de descanso no generan urgencia, avisos de pérdida de racha ni operaciones
ficticias. Cada cifra muestra su período y el significado de su evidencia:
**hecho registrado**, **inferencia** o, si procede, **especulación**. La valoración
de disciplina es una inferencia sobre el registro, no una observación del bróker.

## Integración y preservación

`discipline.js` concentra el cálculo de proceso. La interfaz consume el resultado
sin duplicar fórmulas monetarias ni cambiar QuantEngine. Las estrellas se calculan
con las señales y reglas de la operación; el panel de proceso amplía el espacio
existente de rachas y disciplina. Los estados vacíos explican qué evidencia falta.

Para conservar toda la historia, se combinan los documentos de `state.dias` con
`state.day`, dando prioridad a la versión más reciente. `state.history` es un
resumen de catorce días y no sirve como fuente completa de rachas reales. El demo
usa su `state.history` sintético y el día de ejemplo, junto con sus operaciones
inventadas; sigue sin escribir en el navegador ni en Supabase. Sus indicadores
de carga se resuelven con esos datos, sin esperar suscripciones de la cuenta.

El panel debe actualizarse al cambiar operaciones, reglas, documentos de días,
pre-sesiones, notas y decisiones de no operar, también cuando esos cambios
llegan desde otro dispositivo. Se reutilizan las suscripciones, el fanout de
renders y el guardado con sello de Cabina; no se añade una fuente paralela de
historial ni una tabla pública de logros.

La imagen compartida se construye a partir de una lista permitida de agregados,
no de una captura del panel ni de una copia del objeto de usuario. Debe ser
posible comprobar su privacidad mirando el archivo generado y los datos usados.

## Capacidades que Cabina ya tiene

- PWA instalable y casco disponible sin conexión; el trabajador de servicio no
  almacena respuestas de Supabase, sesiones ni capturas privadas.
- Tema claro, oscuro o automático, acento configurable y soporte para reducir
  movimiento. Las nuevas vistas reutilizan los mismos tokens y estados accesibles.
- Cambio inmediato español/inglés. La cobertura existente es parcial; los textos
  dinámicos nuevos se traducen en su propio render y no alteran datos del usuario.
- Demo aislado con datos inventados, bienvenida y alta de cuenta. Todavía no es
  un recorrido guiado de dos minutos.
- Permiso para operar según checklist, horario y reglas, más diario, pre-sesiones
  históricas y clasificación de errores. El progreso se construye sobre ellos.

## Validación esperada

Comprobar puntuaciones con evidencia completa, parcial y ausente; igualdad entre
ganancia y pérdida cuando el proceso registrado es igual; ausencia de premios
por sobreoperar; límite de XP; edición, borrado y recarga sin premios duplicados;
rachas entre fechas y decisiones `no_edge` contradichas por una operación.
Verificar también actualización remota, aislamiento del demo, ambos idiomas,
contraste, teclado, móvil y contenido de la imagen exportada.

Se reutilizan las pruebas de errores, reglas, historial, sincronización, idiomas,
apariencia, contraste, layout y PWA. Los resultados efectivamente ejecutados se
informan con la entrega; este documento por sí solo no certifica despliegue ni
validación completa.

## Próximas entregas

- **Retos entre amigos:** pendientes de diseñar invitaciones, consentimiento,
  visibilidad, salida y borrado, además de políticas RLS y pruebas de aislamiento.
  No se crea una clasificación pública ni se comparten datos de trading en esta
  primera entrega.
- **Recordatorios de descanso y notificaciones:** pendientes; mínimos, opcionales
  y configurables, sin urgencia artificial. No se solicitan permisos de push al
  entrar ni se promete que la app funcionará en segundo plano como un servicio.
- **Onboarding y plantillas de prop firms:** ampliar el demo existente con un
  recorrido breve. Las reglas deben contrastarse con el sitio oficial y mostrar
  fecha y enlace de verificación; ninguna plantilla sustituye el contrato real.
- **Ampliación de logros y niveles:** sumar sólo hitos respaldados por el registro
  y explicar cuándo la evidencia es incompleta. Alcanzar una muestra no demuestra
  un edge.

## Referencia de producto

La [guía oficial de gamificación de Tradris](https://www.tradris.com/docs/gamification-path)
describe puntos de disciplina, estrellas, rachas, niveles e insignias. Se consultó
el 31 de octubre de 2026 como referencia de producto. Su sistema incluye algunos
premios por resultados; la propuesta de Cabina mantiene el XP limitado a proceso
y hace explícita la evidencia desconocida. No se adopta una promesa de mejora
de rentabilidad ni se atribuye este diseño a una guía regulatoria no verificada.
