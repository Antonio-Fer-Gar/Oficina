# Oficina nter para omp — diseño propuesto

Estado: diseño base aprobado el 2026-10-28; revisión solicitada por el usuario: abrir la consola original al pulsar avisos y añadir historial/resumen semanal. Método de ejecución elegido: directamente en esta sesión. Esta revisión sustituye el antiguo puente de respuestas Collab por navegación local a terminales.

## 1. Intención y uso

Aplicación Windows que representa las sesiones y subagentes de omp mediante una oficina cozy pixel art 2D. El usuario seguirá abriendo y usando omp en sus terminales. La oficina observa esas sesiones y ofrece controles, sin sustituir sus terminales ni lanzar copias de sus historiales.

La franja permitirá reconocer de un vistazo quién trabaja, en qué proyecto, quién está libre y qué agente necesita una decisión humana.

## 2. Requisitos acordados

- Franja horizontal inferior, aproximadamente un tercio de la pantalla útil. La altura del último boceto fue aceptada; se conservará esa proporción inicial, no un tamaño fijo en píxeles que dependa del monitor de prueba.
- Ventana siempre encima de otras ventanas cuando es visible. Minimizable a voluntad, con icono propio en la barra de tareas.
- Minimizar o cerrar la oficina no debe detener ni cerrar omp. Cerrar termina la oficina y su conexión, no las sesiones anfitrionas.
- Estética original inspirada en la presentación 2D cozy de Rusty’s Retirement; no reutilizar sus recursos gráficos.
- Suelo de madera gris, mesas blancas y sillas grises. Logo nter proporcionado por el usuario, en camisetas y oficina. Sin carteles de zonas.
- Usuario: golden retriever humanizado, camiseta verde salvia exclusiva.
- Agentes principales: gatos humanizados de distintos colores, camiseta azul suave.
- Subagentes/task: ratones humanizados, camiseta blanco crema.
- Todos los personajes tienen brazos, piernas y logo nter. Todos caminan a la misma velocidad ligera; no depende del proveedor o modelo.
- Gatos en posición central entre sus ratones y el golden. Descanso en un lateral.
- Una mesa por proyecto. Sesiones distintas del mismo proyecto comparten mesa y mantienen identidades e historiales separados.
- Al abrir una terminal incorporada con un proyecto nuevo, su gato recoge una mesa de una pila en la sala de descanso y la arrastra hasta el puesto. Una nueva sesión del mismo proyecto se une a la mesa existente y no trae otra.
- Conforme aumenta el número de proyectos, mesas y personajes reducen su tamaño juntos para caber en la misma ventanita, sin aumentar la altura.
- Una silla por mesa. El primero que llegue la ocupa; los demás trabajan de pie cerca. Al marcharse el ocupante, toma la silla el que lleve más tiempo esperando.
- Al terminar el trabajo activo, el personaje va a por café. Estar de pie esperando silla no significa estar ocioso: puede seguir trabajando.
- Ficha seleccionable: agente/sesión, modelo, proyecto, tarea/actividad actual, envío de tarea/mensaje y selección de modelo.
- El ratón consulta a su gato responsable. Solo si el gato necesita una decisión humana acude al golden.
- Una petición humana real provoca el sonido de Windows ya probado y aceptado, una exclamación grande y persistente, y atención/parpadeo en la barra de tareas. No restaurar ventanas automáticamente. Al pulsar el aviso se activa la consola original de la sesión que pregunta, donde el usuario responde en omp; no se presenta un formulario de autorización en la oficina ni se abre una segunda copia del historial.
- Al cerrar las consolas se conserva un catálogo local de proyecto, conversación y carpeta, vinculado al archivo de conversación que guarda omp. Cerrar la consola no elimina ese historial.
- El gato visita al golden cada vez que se abre la primera consola de omp y no hay ninguna otra abierta: transición confirmada de cero a una consola principal, aunque ocurra varias veces en el mismo día. Los subagentes no cuentan como consolas. El historial incluye los últimos siete días, ordenado de más reciente a más antiguo y sin duplicar conversaciones al reabrirlas.

## 3. Alcance y antiobjetivos

Incluye observación y control reales de las sesiones omp del usuario que incorporen el puente. Debe poder incorporar todas sus sesiones locales, no únicamente las creadas por la oficina. La interfaz distinguirá conectado, desconectado y sin puente: nunca representará una sesión no observable como si estuviera trabajando o tomando café.

No incluye controlar otros programas de agentes, ejecutar comandos a partir de archivos de historial, publicar un panel remoto propio, sincronización entre ordenadores ni modificar el núcleo de omp.

No se fingirán decisiones del modelo a partir de animaciones. La oficina no inventa consultas, no llama modelos para mover personajes y no concede permisos automáticamente. Tampoco sustituye las herramientas `ask` o la política de aprobación de omp.

## 4. Enfoques considerados y elección

### A. Conservar terminales: extensión precargada y puente local

Elegido por el usuario al responder «En omp». La petición posterior cambia el modo de responder: la oficina activa la consola original y las decisiones se contestan dentro de omp.

- Extensión dentro de omp: identidad, parentesco, estado, actividad, destino de consola y acciones sobre la instancia de sesión correspondiente.
- Puente local autenticado entre extensión y oficina: solo mensajes y acciones explícitas permitidas, nunca ejecución arbitraria o emisión genérica del bus.
- Activación de la ventana/pestaña original mediante identificadores de terminal verificados. No iniciar otro omp sobre una conversación que ya está abierta.
- Collab deja de ser necesario para este recorrido y no se activará automáticamente. La autorización previa para usarlo queda sin aplicar porque el requisito que lo justificaba se ha sustituido.
- Las terminales ya abiertas sin extensión requieren reinicio/reanudación seguros cuando el usuario lo decida. El puente no inyecta código en procesos arbitrarios.

### B. La oficina controla procesos propios por RPC-UI

No elegido. Es más directo para integrar estado y decisiones, pero obliga a abrir/reanudar las sesiones desde la oficina. RPC no se adjunta a otra terminal ya ejecutándose.

### C. Solo leer procesos o historiales

Descartado: no ofrece estado vivo fiable, envío de tareas, modelos ni respuestas a permisos. Un archivo existente no demuestra que haya un agente activo.

## 5. Decisiones técnicas propuestas por el asistente

Estas son decisiones del asistente, no preferencias tecnológicas expresadas por el usuario:

- Escritorio: Electron con un renderizador Canvas 2D y TypeScript. Reutiliza el tipo de dibujo del boceto y dispone de minimizar, always-on-top y solicitud de atención nativos. El coste es un paquete mayor que una aplicación nativa; evita construir una capa Win32/WebView ad hoc.
- Sin motor de videojuegos ni biblioteca de UI salvo necesidad concreta. DOM para fichas y formularios; Canvas para escena y personajes.
- Extensión TypeScript cargada por el mecanismo público de omp, inicialmente compatible con la versión instalada 18.13.2. No parchear el ejecutable ni editar sus archivos de sesión.
- Un proceso principal Electron gestiona ventana, conexión y secretos. El renderizador aislado solo recibe datos necesarios y usa acciones con argumentos validados. Sin Node en el renderizador, sin contenido remoto con privilegios.
- Registro/IPC local mediante named pipes Windows con protección del usuario actual y credencial aleatoria. Extensión y app negocian versión, instancia y sesión. Los secretos no se transportan en URLs del renderizador ni se guardan en documentos.
- El puente seleccionado no necesita relay ni cliente Collab: las respuestas se hacen en las terminales originales. Si la lectura de metadatos persistentes de omp requiere Bun, usar un único auxiliar empaquetado por stdio con el proceso principal, sin alojar agentes ni sustituir terminales.
- No introducir un servidor de terceros adicional ni un servicio Windows permanente.

## 6. Incorporación y vida útil

1. La aplicación muestra el estado del puente y las instrucciones de incorporación antes de instalarlo.
2. El usuario ha aceptado carga automática del puente. Su petición posterior sustituye las respuestas remotas por abrir la consola original: no habilitar Collab ni publicar salas, aunque antes aceptase ese enfoque. No se ha cambiado configuración todavía. Presentar el alcance exacto de instalación y autorización de pruebas con modelo antes de aplicarlos; nunca reiniciar terminales existentes sin permiso.
3. Las sesiones incorporadas se registran con identificadores de instancia, sesión, agente y padre. El proyecto se obtiene del directorio de trabajo comunicado por omp.
4. La app descubre las instancias registradas y verifica la conexión viva. No deduce número de agentes a partir del número de procesos `omp.exe`.
5. Si una sesión pierde la conexión, se marca desconocida/desconectada; nunca va automáticamente a café por falta de señal.
6. Al cerrar una sesión se retira su personaje y se libera su puesto. Una desconexión de la oficina no equivale a cerrar la sesión.
7. La oficina puede cerrarse/reabrirse sin detener trabajo. La extensión no debe bloquear omp cuando la app no está conectada.
8. El puente se carga en todas las nuevas sesiones interactivas de omp y se registra sin activación manual por terminal. La oficina asocia cada sesión al proyecto correspondiente y no crea una mesa extra para sesiones del mismo directorio. La configuración automática no incluye Collab.

Decisión del asistente: las sesiones que ya están abiertas las cierra y reanuda el usuario, cuando termine o interrumpa conscientemente su trabajo. La oficina solo informa qué sesión carece del puente y cómo incorporarla; no cierra terminales, no envía pulsaciones y no reinicia trabajo por su cuenta. El alcance sigue incluyendo todas las sesiones que el usuario incorpore, no la inyección en procesos arbitrarios.

## 7. Identidad, agrupación y controles

### Identidad

Cada gato representa una sesión/agente principal real; cada ratón representa un subagente real. Se conserva el parentesco explícito de omp. Las sesiones no se fusionan aunque compartan mesa.

Proyecto = directorio de trabajo canónico comunicado por el anfitrión, normalizado según Windows. No fusionar repositorios por compartir nombre de carpeta. Worktrees/directorios distintos permanecen distintos salvo que el usuario solicite otra regla.

### Mensajes y modelos

- Seleccionar personaje muestra el destino exacto antes de enviar.
- Si el agente está trabajando, el mensaje se envía con la semántica soportada de steering/cola, sin interrumpirlo a escondidas. La ficha confirma si se entregó o encoló.
- Modelo: listar los modelos realmente disponibles en esa instancia. Incluir todos los proveedores configurados; la restricción Codex/Claude se descartó al eliminar velocidades por modelo.
- La acción se dirige a la instancia seleccionada. Cambiar el modelo de un gato no cambia retroactivamente el de sus ratones.
- [INFERENCE] Cambiar un ratón ya activo es viable mediante la instancia precargada de extensión de ese hijo y `setModel`; debe demostrarse end-to-end. No hay un comando RPC público `set_subagent_model` verificado.
- Aplicar cambios de modelo en un punto seguro soportado por omp; nunca abortar una llamada activa solo para actualizar el selector. Mostrar pendiente, efectivo o rechazado, sin prometer que cambia una llamada ya enviada.

## 8. Estado de oficina y turnos

Separar estado de ejecución de posición visual. La integración comunica hechos; la escena deriva destinos. Ningún desplazamiento realiza acciones sobre modelos.

Estados visibles: trabajando, consultando al padre, esperando decisión humana, libre/café, desconectado y error. La finalización considera cola, subagentes y trabajo asíncrono; `busy: false` por sí solo no basta.

Mapeo propuesto por el asistente: `running` representa actividad; `idle` con colas y trabajo asíncrono agotados lleva al café mientras la sesión siga viva. `parked` o cierre confirmado retira al personaje; `aborted` muestra error/detenido hasta reanudar o archivar. Una pérdida de conexión libera su reserva visual de silla y conserva un registro gris de estado desconocido, sin declararlo terminado ni borrarlo por un temporizador. Al reconectar se reconcilia el estado real y, si vuelve a la mesa, entra en cola sin desplazar al ocupante. La cola conserva su orden durante actualizaciones ordinarias, no se reconstruye en cada repintado.

- Cada participante activo entra en la cola de su proyecto con orden estable de llegada a la mesa.
- Al quedar la silla libre, reservarla para el primero que esté esperando. No pueden competir dos personajes por la misma silla durante una animación.
- Un nuevo participante no desplaza al que ya está sentado. La cola no altera la prioridad de trabajo de omp.
- Marcharse a café, terminar/cerrar o ir a consultar libera la silla. Una vuelta posterior entra al final de la cola.
- No restaurar una silla a un agente simplemente porque era suya antes de una consulta.
- Confirmado por el usuario: tanto gatos como ratones que estén trabajando en un proyecto pueden ocupar su silla. La especie no concede prioridad; se respeta llegada y espera. Los participantes libres no entran en cola. Los ratones siguen próximos a su gato y la mesa conserva la composición central de los gatos.
- Si falta espacio, recalcular la distribución y reducir uniformemente mesas y personajes, conservando proporciones, altura de ventana y acceso a avisos. El escalado cambia la presentación, no el ritmo ni el trabajo de los modelos. No se sustituye por desplazamiento horizontal sin aprobación del usuario. El punto en que la reducción resulta ilegible se validará con el boceto y será una limitación visible, no un límite de proyectos oculto.
- La creación de una mesa pertenece al proyecto, no a cada evento de registro. Reservar un único transportista por proyecto para evitar mesas duplicadas si dos terminales se abren a la vez. La animación no retrasa ni bloquea trabajo de omp: los hechos de sesión se registran aunque el gato siga arrastrando la mesa.

## 9. Preguntas, permisos y escalado

Hay dos recorridos distintos:

1. **Consulta de trabajo entre subagente y agente.** Solo se anima cuando existe una consulta/mensaje real. El ratón se acerca al gato, el trabajo sigue la semántica nativa de omp y vuelve cuando se resuelve. No se fuerza una consulta ficticia para producir animación.
2. **Decisión o permiso humano real.** Se conserva su asociación con la sesión que espera. Si procede de un ratón, el gato padre hace de portavoz visual; la oficina no concede ni responde el permiso. Pulsar el aviso activa la consola original de la sesión responsable.

La interacción y resolución siguen en omp. Si el usuario responde o cancela allí, el estado de oficina se actualiza y retira el aviso cuando recibe la confirmación. No enviar un mensaje «sí» en nombre del usuario ni crear formularios remotos ficticios. Una falta de conexión no se interpreta como permiso resuelto.

Los task hijos se crean normalmente sin UI. Por tanto, consulta al padre y decisión humana siguen siendo recorridos distintos: solo se avisa al golden cuando hay una solicitud humana real en una sesión con consola. Si un hijo falla por una política incompatible con su ejecución headless, mostrar el error y su consola padre; no inventar una aprobación que omp no ofrece. El antiguo bloqueo de contestar remotamente aprobaciones nativas de hijos deja de aplicar al alcance elegido.

Decisión del asistente: activar una terminal existente exige verificar proceso/instancia y pestaña, no solo coincidir por título genérico de proyecto. En Windows Terminal, registrar identidad de pestaña/sesión al iniciar y comprobar el mecanismo de selección mediante CLI o UI Automation. Si ya se cerró, mostrar la conversación guardada con acción explícita de reanudar; nunca abrir otra ejecución como fallback silencioso.

### Avisos

- Sonido elegido: archivo del evento predeterminado de Windows usado en el boceto, que el usuario escuchó y aceptó. No se afirma que sea un archivo interno de omp.
- Un aviso sonoro por nueva solicitud humana; no repetirlo por repintados, reconexiones o copias del mismo evento.
- Botón grande «! Necesito tu decisión · Abrir consola» sobre el portavoz; mantiene indicador hasta que omp confirme resolución/cancelación.
- Pedir atención de la ventana en la barra de tareas sin restaurarla ni tomar foco. Windows decide el patrón/duración exactos de parpadeo según sus políticas.
- Respetar reducción de movimiento para el pulso. Ofrecer silencio en el control de sonido de la oficina.
- Si hay varias peticiones, mostrar contador y lista por agente/proyecto. Una no puede ocultar ni sustituir a otra.

## 10. Límites y seguridad

- Extensiones ejecutan código con los permisos de omp. El puente se limita al usuario local y a instancias registradas.
- No se crean ni almacenan enlaces de Collab para la conexión local elegida. La activación de terminal se limita a procesos/pestañas registrados del usuario y no ejecuta instrucciones derivadas de títulos de conversación.
- Validar identidad/versión/origen, acciones, tamaños y solicitudes pendientes. Rechazar instancia antigua, destino inexistente o comando no permitido.
- Guardar un catálogo local de metadatos y referencias a archivos de sesión, no una copia adicional de las transcripciones ni prompts completos. Las conversaciones siguen persistidas por omp. Si una sesión se ejecuta explícitamente sin persistencia, indicar «sin historial guardado» en vez de fingir que existe una conversación recuperable. No persistir argumentos sensibles o credenciales.
- El renderizador no puede ejecutar shell, leer credenciales o emitir mensajes de bus genéricos.
- La animación se pausa o reduce al minimizar. Las conexiones y avisos permanecen activos. No solicitar un turno de modelo para mantener la escena.

## 11. Evidencia y verificaciones requeridas

Hechos ya comprobados: [smoke local](../../research/omp-local-smoke.md), [protocolos](../../research/omp-control-protocols.md), [observabilidad](../../research/omp-agent-observability.md). El smoke RPC prueba el transporte de un proceso propio, no el puente seleccionado. Los HTML de `.superpowers/brainstorm/office-design/content/` son bocetos, no una implementación productiva.

Antes de afirmar integración completa, demostrar con sesiones reales y controladas:

1. Dos sesiones iniciadas en terminal, mismo proyecto: dos gatos, una mesa; directorio distinto: otra mesa.
2. Un task real crea su ratón con padre y modelo correctos; su finalización va a café y no convierte una desconexión en descanso.
3. Enviar una tarea/mensaje al gato correcto y a un ratón vivo; observar el destino real, sin ecos de mocks.
4. Cambio de modelo del gato y del ratón seleccionado, o rechazo/pending auténtico si no existe punto seguro; no cambiar al resto.
5. Consulta de subagente al padre resuelta sin intervención: sin sonido al usuario. Petición humana real: portavoz gato, sonido único y aviso que selecciona la consola/pestaña original exacta; la respuesta se realiza allí.
6. Probar dos sesiones del mismo proyecto preguntando a la vez, respuesta/cancelación desde terminal, desconexión, consola ya cerrada y selección de pestaña en Windows Terminal sin iniciar otro omp ni ejecutar texto de títulos.
7. Una silla exclusiva, turnos FIFO, salida y reentrada, salida durante animación y desaparición de participante.
8. Ventana Windows siempre encima, minimizar/restaurar, icono y solicitud de atención sin tomar foco; cerrar la oficina deja omp trabajando.
9. Escalado de pantalla, varios monitores y muchas mesas sin tapar la zona útil adicionalmente.
10. Cerrar una consola conserva proyecto, conversación, carpeta y referencia al historial. Cerrar todas y abrir una nueva provoca una nueva visita, aunque sea el mismo día; abrir una segunda consola, pasar de dos a una o registrar un subagente no la provoca. El listado incluye los últimos siete días en orden de última actividad descendente. Probar límites de siete días, reconexión, sesión efímera y archivo ausente.

No instalar el puente en todas las sesiones del usuario ni habilitar publicación de control para estas pruebas sin autorización. Cualquier llamada de modelo real para probar tareas se explicará antes de ejecutarla.

### Historial y resumen al abrir la primera consola

- Catálogo local persistente por identificador de conversación y perfil de omp: nombre del proyecto, título de conversación, carpeta canónica, archivo de sesión y fechas de inicio/última actividad/cierre confirmado.
- El título procede del nombre de sesión de omp; si no hay título, usar el identificador visible de conversación, sin gastar llamadas de modelo para inventarlo. No confundir una reapertura con otra conversación ni usar el PID como ID histórico.
- Guardar metadatos mientras la sesión está viva; no depender de que una consola cerrada abruptamente alcance a emitir un evento final. Recuperar metadatos de archivos de sesión guardados por omp cuando la oficina estuvo cerrada.
- Conservar el catálogo al cerrar las ventanas. No borrar ni reescribir archivos de conversación de omp; un archivo ausente se indica como no disponible. No afirmar que se guardó contenido que omp no llegó a persistir.
- Ante cada transición confirmada de cero a una consola principal de omp, un gato mensajero llega al golden con el resumen. Pulsarlo muestra los últimos siete días de conversaciones, ordenados por última actividad descendente, con columnas proyecto · conversación · carpeta. Ofrecer abrir carpeta y activar consola viva; reanudar una cerrada requiere acción explícita y comprobar que no hay otra instancia viva.
- No hay límite de una visita al día ni filtro de semana calendario. Cerrar todas y abrir la primera vuelve a disparar la visita. Actualizaciones duplicadas, subagentes, reconexiones sin cierre confirmado y pasar de dos consolas a una no cuentan como ese evento. Guardar la identidad del evento presentado para no repetirlo al repintar/reabrir la oficina mientras las mismas consolas siguen vivas.
- Interpretación de implementación: últimos siete días = ventana móvil desde el instante actual menos siete periodos de 24 horas hasta el instante actual; mostrar fechas en la zona local. Historial sigue accesible manualmente aunque no haya visita.
- El catálogo no se limita a lo que la oficina vio en directo: importar metadatos de conversaciones persistidas en los perfiles del usuario incorporados, con lectura incremental y sin cargar transcripciones completas en la interfaz.


## 12. Lo que queda al implementador

Nombres internos, estructura mínima de archivos, coordenadas exactas, formato privado de named pipe, cadencia de animación y distribución del instalador Windows. Evitar abstracciones sin uso y dependencias para tareas cubiertas por Electron, Canvas o las bibliotecas públicas de omp.

El plan continúa con pruebas del puente local, identidad de terminal y metadatos de historial. Ya no se necesita responder permisos por Collab; sí demostrar selección de la consola/pestaña correcta y registro real de agentes/hijos. No inventar soporte, no sustituir la actividad viva por lectura de historiales y no consumir turnos de modelo ni reiniciar terminales del usuario sin autorización específica.
