# Prueba bloqueante del puente de la oficina

Fecha: 2026-10-28. Estado: **INCOMPLETA: pendiente de selección de consola original, catálogo persistente y control real de hijos**. El usuario ha sustituido las respuestas remotas por abrir la consola que pregunta; Collab ya no es un prerrequisito ni se activará. Las observaciones siguientes de la primera ejecución se conservan como evidencia histórica, no como código productivo completo.

## Entorno y alcance

- omp local: 18.13.2.
- Runtime de investigación: Bun 1.4.4 Windows x64, en `.superpowers/tools/bun-windows-x64/bun.exe`; no se modificó PATH global.
- ZIP oficial verificado contra SHA-256 de GitHub: `cd2c0fccc78f3ede1f50ca827a15f063eda13d4d150a3d0674f4f6e323d864a5`.
- Zod 4.6.7 instalado en el proyecto y fijado en `bun.lock` para validar frames externos.
- No se modificaron ajustes de omp, no se habilitó Collab y no se reinició ninguna terminal del usuario.

## Comando ejercido

```powershell
& '.\.superpowers\tools\bun-windows-x64\bun.exe' scripts/smoke-bridge.ts --no-model
```

El script genera una extensión temporal y abre un único proceso propio:

```text
omp.exe --mode rpc-ui --no-session --no-extensions --extension <extension-temporal>
```

Confirma que `/office-probe` está registrado antes de enviar ese comando local, para no convertir un nombre desconocido en un prompt de modelo. El comando presenta un selector real mediante `ctx.ui.select`; el cliente lo responde por `extension_ui_response` y la extensión registra la respuesta. El proceso y los archivos temporales se retiran al terminar.

## Resultados observados

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Salida del proceso propio | Correcta | exit 0; comando local finalizado; stderr vacío |
| Extensión e identidad raíz | Correcta | `ctx.agent.id = Main`, `kind = main`, cwd temporal, `hasUI = true` |
| Modelo público, sin cambio de proveedor/modelo | Correcta | `pi.setModel(ctx.model)` devolvió `true`; mismo modelo configurado |
| Estado/subagentes RPC | Correcta | `get_state.success = true`, `get_subagents.success = true` |
| Diálogo de extensión real | Correcta | Se recibió `extension_ui_request/select`; respuesta recibida por la extensión: `Close this isolated probe` |
| Sin turno de modelo | Correcta | No se observó `agent_start`; solo comandos locales/RPC |
| Adjunción a TUI mediante Collab | No ejecutada | Necesita sala de prueba autorizada. RPC-UI no prueba Collab. |
| Acciones dirigidas a un hijo y decisiones de este | No ejecutadas | Necesita task real y verificar la cobertura headless. |

El script termina con código **2** y `status: INCOMPLETE`, no con un PASS global. El subproceso omp termina limpiamente con código 0; son dos estados diferentes.

## Símbolos realmente ejercidos

- Factory de extensión explícita, `pi.on('session_start', ...)` y `pi.registerCommand(...)`.
- `ctx.agent`, `ctx.cwd`, `ctx.model`, `ctx.hasUI`.
- `pi.setModel(ctx.model)` en una sesión propia sin turno activo.
- `ctx.ui.select(...)` con respuesta desde el cliente RPC-UI.
- `get_state`, `get_subagents`, `get_available_commands`, comando local mediante `prompt`, `extension_ui_response` y cierre de stdin.

Esto **no** demuestra cambio de modelo de un hijo, envío de tareas a sesiones existentes, ni respuesta a aprobaciones nativas de hijos sin UI. Sigue vigente la limitación identificada en el diseño: no se ha encontrado un resolvedor público para una aprobación nativa ya pendiente en un hijo headless. No se ha sustituido por un mensaje diciendo «sí» ni se ha alterado la política de aprobación.

## Pruebas siguientes según el alcance revisado

Seleccionar la consola/pestaña exacta de dos sesiones propias, sin abrir otros omp ni usar terminales de trabajo ajenas. Construir y probar el catálogo local que conserva proyecto, conversación y carpeta, incluido cierre abrupto y semana local. Para verificar mensajes/modelos de un hijo, ejecutar un task real solo con permiso específico para el turno de modelo; no hace falta sala Collab.

La segunda ejecución del smoke usó un directorio temporal de sesiones persistentes y un custom entry sin turno de modelo. `getSessionFile()` devolvió ruta e ID, pero no existía el archivo: omp difiere la creación hasta `forceFileCreation`, archivo previo o mensaje assistant (`session-manager.ts:1615-1620`, v18.13.2). Esto es una condición documentada, no motivo para escribir un assistant falso. El catálogo debe distinguir metadatos registrados de conversación realmente guardada.

La selección de consola y las acciones dirigidas a hijos siguen NOT RUN. La fase sin modelo terminó con código 2 INCOMPLETE, y el proceso omp propio con código 0. No se publicó ninguna sala ni se modificó configuración global.

## Fuentes

- [Diseño aprobado](../superpowers/specs/2026-10-28-oficina-omp-design.md), especialmente §9.
- [Plan, Tarea 1](../superpowers/plans/2026-10-28-oficina-omp.md).
- [RPC oficial](https://omp.sh/docs/rpc).
- [Tipos de extensión 18.13.2](https://github.com/can1357/oh-my-pi/blob/v18.13.2/packages/coding-agent/src/extensibility/extensions/types.ts).
- [Release oficial Bun 1.4.4](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.4).
