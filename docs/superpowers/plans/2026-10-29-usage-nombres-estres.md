# Usage, nombres y estrés Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans for the integration and independent scoped tasks for usage and dog artwork.

**Goal:** Perro seleccionable con `/usage`, nombres visuales editables y persistentes para gatos/mesas, gatos asignados en cada mesa y estrés visual creciente con el trabajo simultáneo.

**Architecture:** Reutilizar fichas DOM, preferencias Electron y render Canvas. Consultar usage mediante el comando oficial local de omp, sin credenciales en el renderer. Los alias son visuales: no cambian carpetas ni títulos reales de las conversaciones. Clave de gato: perfil+sesión+agente; mesa: ruta normalizada de proyecto. La actividad publicada por el puente controla el enrojecimiento del perro.

**Tech Stack:** TypeScript, Electron, Bun, Canvas, Zod; sin dependencias nuevas.

**Spec:** Solicitudes y aclaración `/usage` de la conversación; los nombres se conservan al reiniciar. El color vuelve al normal al bajar la actividad; cuenta gatos y subagentes.

## Global Constraints
- Conservar historial, preferencias y sesiones de omp.
- Ningún token o lectura de credenciales en el renderer; API cerrada y texto seguro.
- Alias de longitud limitada; vacío restaura nombre original; cambiar un alias no altera otro agente/proyecto.
- No actualizar la instalación hasta comprobar el comportamiento.

## Review Focus
- Usage lento/fallido: estado de carga y error legible; no bloquear la oficina.
- Reinicio de oficina/reconexión: conservar alias por identidad estable, no por nombre asignado ni índice.
- Refresco de inventario: conservar edición sin sobrescribir lo que el usuario escribe.
- Mesa con varias sesiones y subagentes: listar solo gatos asignados y separar el recuento de ratas.
- Estrés: normal sin trabajo, progresivo con carga, saturado sin desbordamiento; ropa y raza conservadas.

### 1. Usage
- [x] Implementar `fetchUsage(): Promise<UsageResult>` en `src/usage.ts` usando el comando oficial de omp.
- [x] Integrar API cerrada main/preload y ficha del perro con refresco y estados de carga/error.
- [x] Ejecutar consulta real y comprobar datos y error legible cuando no existe omp.

### 2. Nombres y miembros
- [x] Persistir alias visuales en preferencias sin reemplazar campos existentes.
- [x] Editar/restaurar nombres desde gato y mesa, actualizar escena y fichas.
- [x] Listar gatos de la mesa por nombre personalizado y permitir abrir su ficha.
- [x] Comprobar conservación al recargar, aislamiento y actualización del inventario.

### 3. Estrés
- [x] Dibujar enrojecimiento progresivo de cabeza/orejas del perro manteniendo raza y ropa.
- [x] Derivar carga de agentes activos con las reglas existentes, incluir subagentes y excluir espera humana/desconectados.
- [x] Comprobar niveles sin actividad, actividad moderada y alta, y descenso posterior.

### 4. Entrega
- [x] Comprobar tipos, suite, smoke visual y usage real.
- [x] Actualizar README/CHANGELOG y ejecutar `update:installed`.
- [x] Observar proceso instalado y comprobar conservación de datos.

### 5. Sala de espera (solicitud añadida durante la implementación)
- [x] Reservar tamaño base independiente de la escala de mesas.
- [x] Ensanchar el espacio antes de la primera mesa cuando crece la población en descanso.
- [x] Proyección y selección coherentes, transición continua al andar entre ambas zonas y perro visible.
- [x] Comprobar 1/7/20 mesas, selección de residentes y separación de la primera mesa con veinte agentes libres.

## Evidencia previa al despliegue
- 37 pruebas correctas; tipos y compilación correctos.
- Electron real, API preload e IPC reales con inventario controlado en un canal local y preferencias temporales: consulta real de `/usage`, guardado/restauración de alias, persistencia tras recargar, edición conservada durante inventario y lista exacta de dos gatos más un subagente.
- Headless con el renderizador real: enrojecimiento creciente a 0/1/8 activos y descenso, sala grande con veinte mesas y selección de sus residentes; sin errores de navegador.
- Dos revisiones independientes sin bloqueantes; corregido que el error de un guardado anterior pudiera aparecer sobre otra ficha. Los errores de IPC conservan el detalle técnico de Electron.
- Decisión: alias de gatos por perfil y conversación; mesas por carpeta normalizada. Los alias no cambian el proyecto ni la conversación reales.
- Decisión: la sala conserva tamaño base y puede crecer; su reserva visible se limita al 75% de la anchura para no expulsar las mesas y al perro de la ventana.
- Temporales y oficina de prueba aislada retirados; no se usaron sesiones de trabajo reales para enviar mensajes o cambiar nombres.
- Despliegue final: 37 pruebas correctas, tipos y compilación correctos; instalación reabierta desde `%LOCALAPPDATA%\\Programs\\Oficina nter\\Oficina nter.exe`, respondiendo. Paquete instalado verificado por SHA256. Preferencias previas conservadas y las 45 conversaciones anteriores siguen presentes.
