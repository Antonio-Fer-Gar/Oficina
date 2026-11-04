# Changelog

## Sin publicar

## 0.1.9

### Added

- En el tema Robots, el jefe da un latigazo eléctrico al agente o subagente al recibir un mensaje; en Animales no se muestra el efecto.

## 0.1.8

### Added

- En el tema de animales, el agente llamado Pablo aparece como un topo con la misma ropa y animaciones que los demás agentes.
- Los primeros nombres automáticos son Oscar, Nono y Pablo, en ese orden.

## 0.1.7

### Added

- Al pulsar el aviso de actualización se descarga la última release estable, se verifica el instalador y se actualiza y reabre la oficina sin cerrar las sesiones de omp.
- La esquina inferior derecha muestra la versión instalada de la aplicación.
- Las preguntas y opciones admiten negritas con `**texto**`; las cabeceras de las ventanas internas permanecen visibles al desplazarse.

## 0.1.6

### Added

- Los distintivos identifican los modelos por su identidad también con GitHub Copilot; Grok muestra su símbolo y el número de versión disponible.
- Ajuste de ahorro de tokens con guía breve para omp, delegación selectiva y comparación documentada; conserva las instrucciones y perfiles existentes y no garantiza ahorro.

### Fixed

- Al cerrar la última consola de un proyecto, el personaje devuelve su mesa y ambos desaparecen; la reapertura reutiliza la misma mesa.
- El servicio interno `omp browser-relay` ya no aparece como consola ni crea mesas fantasma.

## Cambios anteriores

### Added

- Laura y Nono se añaden a los nombres automáticos de agentes; Diego ya estaba disponible.
- Aviso al iniciar cuando la versión pública de la rama principal es más reciente, con enlace al repositorio y cierre manual; la consulta no bloquea el inicio ni envía credenciales.
- La ficha muestra las preguntas pendientes de omp con sus opciones, descripciones, vistas previas y recomendación. Admite respuesta escrita, selección única o múltiple y varias preguntas en una solicitud.
- Todos los ratones llevan gafas con cualquier prenda.
- Botón **Confirmar modelo y potencia**: permite preparar ambos valores sin aplicarlos al cambiar los desplegables.
- Ficha de proyecto al pulsar una mesa, con carpeta y recuento de agentes/subagentes; los personajes conservan prioridad al seleccionarlos.
- Imágenes flotantes del modelo efectivo sobre gatos y ratas, sin rombo, marco ni fondo: Opus/pulpo, Sol/sol, Luna/luna, abreviatura para otros y `N/D` cuando no hay información.
- Skill local de actualización instalada y comando `update:installed`: valida, compila, instala y reabre la oficina sin cerrar sesiones de omp ni eliminar datos. Verifica el paquete instalado y el lanzador.
- Las fichas identifican explícitamente **Agente (gato)** y **Subagente (rata)**.
- Pulsar el perro abre el usage oficial de omp con cuotas por proveedor/cuenta, identificadores ocultos y actualización manual; consulta acotada y errores legibles, sin credenciales en el renderizador.
- Edición persistente del nombre visual de cada gato y mesa, con restauración al dejar el campo vacío; la mesa muestra sus gatos asignados y permite abrir sus fichas.
- Enrojecimiento progresivo de cabeza y orejas del perro según gatos/subagentes trabajando, con recuperación al bajar la carga y máximo con ocho o más.
- Sala de espera independiente de la reducción de las mesas: mantiene su tamaño base y crece con los agentes libres; reserva espacio antes del primer proyecto, con desplazamiento y selección continuos al cruzar de zona.
- Comando `oficina` para abrir o restaurar la aplicación instalada desde cualquier carpeta en PowerShell/CMD, sin duplicar instancias. El instalador lo registra en la carpeta de comandos del usuario y la desinstalación respeta archivos ajenos o modificados.
- Los agentes y subagentes representan su actividad con libro, lupa, lápiz, terminal o lista; el modelo Terra aparece como un planeta Tierra.
- **Ir a la conversación** en el historial activa la consola existente o reanuda la sesión guardada con su perfil, evitando reabrirla cuando una consola antigua podría contenerla.
- Ventana redimensionable y desplazable desde su barra superior, con posición y tamaño persistentes; **Siempre encima** es opcional y viene desactivado.
- Animación de brazos y piernas al caminar y gestos de trabajo, respetando la reducción de movimiento de Windows.
- Perro salchicha como opción de raza para tu personaje.
- Escala uniforme en las salas de trabajo y descanso, adaptada al espacio requerido; los dos primeros agentes que llegan a descansar ocupan el sofá y las plazas se reasignan por orden de llegada.
- Elección persistente entre animales y robots inspirados en Microduck: agentes azules, subagentes naranjas y jefe humano, con poses y movimiento; los ajustes animales anteriores se conservan.
- Robot rediseñado con aspecto de patito; selección independiente de color para agentes y subagentes y personalización del tono de piel, color y estilo de pelo del jefe humano, con vistas previas.

### Fixed

- Nombres siempre debajo y delante de los personajes; subagentes más pequeños y sala de descanso ajustada para no recortar etiquetas.
- Robots como temática predeterminada y elección de jefe hombre o mujer, siempre de espaldas al ordenador; se conservan las preferencias existentes.
- Panel de usage con texto más legible, sin barras ni símbolos decorativos de terminal.
- Robots redibujados siguiendo la referencia Microduck: visor gris, cámara circular, pico plano y cuello mecánico, manteniendo los colores y las poses configurables.
- Pasos visibles con reducción de movimiento activada en Windows: agentes, subagentes y mensajero alternan brazos y piernas mientras se desplazan, sin activar los demás efectos.
- Menor consumo de la escena: los dibujos animados se limitan a 30 imágenes por segundo y las escenas quietas dejan de repintarse continuamente; se reactivan ante actualizaciones, cambios de tamaño o acciones.
- Postura del sofá con piernas flexionadas más cortas y pies por delante; pasos con balanceo más visible de brazos y piernas sin mangas inmóviles superpuestas.
- **Ir a la conversación** abre una consola PowerShell interactiva en la carpeta guardada, con omp y la conversación seleccionada; evita iniciar omp sin consola cuando Windows Terminal no está disponible.
- Responder desde la oficina resuelve la pregunta original de esa sesión, en vez de dejar un mensaje en cola detrás del diálogo. Las respuestas duplicadas o dirigidas a una petición caducada se rechazan.
- Los personajes y el mensajero siguen andando cuando Windows tiene activada la reducción de movimiento, sin saltar al destino. La pose sentada se muestra al llegar a la silla.
- Los personajes sentados se dibujan de espaldas mirando al monitor, con brazos hacia el teclado, piernas recogidas y respaldo en primer plano; al levantarse recuperan la vista frontal. Incluye gatos, subagentes y perro. La cabeza sentada conserva la selección por clic.
- El campo «Mensaje para este agente» se vacía al confirmarse un envío inmediato o en cola; si falla conserva el texto. También se limpia la respuesta personalizada confirmada. Se corrige una comparación entre `undefined` y `null` que interrumpía la actualización de la ficha tras los mensajes sin pregunta pendiente.

## 0.1.3

### Added

- **Personalización**, junto a «Sonido»: elige la raza de tu perro (pastor alemán, golden retriever, labrador, husky siberiano, beagle, bulldog francés o dálmata) y la ropa del perro, de los gatos y de los ratones (camisa nter, polo blanco, chaqueta verde, traje y corbata, sudadera, camiseta de rayas o bata de laboratorio). Se pregunta la primera vez que abres la oficina, se puede cambiar cuando quieras y la oficina lo muestra en vivo mientras eliges.
- La oficina se puede mover arrastrando «⠿ Mover» y recuerda dónde la dejaste. Con doble clic en «⠿ Mover» vuelve a su sitio.

### Changed

- La franja libre sobre la oficina baja de 48 a 34 px.
- A partir del séptimo gato en la zona de café se forma otro grupo a la derecha en lugar de amontonarse.

## 0.1.2

### Added

- En la ficha de cada agente se elige el grado de razonamiento (sin razonamiento, mínimo, bajo, medio, alto, muy alto, máximo) junto al modelo. Solo se ofrecen los grados que admite el modelo elegido y, si el agente está trabajando, el cambio se aplica al terminar el turno.
- Las consolas de omp abiertas antes de conectar la oficina también aparecen, con su mesa y su gato. Se leen su carpeta y su conversación de Windows Terminal en solo lectura. Son de solo lectura: para controlarlas hay que reiniciarlas.

### Changed

- Los gatos se llaman Pablo, Oscar, Antonio, Javi, Álvaro, Alex y Mihai y, si hacen falta más, otros nombres españoles. Cada gato nuevo recibe el primer nombre libre.
- La ventana deja libre una franja de 48 px arriba para que se vean las pestañas de las consolas.
- En la zona de café los gatos se colocan en filas de tres y sus nombres ya no se solapan.
- Los avisos informativos son más compactos; los de decisión mantienen el tamaño grande.

## 0.1.1

### Added

- Al iniciar una consola interactiva de omp con la oficina cerrada, el puente abre la oficina. Nunca abre una segunda instancia ni restaura una oficina minimizada.

### Changed

- La ventana se ancla al tercio superior de la pantalla.
- Tu personaje («TÚ») es ahora un pastor alemán.
- Activar la consola original busca tanto pestañas de Windows Terminal como consolas clásicas, porque una consola clásica abierta desde Windows Terminal hereda `WT_SESSION`.

## 0.1.0

### Added

- Ventana de Windows anclada al tercio inferior de la pantalla, siempre visible, con entrada propia en la barra de tareas, botones de minimizar y cerrar, recolocación al cambiar de monitor y aislamiento de seguridad de Electron (sandbox, contextIsolation, sin nodeIntegration, navegación bloqueada).
- Escena en pixel art: una mesa por proyecto que el primer gato trae desde la zona de descanso, silla compartida por orden de llegada, café para los agentes libres, «!» cuando hace falta tu decisión, «?» cuando un ratón consulta a su gato y reducción uniforme cuando hay muchos proyectos.
- Puente de omp por named pipe con token, extensión que registra cada sesión principal y cada subagente con su propia identidad, y controles por agente: lista de modelos, cambio de modelo (aplicado o pendiente) y mensajes «Enviar ahora» o «Al terminar» con confirmación real.
- Avisos de decisión: aviso grande, campana una vez por petición, parpadeo en la barra de tareas sin restaurar la ventana y activación de la consola o pestaña original, comprobando PID, hora de inicio y marcador. Un PID reutilizado o una consola cerrada nunca abren otra.
- Gato mensajero cada vez que se pasa de cero consolas principales a al menos una, con el listado de conversaciones de los últimos 7 días: proyecto, conversación, carpeta, estado y botón para abrir la carpeta.
- Catálogo SQLite persistente por conversación y perfil, alimentado por la extensión y por las sesiones guardadas de todos los perfiles de omp, en solo lectura.
- Instalación y retirada del puente que solo tocan `extensions\nter-office` del perfil indicado. Tienen simulación previa y se niegan a sobrescribir carpetas ajenas o modificadas.
- Empaquetado para Windows x64 (carpeta ejecutable e instalador NSIS) con Electron y Bun incluidos.

### Changed

- El listado de bienvenida cubre los últimos siete días como ventana móvil, sin límite de una visita diaria.
- Si dos consolas aparecen en el mismo sondeo, el paso desde cero consolas también provoca la visita del mensajero.
- Las decisiones se responden en la consola original de omp. No se usa Collab.
