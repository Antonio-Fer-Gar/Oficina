# Actualización e identidad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Actualizar la oficina que utiliza el usuario después de cada cambio verificado e identificar proyectos, agentes y modelos en la escena.

**Architecture:** Conservar Electron, Bun y Canvas. Un comando de actualización valida, compila y despliega en el destino publicado por launcher.json; la skill local obliga a ejecutarlo al finalizar cambios. La escena conserva prioridad de personajes frente a mesas y dibuja el modelo efectivo publicado por el puente.

**Tech Stack:** TypeScript, Bun, Electron, PowerShell para procesos Windows.

**Spec:** Propuesta aprobada en la conversación: actualización al finalizar, mesas/proyectos, gatos/agentes, ratones/subagentes e iconos Opus/pulpo, Sol/sol, Luna/luna; otros modelos con nombre abreviado.

## Global Constraints
- Conservar preferencias, historial y sesiones de omp; reiniciar exclusivamente la oficina.
- Fallo de validación o compilación impide desplegar.
- No mostrar el modelo pendiente como efectivo ni inventar modelos desconocidos.
- Sin dependencias nuevas ni vigilancia que reinicie por archivo guardado.

## Review Focus
- Destino real: distinguir instalación empaquetada de ejecución desde fuentes.
- PID ajeno o reciclado: verificar ruta antes de cerrar.
- Mesa y personaje superpuestos: seleccionar personaje primero.
- Zoom y escalado: seleccionar mesa usando coordenadas del mundo.
- Modelos sin metadatos e iconos junto a avisos: mostrar estado desconocido y evitar colisiones.

### Task 1: Actualización y skill
**Files:** scripts/update.ts, package.json, .agents/skills/updating-installed-office/SKILL.md, AGENTS.md.
- [x] Identificar destino real con launcher y registro de instalación.
- [x] Crear comando que compruebe tipos y pruebas, compile y despliegue sin tocar datos ni consolas.
- [x] Comprobar ruta/PID, cierre exclusivo, reapertura y archivo compilado desplegado.
- [x] Documentar el disparador obligatorio en skill e instrucciones de proyecto.

### Task 2: Identidad e iconos
**Files:** src/office/scene.ts, src/office/sprites.ts, src/renderer.ts, src/index.html, tests/scene.test.ts.
- [x] Añadir comprobación de selección de mesas escaladas y prioridad de personajes.
- [x] Añadir panel de proyecto y etiquetas Agente/Subagente.
- [x] Dibujar iconos pixel-art Opus/Sol/Luna con abreviatura para otros modelos y estado desconocido.
- [x] Ejercer clics e iconos en superficie real, incluido cambio de modelo.

### Task 3: Entrega
- [x] Ejecutar pruebas, tipos, compilación y smoke visual.
- [x] Actualizar README y CHANGELOG.
- [x] Ejecutar actualización sobre destino real y observar oficina reabierta conservando datos.

## Evidencia
- `bun run update:installed`: 31 pruebas correctas, tipos y compilación correctos, instalador aplicado, SHA256 del paquete instalado igual al generado y lanzador publicado desde la instalación.
- Smoke Canvas/DOM: fichas de mesa/gato/rata; modelo Sol cambiado a Luna y a desconocido; aviso «!» separado; sin errores de navegador. Datos controlados para cubrir modelos distintos.
- Ventana instalada real observada y respondiendo con distintivos Sol de las sesiones vivas.
- Preferencias conservadas con el mismo SHA256. El historial conserva 43 conversaciones, 37 anteriores al día de la actualización y con registros desde el 2 de octubre; su SHA256 cambia al seguir registrando actividad de las sesiones vivas.
- `loadSkills({cwd})` descubre `updating-installed-office` como `agents:project`, sin advertencias.
- Decisión: mantener trabajo en el directorio actual y actualizar exclusivamente la instalación del usuario; no publicar paquetes remotamente.
- Segunda actualización de la instalación abierta comprobada: corregida la salida falsa de PowerShell al desaparecer auxiliares durante el cierre; `exit 0` solo tras completar el cierre, sin ocultar excepciones.
