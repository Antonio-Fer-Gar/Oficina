# Oficina nter para omp

Aplicación de Windows que muestra las sesiones de omp como una oficina en pixel art. Por defecto ocupa una franja superior, dejando 34 px para las pestañas de las consolas. Puedes moverla arrastrando la barra superior y cambiar su tamaño desde los bordes: recuerda posición y tamaño. En **Ajustes** puedes restaurarlos y elegir **Siempre encima**, desactivado por defecto. La oficina observa y envía mensajes a la sesión que eliges. Las preguntas de omp se pueden ver y responder desde su ficha sin cambiar a la consola; las autorizaciones y revisiones de planes conservan el acceso a la consola original.

## Qué se ve

- **Proyectos.** Cada carpeta tiene una mesa. El primer agente de un proyecto nuevo recoge una mesa de la zona de descanso y la coloca; las demás sesiones del proyecto la comparten. Las rutas de Windows que solo difieren en mayúsculas o en la barra final cuentan como la misma carpeta.
- **Personajes.** En Animales, un gato es un agente y un ratón es un subagente. Robots es la temática predeterminada: los agentes son robots azules inspirados en Microduck y los subagentes, más pequeños, son naranjas. Los nombres aparecen debajo; los de agentes principales se reutilizan cuando quedan libres.
- **Consolas abiertas antes.** Las consolas de omp abiertas antes de conectar la oficina aparecen en el estado «Sin conectar». La oficina lee su carpeta y, en Windows Terminal, su conversación, en solo lectura. No muestra su actividad ni permite controlarlas hasta reiniciarlas.
- **Una silla por proyecto.** Se sienta quien está trabajando. Al llegar, el personaje se ve sentado de espaldas, mirando al ordenador, con los brazos hacia el teclado y el respaldo delante del cuerpo. Al levantarse vuelve a la vista frontal. Los demás hacen cola por orden de llegada. Si el agente sentado queda libre, pasa a necesitar una decisión o termina, le cede la silla al primero de la cola. Una tarea en segundo plano o un subagente en marcha mantienen ocupada la silla.
- **Descanso.** Los agentes libres van a la zona de café. Los dos primeros en llegar ocupan el sofá; cuando queda una plaza libre pasa al siguiente que espera.
- **Desplazamientos.** Los personajes y el mensajero mueven brazos y piernas al caminar, también con la reducción de movimiento de Windows; los demás efectos siguen respetando esa preferencia.
- **Consumo.** La escena se dibuja a un máximo de 30 imágenes por segundo mientras hay movimiento o acciones; cuando queda quieta deja de repintarse continuamente y se actualiza al cambiar el estado o el tamaño. Las sesiones de omp siguen supervisándose.
- **Actividad.** Los personajes muestran un libro al leer, una lupa al buscar, un lápiz al editar, una terminal al ejecutar comandos y una lista al coordinar tareas. Una acción breve puede seguir visible hasta 1,5 segundos para que no se pierda entre actualizaciones. Al quedar libres dejan de mostrarla; las consolas ya abiertas deben reiniciarse para cargar el puente actualizado.
- **Avisos.** Un agente que espera tu decisión va hacia tu personaje («TÚ») con un «!». **Responder aquí** abre su ficha con la pregunta completa y sus opciones. Puedes responder allí o en la consola; las autorizaciones y revisiones de planes conservan el acceso a la consola original.
- **Consulta.** Un subagente que pregunta a su agente se acerca a él con un «?».
- **Escala y sala de espera.** La sala de descanso y la zona de trabajo comparten una escala uniforme: cada personaje mantiene su tamaño al pasar entre ellas. El espacio reservado se adapta a la cantidad de agentes y mesas y, si hace falta, ambas zonas se reducen juntas para caber en la ventana.
- **Mensajero.** Cuando pasas de cero consolas principales abiertas a al menos una, llega un mensajero. Al pulsarlo se abre el listado de conversaciones de los últimos 7 días. El botón **Historial** abre el mismo listado en cualquier momento.
- **Modelo sobre la cabeza.** Cada agente y subagente muestra únicamente la imagen flotante del modelo efectivo, sin rombo, marco ni fondo: Opus es un pulpo, Sol un sol, Luna una luna y Terra un planeta Tierra. Otros modelos muestran un nombre abreviado; `N/D` indica que no hay modelo conocido. La imagen cambia cuando el puente confirma el modelo activo y no tapa los avisos de decisión o consulta.
- **Mesas seleccionables.** Al pulsar una mesa se abre la ficha del proyecto con su nombre, carpeta y agentes asignados; al pulsar uno se abre su ficha. **Nombre de la mesa → Guardar nombre** cambia su nombre visual.
- **Jefe y usage.** Pulsar tu personaje —perro en Animales, humano en Robots— abre las cuotas y límites reales de omp, equivalentes a `/usage`, con identificadores de cuenta ocultos. **Actualizar usage** vuelve a consultarlos.
- **Estrés.** Tu personaje muestra una señal progresiva de estrés según los agentes y subagentes trabajando; disminuye cuando baja la carga.
- **Actualizaciones.** Al abrirse, la oficina consulta la versión pública del repositorio. Si es más reciente, muestra un aviso con un enlace al repositorio; la instalación es manual. Sin conexión no interrumpe el inicio.

## Personalización

Al iniciar, elige **Animales** o **Robots**, seleccionado por defecto. Puedes cambiarlo después en **Ajustes**, junto a «Sonido»; la elección guardada y la raza y ropa de Animales se conservan al cambiar de tema. Ahí también se configura **Siempre encima** y se restauran la posición y el tamaño de la ventana.

- **Raza de tu perro:** pastor alemán, golden retriever, labrador, husky siberiano, beagle, bulldog francés, dálmata o perro salchicha.
- **Ropa del perro, de los gatos y de los ratones, por separado:** camisa nter, polo blanco, chaqueta verde, traje y corbata, sudadera, camiseta de rayas o bata de laboratorio.
- **Robots:** colores independientes para agentes y subagentes: azul, naranja, menta, rosa, morado o crema.
- **Jefe humano:** hombre o mujer, tono de piel, color y estilo de pelo; aparece sentado de espaldas y la vista previa muestra el resultado antes de guardarlo.

Mientras eliges, la oficina muestra el resultado. **Guardar** conserva las opciones, **×** descarta los cambios y **Restablecer aspecto animal** recupera la raza y ropa originales sin modificar las opciones de Robots.

## Ficha de un agente

Al pulsar un personaje se abre su ficha de agente o subagente, con proyecto, sesión, estado, actividad y modelo efectivo.

En los agentes principales, **Nombre → Guardar nombre** permite poner un nombre personalizado. Dejar el campo vacío recupera el original. El nombre se actualiza en la oficina y en la lista de su mesa, y se conserva por conversación y perfil. Los nombres de las mesas se conservan por carpeta. Son nombres visuales: no renombran carpetas, archivos ni conversaciones de omp.

- **Modelo y grado.** Elige uno de los modelos disponibles en esa sesión y su grado de razonamiento (sin razonamiento, mínimo, bajo, medio, alto, muy alto o máximo), y pulsa **Confirmar modelo y potencia** para aplicar ambos. Cambiar los desplegables no envía nada hasta confirmar. Solo aparecen los grados que admite el modelo elegido. Si el agente está trabajando, el cambio confirmado queda pendiente y se aplica al terminar el turno.
- **Mensajes.** «Enviar ahora» entrega el mensaje en cuanto el agente puede leerlo. «Al terminar» lo deja en cola hasta que acabe lo que está haciendo. Al confirmarse el envío o la puesta en cola, el campo se vacía; si falla, conserva el texto para reintentarlo. Lo mismo ocurre con una respuesta escrita a una pregunta de omp. La ficha muestra si el mensaje se entregó, quedó en cola o falló.

## Abrir desde la terminal

Desde cualquier carpeta, en PowerShell o CMD:

```powershell
oficina
```

Si la oficina está cerrada, la abre; si ya está abierta, conserva una sola instancia y la restaura si estaba minimizada. No necesitas ir al directorio del proyecto ni tener Bun o Node en el PATH.

El instalador registra `oficina.cmd` en `%USERPROFILE%\.local\bin`, reutiliza esa carpeta si ya está en el PATH y, si falta, la añade solo al PATH del usuario. En ese último caso abre una terminal nueva para que recoja el cambio. No modifica los perfiles de PowerShell ni el PATH del sistema.

Las actualizaciones mantienen el comando apuntando a la instalación actual. La desinstalación retira únicamente el comando que creó la oficina; conserva comandos ajenos o modificados, la carpeta compartida `.local\bin` y su entrada en el PATH.

## Conectar con omp

El puente es una extensión de omp que el propio omp descubre en `%USERPROFILE%\.omp\agent\extensions\nter-office\`. La oficina nunca modifica `config.yml` ni las demás extensiones.

- La primera vez, la oficina muestra **Conectar la oficina con omp**. Al pulsarlo, copia solo esa carpeta.
- Desde el código fuente también puedes usar la línea de comandos. Sin `--apply` solo muestra lo que haría:

  ```powershell
  bun run bridge                       # simulación
  bun run bridge -- --apply            # instalar o actualizar en el perfil por defecto
  bun run bridge -- --profile trabajo --apply
  bun run bridge -- --remove --apply   # retirar solo la carpeta del puente
  ```

- Si existe una carpeta con ese nombre que no creó la oficina, o si editaste el puente instalado, la instalación y la retirada se niegan a tocarla.
- Las consolas omp nuevas aparecen solas. Las que ya estaban abiertas antes de instalar el puente aparecen cuando las reinicias.
- Si la oficina está cerrada, abrir una consola interactiva de omp la abre automáticamente. Para ello la oficina tiene que haberse abierto al menos una vez, porque así deja su ruta en `%LOCALAPPDATA%\nter-omp-office\launcher.json`. Si ya está abierta no se duplica, y si la tenías minimizada sigue minimizada. Las sesiones RPC o `-p` no la abren.
- Después de actualizar la oficina, pulsa **Actualizar el puente de omp** para que las consolas usen la versión nueva.

Cada proceso de omp abre un canal local con nombre (named pipe) protegido por un token aleatorio y lo comparte con sus subagentes. Ese token se guarda en `%LOCALAPPDATA%\nter-omp-office\registry`. La interfaz no recibe nunca tokens ni acceso al sistema; usa una API cerrada a través de `preload`.

## Historial

El catálogo SQLite (`%LOCALAPPDATA%\nter-omp-office\history.sqlite`) guarda por conversación el proyecto, el título, la carpeta y la referencia al archivo de omp. No copia transcripciones. Lee las sesiones guardadas de todos los perfiles en modo solo lectura.
El botón **Ir a la conversación** activa su consola si sigue abierta; si está cerrada abre una consola PowerShell en la carpeta del proyecto y arranca omp con la conversación y el perfil guardados. Si no puede determinar si una consola antigua contiene esa conversación, avisa en lugar de abrir una posible copia; tampoco reanuda sesiones sin archivo guardado. La consola permanece abierta si omp termina para que puedas ver cualquier error.


Estados de cada conversación:

- **Guardada:** el archivo de omp existe.
- **Archivo no disponible:** omp asignó una ruta, pero el archivo aún no se ha escrito (omp lo crea al recibir la primera respuesta) o ya se borró.
- **Sin historial guardado:** la sesión es efímera.

## Desarrollo

Para desarrollar desde una copia del repositorio, instala Bun siguiendo [sus instrucciones oficiales](https://bun.sh/docs/installation) y copia el ejecutable a la ubicación que usan la compilación y el instalador. Esa carpeta está excluida de Git.

```powershell
New-Item -ItemType Directory -Force '.superpowers\tools\bun-windows-x64'
Copy-Item (Get-Command bun).Source '.superpowers\tools\bun-windows-x64\bun.exe'
```

```powershell
$bun = '.\.superpowers\tools\bun-windows-x64\bun.exe'
& $bun install
& $bun test                                     # pruebas
& $bun node_modules/typescript/bin/tsc --noEmit # tipos
& $bun run dev                                  # compilar y abrir la oficina
& $bun run dist                                 # ejecutable e instalador en release\
& $bun run update:installed                     # comprobar, compilar, actualizar instalación y reabrir
& $bun run update:installed -- --dry-run        # mostrar destino sin cambiar nada
```

`bun run dist` genera `release\win-unpacked\Oficina nter.exe` y un instalador NSIS que incluye Electron y Bun. El equipo de destino no necesita Node ni Bun instalados. Los ejecutables no están firmados.

Para anunciar una nueva versión, incrementa `version` en `package.json` con tres números (`mayor.menor.parche`), comprueba y publica el código en la rama `main`. El aviso compara esa versión con la instalada; no detecta commits que no cambien el número. El repositorio contiene el código: para ofrecer un instalador descargable hay que compilarlo y publicarlo por separado.

El icono de Windows es `assets\nter-logo.ico` (256, 128, 64, 48, 32 y 16 px), derivado de `assets\nter-logo.png`. Se incluye ya convertido porque el conversor de iconos de electron-builder se queda bloqueado al ejecutarse con Bun; si cambias el logo, regenera también el `.ico`.

### Actualizar la aplicación instalada después de los cambios

La skill local `.agents/skills/updating-installed-office/SKILL.md`, referenciada desde `AGENTS.md`, establece que cada conjunto de cambios termina con la actualización instalada. No se reinicia por cada archivo guardado. El comando `update:installed` comprueba pruebas y tipos, compila y genera el instalador antes de cerrar la oficina. Si esas comprobaciones fallan, no toca la instalación.

El destino se obtiene del registro de instalación del usuario, con la ubicación habitual de Windows como alternativa. El actualizador cierra solo la oficina de esa instalación y la ventana de desarrollo de este proyecto, ejecuta el instalador en modo silencioso y abre la versión instalada. Comprueba el SHA256 de `app.asar` y que el lanzador publicado apunta al ejecutable instalado en marcha. Conserva preferencias e historial y no cierra consolas ni sesiones de omp. La skill requiere que el asistente ejecute el comando: no es un servicio residente ni una actualización remota.

## Limitaciones conocidas

- Windows puede impedir que una aplicación pase otra ventana al frente si no la acabas de usar. En ese caso la consola parpadea en la barra de tareas y el aviso lo indica.
- La pestaña correcta de Windows Terminal se localiza por un marcador `nter-xxxxxxxx` que el puente añade al título de la consola. Si tu perfil de Windows Terminal tiene activado `suppressApplicationTitle`, el marcador no aparece y el aviso responde «No se encontró la pestaña de la consola original». Nunca activa otra pestaña al azar.
- Las sesiones abiertas en modo RPC o sin terminal visible aparecen en la oficina, pero no tienen consola que activar.
