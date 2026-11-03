# Integración de la oficina con omp: conclusiones

Investigación: 2026-10-28. No se ha implementado ni instalado el puente. Los bocetos siguen utilizando datos simulados.

## Evidencia local

- omp instalado: **18.13.2**.
- `omp collab list --json` devolvió `{"version":1,"hosts":[]}`. No hay sesiones Collab publicadas descubribles en esta comprobación.
- Smoke de un proceso RPC propio efímero: `ready`, `get_state` y `get_subagents` correctos; cierre con código 0 y sin stderr. No se enviaron prompts ni se hicieron llamadas al modelo.
- Los procesos Windows y los archivos de historial no son por sí mismos un inventario fiable de agentes activos ni un canal para controlarlos.

Detalle reproducible: [comprobación local](./omp-local-smoke.md).

## Lo que permiten las superficies existentes

### RPC / RPC-UI

La aplicación arranca y controla un proceso omp propio mediante JSONL por stdin/stdout. Hay comandos de estado, mensajes, cambio de modelo, subagentes y puente de peticiones de interfaz. **No es una API para adjuntarse a una terminal independiente ya abierta**. Abrir un historial significa cargarlo en la sesión propiedad del host, no controlar su proceso original. No deben ejecutarse dos dueños sobre el mismo historial activo.

Fuentes: [RPC](https://omp.sh/docs/rpc), [SDK](https://omp.sh/docs/sdk).

### Collab

Permite observar/controlar una sesión interactiva existente si esta publica una sala. Separa acceso de lectura y control. Los invitados con control pueden enviar mensajes, actuar sobre subagentes y responder preguntas/solicitudes compatibles. El cambio de modelo del anfitrión permanece reservado al anfitrión; Collab solo no cumple todos los controles solicitados.

El descubrimiento local usa metadatos/IPC; el tráfico compartido usa el relay de Collab, cifrado de extremo a extremo. No debe confundirse descubrimiento local con transporte completamente local. Los enlaces son secretos con permisos y no deben aparecer en registros o capturas.

Fuentes: [Collab](https://omp.sh/docs/collab), [análisis con fuentes fijadas](./omp-control-protocols.md).

### Extensión precargada

Una extensión puede observar eventos y usar acciones de la sesión en la que está cargada (`sendUserMessage`, `setModel`, etc.). Las instancias hijas tienen su propio contexto. [INFERENCE] Un adaptador dirigido por identidad permitiría un puente propio para agentes y subagentes, pero no es un servicio de adjunción preexistente ni se ha probado end-to-end.

Las fábricas se cargan al iniciar la sesión; instalar un módulo no lo inyecta automáticamente en procesos ya abiertos. Las notificaciones de aprobación por sí solas no equivalen a una API pública para resolver una aprobación nativa pendiente. El puente externo de decisión ya existente es Collab; RPC-UI cubre el caso de procesos propiedad de la app. Cualquier puente personalizado adicional necesita demostrar el recorrido real de una decisión, no fingirlo con mensajes de texto.

Fuentes: [extensiones](https://omp.sh/docs/extension-authoring), [análisis de observabilidad](./omp-agent-observability.md).

## Dos enfoques para elegir antes de diseñar

1. **Conservar omp en terminal: extensión precargada + Collab para intervenciones.** Mantiene el flujo habitual; requiere registrar cada sesión y cargar la extensión al iniciar/reiniciar. El puente de modelo/estado es propio y las decisiones usan el transporte de Collab. Más integración, y debe aceptarse el relay cifrado.
2. **La oficina inicia/reanuda y gestiona omp por RPC-UI.** Control local más directo y una única superficie para estado/modelo/intervención. Cambia el flujo de arranque: las sesiones controladas nacen en la oficina; no toma posesión de terminales independientes ya abiertas. Las sesiones existentes solo se migrarían mediante un cierre/reanudación deliberado, sin duplicar el proceso que las ejecuta.

RPC `set_model` afecta a la sesión principal, no cambia retroactivamente el modelo de un subagente activo. Si se necesita cambiar también el modelo de un ratón ya lanzado, hará falta el adaptador de extensión por instancia; no hay un comando RPC `set_subagent_model` verificado.

No se ha elegido ninguno por el usuario. No se ha reducido el requisito de observar todos los agentes; su cumplimiento requiere incorporar explícitamente todas las sesiones al enfoque elegido. Ambos caminos necesitan una prueba end-to-end de tareas, modelo e intervención antes de afirmar que están integrados.

## Semántica visual que debe conservarse

- Proyecto agrupado por directorio normalizado: varias sesiones de un proyecto comparten mesa, sin fusionar sus historiales.
- Una silla y espera por orden de llegada; liberarla al ir al café o ausentarse.
- Gatos = agentes; ratones = subagentes; golden = usuario. La relación real padre-hijo debe conservarse.
- No tomar `busy: false` como única prueba de finalización: pueden quedar subagentes, colas o trabajos asíncronos.
- La ida del ratón al gato representa una consulta real. Solo una petición de decisión humana real provoca aviso al usuario; la animación no debe enviar prompts nuevos ni decidir permisos por su cuenta.
- Minimizar no detiene los procesos; la interfaz permanece arriba cuando está visible. Aviso sonoro y solicitud de atención en la barra de tareas sin robar foco.
