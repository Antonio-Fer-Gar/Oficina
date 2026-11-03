# Oficina nter para omp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. El usuario ha elegido ejecución directa en esta sesión; no volver a ofrecer otro método.

**Goal:** Construir una oficina Windows pixel art conectada a las sesiones que el usuario abre en omp, con mesas por proyecto, acceso a su consola original e historial de los últimos siete días entregado por un gato cada vez que se abre la primera consola sin ninguna otra viva.

**Architecture:** La extensión precargada publica identidad, actividad, parentesco, destino de terminal y metadatos persistentes mediante un puente local autenticado. Electron conserva la ventana, activa la consola solo tras un clic y dibuja la escena Canvas/DOM; un auxiliar Bun puede gestionar el catálogo SQLite y los módulos de omp que requieren ese runtime. Las preguntas se responden en la terminal original: no hay formularios de autorización remotos, relay ni Collab automático.

**Tech Stack:** Windows x64, Electron, TypeScript, Canvas/DOM, Bun >=1.3.14 y Zod. omp objetivo inicial 18.13.2. SQLite integrado en Bun para el catálogo, sin ORM; PowerShell/.NET UI Automation para seleccionar terminales Windows verificadas cuando no baste una operación nativa directa. Fijar versiones en lockfile. Sin React, motor de juego ni servicio Windows permanente.

**Spec:** `docs/superpowers/specs/2026-10-28-oficina-omp-design.md`, revisado por las peticiones de abrir consola original e historial. Evidencia: `docs/research/omp-local-smoke.md`, `omp-agent-observability.md` y `omp-bridge-gate.md`.

## Global Constraints

- «El usuario seguirá abriendo y usando omp en sus terminales.» No alojar sus agentes en la oficina ni abrir una segunda instancia de un historial activo.
- «No incluye controlar otros programas de agentes, ejecutar comandos a partir de archivos de historial, publicar un panel remoto propio, sincronización entre ordenadores ni modificar el núcleo de omp.»
- «Franja horizontal inferior, aproximadamente un tercio de la pantalla útil.» Siempre encima cuando esté visible, minimizable y con entrada en barra de tareas.
- «Una mesa por proyecto. Sesiones distintas del mismo proyecto comparten mesa y mantienen identidades e historiales separados.»
- Todos caminan ligeritos, a la misma velocidad. Gatos azules, ratones crema y golden verde salvia; logo nter; madera gris, mesas blancas, sillas grises y sin carteles de zonas.
- La silla la ocupa cualquier participante que trabaje, según llegada. Dejar silla al acabar/marcharse; siguiente trabajador esperando toma el relevo. La cola visual no altera el trabajo de omp.
- El primer gato trae la mesa desde una pila de descanso. Más proyectos reducen mesas y personajes uniformemente para caber sin aumentar la altura ni cambiar a scroll a escondidas.
- «El renderizador no puede ejecutar shell, leer credenciales o emitir mensajes de bus genéricos.» Nunca enviar pulsaciones ni texto de una conversación al shell para navegar.
- Sonido/exclamación/atención de barra al pedir intervención, sin restaurar ni enfocar automáticamente. Solo el clic activa la consola original exacta.
- La nueva petición sustituye el puente de respuestas Collab. No habilitar `collab.autoStart`, obtener enlaces ni publicar salas para este producto.
- Guardar metadatos y referencia a la conversación que persiste omp; no duplicar transcripciones completas ni inventar archivos de sesiones efímeras.
- Historial: ventana móvil de los últimos siete días, ordenada por última actividad descendente, una fila por conversación/perfil. Visita en cada transición confirmada de cero a una consola principal; sin límite diario. No confundir reconexión, subagentes o pasar de dos a una con abrir la primera.
- Instalación automática del puente aceptada conceptualmente. Presentar cambios concretos antes de aplicarlos; no reiniciar terminales ni ejecutar turnos de modelo sin permiso específico.
- El proyecto no es un repositorio Git. Trabajar en la carpeta dedicada, registrar rulings/evidencia en `.superpowers/sdd/2026-10-28-oficina-omp/progress.md` y no crear Git/commits/worktree sin necesidad y acuerdo.

## Review Focus

1. Dos sesiones del mismo proyecto preguntan simultáneamente: cada aviso activa su pestaña exacta, nunca otra sesión por coincidir su título. Prueba y smoke en Tarea 4.
2. Consola cerrada bruscamente mientras la oficina está cerrada: el historial conserva conversación/carpeta y no depende de un callback final. Prueba en Tarea 5.
3. Límite exacto de siete días y varios ciclos cero→una consola en el mismo día: filas recientes correctas y nueva visita por ciclo; sin repetir por snapshot/reconexión o reapertura de oficina con consolas intactas. Prueba en Tarea 5.
4. Reapertura de sesión con el mismo ID pero otra instancia o PID reutilizado: rechazar destino antiguo y no mandar mensaje/cambio de modelo a otro agente. Prueba en Tareas 2 y 4.
5. Entrega de mesa y petición humana durante cambio de DPI/muchas mesas: una mesa por proyecto, escala uniforme y aviso accesible sin robar foco. Prueba/smoke en Tareas 3, 6 y 7.

---

## Estado y mapa de archivos

Implementación ya realizada, no repetir: Bun 1.4.4 verificado por SHA-256 está en `.superpowers/tools/bun-windows-x64/bun.exe`; `package.json`, `bun.lock`, `tsconfig.json` y `.gitignore` existen; Zod 4.6.7 está fijado. El smoke `scripts/smoke-bridge.ts --no-model` ejerció una extensión temporal, identidad raíz, mismo modelo y selector real de RPC-UI, sin `agent_start`. Seis checks pasaron; el script marcó INCOMPLETE por dos recorridos Collab/hijos que ahora deben sustituirse por los requisitos revisados, no hacerse pasar por pruebas superadas.

| Archivos | Responsabilidad |
|---|---|
| `src/bridge/protocol.ts` | Contrato y validación del puente local; identidad y generaciones. |
| `src/bridge/extension.ts`, `src/bridge/pipe.ts` | Registro por sesión/hijo, eventos y acciones públicas autenticadas. |
| `src/bridge/worker.ts` | Auxiliar Bun único: metadatos de omp y catálogo, comunicado por stdio. |
| `src/office/state.ts` | Proyectos, participantes, cola de silla y reserva de transportista. |
| `src/office/scene.ts`, `src/office/sprites.ts` | Movimiento, dibujo, escala e hit testing. |
| `src/terminal.ts`, `scripts/focus-terminal.ps1` | Destino verificado y selección de consola/pestaña existente. |
| `src/history.ts` | Catálogo persistente, consulta móvil de siete días y detección de apertura de primera consola. |
| `src/main.ts`, `src/preload.ts` | Ventana, conexiones, acciones permitidas, activación nativa y preferencias. |
| `src/renderer.ts`, `src/index.html`, `src/style.css` | Escena, fichas, historial, avisos y formularios de mensajes/modelos. |
| `assets/nter-logo.png`, `assets/notification.wav`, `assets/app.ico` | Recursos aprobados e icono Windows propio. |
| `scripts/build.ts`, `scripts/install-bridge.ts` | Paquete e incorporación automática/reversible sin Collab. |
| `tests/{bridge,state,terminal,history,scene,install}.test.ts` | Pruebas de comportamientos, errores y persistencia; no mocks que repitan respuestas. |
| `scripts/{smoke-bridge,smoke-office}.ts` | Ejercicios reales de procesos/ventanas propios. |
| `README.md`, `CHANGELOG.md`, `docs/research/omp-bridge-gate.md` | Uso, privacidad, cambios y evidencia real. |

Un producto y un plan: estos módulos se necesitan entre sí. No crear `collab.ts`, un cliente de respuestas remoto ni un servidor adicional.

## Contratos que comparten las tareas

Definir/exportar en `src/bridge/protocol.ts`; son tipos privados de nuestra app, no eventos atribuidos a omp sin verificación:

```ts
type AgentRef = { instanceId: string; generation: string; sessionId: string; agentId: string };
type ModelRef = { provider: string; id: string; name: string };
type TerminalTarget = {
  pid: number; startedAt: string; kind: 'windows-terminal' | 'classic';
  windowHandle?: string; wtSession?: string; marker: string;
};
type AgentInfo = {
  ref: AgentRef; parent: AgentRef | null; name: string; cwd: string;
  model: ModelRef | null;
  phase: 'working' | 'idle' | 'asking-parent' | 'waiting-human' | 'stopped' | 'unknown';
  activity: string; queued: number; pendingAsync: boolean; runningChildren: number;
  terminal: TerminalTarget | null; conversation: Conversation | null;
};
type Conversation = {
  profile: string; sessionId: string; project: string; cwd: string; title: string;
  sessionFile: string | null; openedAt: string; lastActiveAt: string;
  closedAt: string | null;
};
type OfficeEvent =
  | { type: 'agent'; seq: number; agent: AgentInfo }
  | { type: 'removed'; seq: number; ref: AgentRef }
  | { type: 'disconnected'; seq: number; instanceId: string; generation: string }
  | { type: 'attention'; seq: number; ref: AgentRef; requestId: string; pending: boolean }
  | { type: 'consultation'; seq: number; child: AgentRef; parent: AgentRef; pending: boolean };
type OfficeCommand =
  | { id: string; type: 'message'; ref: AgentRef; text: string; delivery: 'steer' | 'followUp' }
  | { id: string; type: 'set-model'; ref: AgentRef; model: ModelRef }
  | { id: string; type: 'models'; ref: AgentRef };
type CommandResult =
  | { id: string; ok: true; status: 'applied' | 'queued'; models?: ModelRef[] }
  | { id: string; ok: false; code: 'stale' | 'offline' | 'invalid' | 'unsupported'; message: string };
```

`seq` se ordena por instancia+generación, no reloj del sistema. `Conversation` se reexporta desde el módulo que finalmente posea su esquema para evitar definiciones duplicadas. El catálogo histórico usa `(profile, sessionId)`, no AgentRef/PID; una reapertura actualiza la misma conversación. `requestId` solo identifica un aviso observado, no una autorización que la app pueda resolver. Los secretos IPC no forman parte de estos payloads públicos.

### Task 1: Revisar la puerta técnica y completar la prueba sin modelo

**Files:** Modify `scripts/smoke-bridge.ts`, `docs/research/omp-bridge-gate.md`, ledger. No configuración global.

**Interfaces:** Consumes evidencia de la prueba anterior y diseño revisado. Produces `runBridgeSmoke(options: { ompPath: string; allowModelTurn: boolean }): Promise<{ passed: boolean; checks: Array<{ name: string; passed: boolean; evidence: string }> }>` con checks reales del alcance local. No convertir checks no ejecutados en PASS.

- [ ] **Step 1:** Registrar ruling: la petición explícita de abrir consola sustituye respuestas Collab; no hace falta sala de control ni resolvedor remoto de permisos. Los seis checks anteriores siguen como evidencia histórica, no probarlos de nuevo para borrar el resultado.
- [ ] **Step 2:** Cambiar los pendientes del smoke: descubrimiento/identidad de terminal, metadatos guardados y carga de hijos son checks distintos. Ejecutar los de raíz y lectura sin modelo ahora; diferir el task real al smoke autorizado de Tarea 9. Un check diferido conserva estado explícito NOT RUN.
- [ ] **Step 3:** Obtener `ctx.agent`, cwd, modelo, `pi.getSessionName()` y `ctx.sessionManager.getSessionId()/getSessionFile()` usando interfaces reales de 18.13.2; comprobar que un archivo persistido propio se puede consultar sin leer credenciales. La prueba RPC `--no-session` no demuestra historial guardado: usar una sesión propia con directorio temporal de sesiones.
- [ ] **Step 4:** Verificar metadatos de Windows Terminal (`WT_SESSION`, proceso anfitrión) y API pública `ctx.ui.setTitle`. El registro de WT_SESSION no prueba por sí solo selección de pestaña; esa prueba corresponde a Tarea 4.
- [ ] **Step 5:** Ejecutar `bun scripts/smoke-bridge.ts --no-model`, guardar salidas depuradas y retirar únicamente procesos/temporales propios. Aprobar la puerta local de arranque si registro, modelos sin turno y metadatos son reales. No bloquear todo el producto por una respuesta Collab que el usuario ya no pide; tampoco declarar probadas las acciones sobre hijos.

### Task 2: Puente local autenticado y controles de sesión/hijos

**Files:** Create `src/bridge/{protocol,extension,pipe}.ts`, `tests/bridge.test.ts`. Modify `package.json`, `tsconfig.json` solo para dependencias/entradas necesarias.

**Interfaces:** Consumes contrato anterior. Produces `startExtensionBridge(pi: ExtensionAPI): Promise<() => Promise<void>>`, `connectLocalBridge(options: { registryDir: string; onEvent(event: OfficeEvent): void }): Promise<{ send(command: OfficeCommand): Promise<CommandResult>; close(): Promise<void> }>` y esquemas Zod de entrada/salida.

- [ ] **Step 1:** Escribir primero pruebas que revelen token incorrecto, frame malformado/excesivo, generación obsoleta, hijo terminado y mensaje/cambio de modelo aplicado a la instancia equivocada. Comprobar el resultado visible, no que un mock recibió una llamada.
- [ ] **Step 2:** Ejecutar `bun test tests/bridge.test.ts` y observar fallo por comportamiento ausente.
- [ ] **Step 3:** Implementar JSONL versión 1, máximo 1 MiB por frame y token aleatorio de 32 bytes, autenticación antes de inventario, named pipe sin TCP y registro privado del usuario. Registrar cada extensión con su `ctx.agent` y relación padre; no usar el PID como identidad lógica ni exponer emisión genérica del bus.
- [ ] **Step 4:** Dirigir `sendUserMessage`/`setModel` a la instancia precargada correcta. Enumerar modelos reales. Si hay llamada en curso, usar el punto seguro demostrado o estado pendiente/rechazado real, sin abortarla a escondidas. No propagar un cambio del padre retroactivamente a hermanos/hijos.
- [ ] **Step 5:** Publicar actividad, colas, hijos, consulta real y espera humana observada. Un tool start `ask` puede ser candidato, no certeza de decisión pendiente hasta comprobar el flujo; retirarlo con resolución/cancelación. Un mensaje IRC ordinario no debe generar una petición humana ficticia.
- [ ] **Step 6:** Persistir metadatos mínimos de conversación/ruta de sesión al registrar y cuando cambien, de forma atómica por conversación. Así se puede reconstruir el catálogo si la oficina no estaba abierta; nunca guardar secretos o transcripción adicional. Dar de baja listeners al terminar sin bloquear a omp si falta la oficina.
- [ ] **Step 7:** Ejecutar `bun test tests/bridge.test.ts`, luego el smoke sin modelo con un proceso propio. Verificar token/ACK y que desconectar la oficina deja el anfitrión vivo. Actualizar evidencia y changelog.

### Task 3: Proyectos, estados y silla por orden de llegada

**Files:** Create `src/office/state.ts`, `tests/state.test.ts`.

**Interfaces:** Consumes `OfficeEvent`. Produces `createOffice(): OfficeState`, `applyOfficeEvent(state: OfficeState, event: OfficeEvent): OfficeState`, `arriveAtTable(state: OfficeState, ref: AgentRef): OfficeState`, `canonicalProject(cwd: string): Promise<string>`. `OfficeState` contiene proyectos (transportista/cola/reserva/ocupante), agentes y avisos, sin credenciales.

- [ ] **Step 1:** Probar dos registros simultáneos del mismo cwd → una mesa/un transportista; proyectos homónimos en rutas distintas → mesas distintas; eventos repetidos no duplican; secuencias antiguas no sustituyen estado nuevo.
- [ ] **Step 2:** Probar silla exclusiva para gato o ratón que trabaje, llegada A→B, salida A→reserva B, reentrada A al final, desaparición durante reserva y desconexión que libera puesto sin declarar café. Idle estable va a café solo sin cola, hijos o async pendientes.
- [ ] **Step 3:** Ejecutar `bun test tests/state.test.ts` y observar RED; implementar transición mínima, orden estable, normalización Windows con ruta real y caja, sin basename como clave. Cwd no verificable queda sin clasificar, no se inventa carpeta.
- [ ] **Step 4:** Conservar desconocidos en gris hasta cierre confirmado o reconciliación; una reconexión no desplaza al sentado. Los eventos actualizan hechos aunque el gato no haya terminado su trayecto. Llegar al puesto se informa una vez a `arriveAtTable`.
- [ ] **Step 5:** Ejecutar `bun test tests/state.test.ts` y suite actual. Ejercer inventario de dos sesiones propias y verificar que comparten mesa sin fusionar conversaciones.

### Task 4: Activar la consola/pestaña original que solicita intervención

**Files:** Create `src/terminal.ts`, `scripts/focus-terminal.ps1`, `tests/terminal.test.ts`. Modify extensión para registrar el destino verificado.

**Interfaces:** Consumes `AgentRef`, `TerminalTarget`. Produces `focusSession(ref: AgentRef): Promise<{ ok: true } | { ok: false; code: 'closed' | 'stale' | 'unavailable'; message: string }>` y `resolveTerminal(target: TerminalTarget): Promise<TerminalTarget | null>`. El click de aviso llama solo `focusSession`, no `answer`.

- [ ] **Step 1:** Escribir pruebas de selección: dos sesiones del mismo proyecto con títulos parecidos; PID reutilizado/fecha de inicio distinta; HWND ausente; marcador de otra generación; título con comillas/metacaracteres. Ningún caso debe iniciar un nuevo omp ni ejecutar contenido del título. Probar el resolver sobre metadatos reales/controlados, no reflejos de un mock.
- [ ] **Step 2:** Ejecutar `bun test tests/terminal.test.ts` y observar RED. Implementar validación de identidad/vida y llamada a helper fijo mediante `execFile`, argumentos separados. HWND se serializa como string. No interpolar títulos en comandos PowerShell ni usar SendKeys.
- [ ] **Step 3:** En Windows Terminal, registrar WT_SESSION y marcador único asociado a la sesión; usar `ctx.ui.setTitle` preservando título útil. Verificar el vínculo proceso/anfitrión y seleccionar la pestaña mediante operaciones CLI disponibles o UI Automation `SelectionItemPattern`. No seleccionar una pestaña solo por nombre de proyecto. Si una configuración suprime títulos y no permite resolución segura, devolver `unavailable` y documentarlo en vez de enfocar una sesión arbitraria.
- [ ] **Step 4:** Para consola clásica, verificar PID/fecha/HWND y restaurar/enfocar solo después del clic. Crear dos terminales de prueba propias, seleccionar alternadamente la correcta y confirmar visualmente que no creció el número de sesiones. No usar terminales de trabajo del usuario para este smoke.
- [ ] **Step 5:** Ejecutar pruebas y smoke nativo. Si la consola cerró, devolver `closed` y enlazar al registro histórico; no reanudar automáticamente. Windows puede limitar foreground: devolver el resultado real, no tratar ejecutar el helper como prueba de foco.

### Task 5: Historial persistente y gato mensajero al abrir la primera consola

**Files:** Create `src/history.ts`, `src/bridge/worker.ts`, `tests/history.test.ts`. Modify protocolo/extensión solo donde sea necesario para metadatos.

**Interfaces:** Produce y posee `Conversation`. `openHistory(path: string): HistoryStore` ofrece `upsert(conversation: Conversation): void`, `listRecent(now: Date): ConversationRecord[]`, `reconcileConsoles(snapshot: ConsoleSnapshot): Briefing | null`, `markBriefed(id: string): boolean` y `close(): void`. `ConsoleSnapshot` tiene `complete: boolean` y consolas con identidad de instancia/generación/sesión y kind main/subagent; `Briefing` tiene ID de evento y consola destinataria. `ConversationRecord` añade estado saved/missing/ephemeral. `importSessionMetadata(roots: string[], store: HistoryStore): Promise<void>` recupera metadatos guardados sin leer credenciales. Exportar tipos con nombre. Auxiliar Bun valida y expone estas consultas sin transcripciones.

- [ ] **Step 1:** Probar SQLite en directorio temporal: upsert y reapertura conservan proyecto/título/carpeta/sessionFile; reanudar mismo `(profile, sessionId)` no duplica; perfiles distintos no colisionan; un cierre abrupto sin callback conserva lo registrado antes; lectura desde sesiones guardadas recupera actividad con oficina cerrada.
- [ ] **Step 2:** Probar ventana móvil exacta de siete días (incluido límite y excluido 1 ms anterior/futuro), orden descendente y deduplicación. Probar cero→A visita, A→A no, A→A+B no, A+B→B no, B→cero→C visita otra vez aunque sea el mismo día. Un subagente no cuenta; inventario incompleto/reconexión no rearma el ciclo. Reabrir el catálogo con las mismas consolas vivas no repite visita presentada. No usar fecha diaria como guardia.
- [ ] **Step 3:** Probar conversación sin título usa ID, sesión efímera se marca no persistida, archivo ausente se muestra no disponible y catálogo corrupto informa del error sin borrar historiales de omp. Nada ejecuta instrucciones contenidas en nombres/títulos/rutas.
- [ ] **Step 4:** Ejecutar `bun test tests/history.test.ts` y observar RED. Implementar SQLite con clave `(profile, sessionId)`, fechas ISO/instantes para consulta y estado de inventario/ID de visita presentado, sin fecha diaria limitante; transacciones y WAL. No ORM, servidor ni copia de transcripciones.
- [ ] **Step 5:** Importar metadatos de perfiles incorporados y referencias publicadas por la extensión. Reutilizar el lector versionado de sesiones de omp si es adecuado; si se usa JSONL, leer incrementalmente cabecera/nombre/fechas, sin cargar líneas enormes completas en la interfaz ni llamar modelos para títulos. Los archivos de omp se abren solo para lectura.
- [ ] **Step 6:** Ejecutar pruebas y smoke real con una conversación propia guardada: cerrar consola y reabrir catálogo conserva carpeta; observar el listado reciente ordenado y dos ciclos de primera consola sin cambiar el reloj. Actualizar README/changelog con ventana móvil y sesiones sin historial.

### Task 6: Escena cozy, entregas, escalado y mensajero de primera consola

**Files:** Create `src/office/{scene,sprites}.ts`, `tests/scene.test.ts`, `assets/{nter-logo.png,notification.wav}`.

**Interfaces:** Consumes `OfficeState`, resumen de `HistoryStore`, `arriveAtTable`. Produces `createScene(canvas: HTMLCanvasElement, handlers: { onArrival(ref: AgentRef): void; onSelect(ref: AgentRef): void; onBriefing(): void }): SceneController`; `SceneController` tiene `update(state: OfficeState): void`, `offerBriefing(): void`, `setVisible(visible: boolean): void`, `dispose(): void`. Exportar `computeLayout(projectCount: number, viewport: { width: number; height: number }): SceneLayout` e `hitTest(layout: SceneLayout, point: { x: number; y: number }): AgentRef | 'briefing' | null`.

- [ ] **Step 1:** Probar layout para 1, 7 y 20 proyectos: misma escala X/Y, golden dentro, hit testing tras DPI y aviso legible. Registro duplicado no duplica entrega; visita de primera consola no reemplaza un agente real ni ocupa silla.
- [ ] **Step 2:** Ejecutar `bun test tests/scene.test.ts` y observar RED. Implementar arte original con Canvas sin suavizado: gatos diversos, ratones, golden, uniformes aprobados y logo real. Copiar PNG/WAV aprobados de `.superpowers/brainstorm/office-design/content/{nter-logo.png,system-bell.wav}`, no volver a extraer prompts base64.
- [ ] **Step 3:** Dibujar descanso con pila blanca; primer gato recoge/arrastra/coloca mesa y entra en cola. Otro gato del mismo proyecto va a la existente. Si desaparece el transportista, reasignar la misma reserva a otro gato vivo, no duplicar mesa. Animación jamás bloquea trabajo de modelo.
- [ ] **Step 4:** Mantener gatos centrales respecto a ratones/golden, silla gris y café al quedar libres. Velocidad común de referencia `85` unidades de escena/segundo, delta monotónico acotado y animación pausada al minimizar. Escalar mobiliario/personajes juntos sin variar altura; avisos DOM mantienen legibilidad.
- [ ] **Step 5:** `offerBriefing()` genera un gato mensajero de presentación claramente distinto del inventario de agentes. Va al golden con aviso clicable del resumen; el click llama `onBriefing`, que abre proyecto · conversación · carpeta. No inventar un agente omp ni enviar tareas para esta visita.
- [ ] **Step 6:** Ejecutar pruebas y observar navegador con entregas, FIFO, café, veinte proyectos y dos visitas por dos ciclos cero→una consola en el mismo día. Capturar prueba visual; no convertir los HTML de boceto en módulos productivos ni borrarlos.

### Task 7: Ventana Windows, fichas, historial y avisos reales

**Files:** Create `src/{main,preload,renderer}.ts`, `src/{index.html,style.css}`, `assets/app.ico`, `scripts/{build,smoke-office}.ts`. Modify `package.json`.

**Interfaces:** Consumes puente, estado, escena, `focusSession` e historial. Preload produce exclusivamente `window.office` con `snapshot(): Promise<OfficeState>`, `subscribe(listener): () => void`, `send(command: OfficeCommand): Promise<CommandResult>`, `focusSession(ref: AgentRef): Promise<FocusResult>`, `history(): Promise<Conversation[]>`, `showFolder(profile: string, sessionId: string): Promise<void>`, `minimize(): void` y `setMuted(muted: boolean): void`. Exportar `FocusResult` de `src/terminal.ts`; renderer nunca recibe IPC crudo, tokens ni métodos shell.

- [ ] **Step 1:** Build Electron/renderer/preload y auxiliar Bun empaquetado. Ventana local sin marco, sandbox/contextIsolation activados, nodeIntegration desactivado y navegación/ventanas externas bloqueadas. Icono y entrada en barra (`skipTaskbar: false`).
- [ ] **Step 2:** Usar `workArea` en DIP: ancho completo, `round(height / 3)`, anclada abajo y siempre encima. Controles minimizar/cerrar; al cambiar/quitar monitor recuperar ubicación válida. La ventana no se restaura por actividad ni petición.
- [ ] **Step 3:** Ficha con destino exacto, proyecto/sesión/modelo/actividad. Mensajes con steer/followUp y ACK real; selector de modelos disponibles con estado efectivo/pendiente/error; prevenir doble envío. Los controles de modelo/mensaje no son formularios de autorización humana.
- [ ] **Step 4:** Aviso grande «! Necesito tu decisión · Abrir consola», contador de pendientes y sonido WAV una vez por solicitud. `flashFrame(true)` sin show/restore/focus. El clic llama a `focusSession` de la sesión correcta (o raíz propietaria de la consola de un hijo). Resolver en omp retira el pendiente. Respetar silencio y reducción de movimiento.
- [ ] **Step 5:** Al recibir un inventario completo de consolas, llamar `reconcileConsoles`; ofrecer mensajero por cada nuevo `Briefing`, idempotente por su ID, y llamar `markBriefed` al presentarlo. La lista usa `listRecent` y columnas proyecto · conversación · carpeta más estado guardado. No limitar por fecha diaria. Abrir carpeta usa la ruta registrada; consola viva se activa, cerrada requiere reanudación explícita y comprobación de exclusión.
- [ ] **Step 6:** Mantener conexión/registro y audio/atención fuera del renderer animado al minimizar. Cerrar app cierra sus conexiones, no omp. Persistir solo catálogo/preferencias y datos privados necesarios. No repetir sonido por reconstruir escena o reabrir historial.
- [ ] **Step 7:** `bun run dev`, luego `bun scripts/smoke-office.ts` contra procesos propios: seleccionar agente, enviar tarea autorizada, minimizar, petición, clic a consola correcta, resumen al reiniciar y cierre de oficina sin matar anfitrión. Observar la superficie Windows real y guardar evidencia depurada.

### Task 8: Incorporación automática, instalación y paquete Windows

**Files:** Create `scripts/install-bridge.ts`, `tests/install.test.ts`, `README.md` si falta. Modify build/package/changelog.

**Interfaces:** Produce `planBridgeInstall(options: { packageDir: string; profile: string }): Promise<InstallPlan>`, `applyBridgeInstall(plan: InstallPlan): Promise<void>` y dry-run. `InstallPlan` nombra cambios/valores previos; reversiones retiran solo lo propio.

- [ ] **Step 1:** Escribir pruebas de conservación sobre perfiles temporales: mantener otras extensiones/configuración, instalación idempotente, retirada limitada a cambios propios, no sobrescribir cambio posterior del usuario y no tocar otro perfil. Comprobar que no se añade configuración Collab.
- [ ] **Step 2:** Ejecutar `bun test tests/install.test.ts` y observar RED. Implementar registro mediante mecanismos públicos de omp, rutas instaladas estables y lista explícita de perfiles incorporados. Nunca reemplazar el YAML completo ni tocar cuentas de otros usuarios.
- [ ] **Step 3:** Mostrar dry-run/diff exacto antes de configuración real; aplicar solo lo autorizado mediante la CLI pública o cfg con sus aprobaciones. La oficina detecta automáticamente nuevas sesiones tras cargar el puente. No reiniciar consolas ya abiertas; informar qué necesita reanudación por el usuario.
- [ ] **Step 4:** Empaquetar Electron, auxiliar, extensión, helper de foco y recursos para Windows x64. `bun run dist` produce directorio ejecutable e instalador sin Node/Bun global en destino. No cambiar políticas Windows ni afirmar firma sin certificado.
- [ ] **Step 5:** Probar ejecutable desde ruta con espacios: abrir dos terminales nuevas del mismo proyecto y otra distinta, observar mesas y sesiones; cerrar/reabrir conserva historial y no crea otros omp. Retirar puente de prueba y comprobar que otros ajustes se conservan.
- [ ] **Step 6:** README/changelog: perfiles, conexión local sin Collab, terminales compatibles, reanudación segura, últimos siete días, visita por cada primera consola, sesiones efímeras, minimización/avisos, retirada y versiones probadas.

### Task 9: Prueba end-to-end y revisión final de la aplicación completa

**Files:** Corregir archivos afectados; actualizar `docs/research/omp-bridge-gate.md`, README, changelog y ledger.

**Interfaces:** Consumes aplicación empaquetada y todos los módulos. Produces ejecutable real y evidencia de los diez criterios revisados del diseño, no una demo de agentes simulados.

- [ ] **Step 1:** Solicitar permiso específico para turno mínimo real de modelo/task, sin Collab ni uso de terminales de trabajo existentes. Ejercer raíz/hijo, parentesco, mensaje a destino y cambio seguro de modelo. No convertir evidencia de metadatos en prueba de control real.
- [ ] **Step 2:** Ejecutar `bun run typecheck && bun test` en una pasada integrada. Reparar fallos de comportamiento sin snapshots de redacción ni pruebas de source text. Pruebas de UI mediante app real, no una suite de mocks.
- [ ] **Step 3:** Dos sesiones del mismo proyecto y otra de otro: mesas correctas, gato transportista único, FIFO gatos/ratones, café y desconexión. Probar entrega interrumpida y siete/veinte proyectos sin cambio de altura; si hay ilegibilidad, enseñarla y acordar ajuste, no imponer un límite oculto.
- [ ] **Step 4:** Dos solicitudes simultáneas de mismo proyecto: sonido/exclamación/barra, minimizar sin restauración y cada clic selecciona su consola original; respuesta local retira solo el aviso correspondiente. Cerrar una consola antes del clic no lanza una copia del historial ni enfoca otra pestaña.
- [ ] **Step 5:** Cerrar consola bruscamente y reabrir oficina conserva proyecto/título/carpeta sin duplicados. Probar dos ciclos cero→una el mismo día: dos visitas; dos→una o reconexión: ninguna nueva. Simular fecha únicamente mediante `now` de consulta para límite de últimos siete días. Probar archivo ausente y sesión efímera.
- [ ] **Step 6:** Siempre encima, DPI/monitores disponibles, icono/atención sin robo de foco, silencio/reducción de movimiento, cierre oficina sin detener omp y reinstalación con preservación. Capturas sin contenidos sensibles.
- [ ] **Step 7:** Un revisor independiente revisa conjunto, identidad/seguridad IPC, rutas históricas, aislamiento renderer y foco de terminal. Resolver bloqueantes en una pasada RED→GREEN con suite final; registrar menores pendientes y rulings. No desplegar o publicar fuera del proyecto sin autorización.
- [ ] **Step 8:** Entregar rutas del ejecutable/instalador, instrucciones y solo verificaciones ejercidas. Nombrar lo no observado (otra cuenta Windows, monitor físico extra, firma). No declarar completa la app mientras falten navegación, control real o persistencia exigidos.

## Secuencia y autorrevisión

Tarea 1→2; Tarea 3 consume 2; Tareas 4 y 5 consumen identidad/metadatos de 2; Tarea 6 consume estado de 3 e historial de 5; Tarea 7 integra 2–6; Tarea 8 empaqueta/incorpora y Tarea 9 valida todo. El usuario ha elegido implementación directa: no subagentes implementadores ni revisiones por tarea, solo una revisión independiente final.

Cobertura revisada: puente/modelos/mensajes/hijos en 1–2/9; mesas/FIFO/estados en 3; consola original en 4/7/9; historial móvil de siete días y visita por ciclo en 5/7/9; escena/entregas/mensajero en 6; ventana/avisos en 7; incorporación en 8. Cada Review Focus tiene dueño y prueba. No hay acción answer, relay, formulario remoto o límite diario contradictorio.

Este plan sustituye las reglas anteriores de Collab, semana calendario y visita diaria. La corrección expresa del usuario se aplica manteniendo la ejecución directa elegida. Las casillas sin marcar son trabajo pendiente; el ledger conserva pruebas históricas sin convertirlas en evidencia de la aplicación completa.
