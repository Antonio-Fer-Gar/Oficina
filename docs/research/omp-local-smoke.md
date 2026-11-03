# Comprobación local de integración con omp

Fecha: 2026-10-28. Investigación de solo lectura y proceso RPC propio efímero. No se enviaron prompts ni se ejecutaron turnos de modelo. No se habilitó Collab ni se modificó la configuración de omp.

## Instalación observada

Ejecutable: `%LOCALAPPDATA%/omp/omp.exe`.

Comando `--version`: `omp/18.13.2`.

La ayuda local reconoce `--mode rpc`, `--mode rpc-ui`, `--no-ui`, `--no-session`, `--no-extensions`, `--extension`, `collab list --json` y `collab link`.

## Descubrimiento de sesiones existentes

Comando ejecutado:

```text
omp.exe collab list --json
```

Resultado:

```json
{"version":1,"hosts":[]}
```

Una consulta Windows `Get-CimInstance Win32_Process -Filter "Name='omp.exe'"` devolvió doce procesos. No se consultaron argumentos ni credenciales. Esta cifra **no es el número de sesiones ni de agentes**: el mismo ejecutable puede ejecutar procesos auxiliares y subprocesos. La consulta demuestra presencia de procesos, no su estado de trabajo o capacidad de control.

Conclusión local: no había anfitriones Collab publicados y descubribles en el momento de la comprobación. No se ha demostrado acceso externo a las sesiones interactivas ya abiertas.

## Smoke RPC sin inferencia

Se abrió un subproceso nuevo y propio con:

```text
omp.exe --mode rpc --no-session --no-extensions --no-ui
```

Tras recibir `ready`, se enviaron exclusivamente:

```json
{"id":"state","type":"get_state"}
{"id":"children","type":"get_subagents"}
```

Resultados observados:

- `ready.protocolVersion`: `1`.
- `ready.supportedProtocolVersions`: `[1,2]`.
- `ready.maxFrameBytes`: `1048576`.
- `ready.maxReassembledFrameBytes`: `67108864`.
- `get_state`: `success: true`.
- `get_subagents`: `success: true`, `data: {"subagents":[]}`.
- Se cerró stdin; el proceso terminó con código `0` y stderr vacío.

El estado incluyó `model`, `sessionId`, `isStreaming`, `isCompacting`, `hasPendingAsyncWork`, `isSettled`, `queuedMessages`, `messageCount` y otros campos. No se conserva aquí el prompt de sistema ni el contenido de la sesión efímera.

Esto prueba el transporte y la consulta de estado de un proceso controlado por la aplicación. **No prueba adjunción a otro proceso, lanzamiento de tareas reales, cambio efectivo de modelo o intervención humana end-to-end.**

## Referencias primarias

- [RPC: proceso propiedad del host, JSONL y comandos públicos](https://omp.sh/docs/rpc).
- [Collab: sesiones existentes, permisos y necesidad de habilitar publicación](https://omp.sh/docs/collab).
- [Extensiones: carga al inicio, API y ausencia de hot reload](https://omp.sh/docs/extension-authoring).

Las páginas web pueden reflejar una revisión posterior a 18.13.2. Los resultados de comandos anteriores corresponden al ejecutable local verificado.
