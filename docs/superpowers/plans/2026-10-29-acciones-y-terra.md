# Acciones visuales y Terra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans for integration; independent tasks own bridge activity and sprite artwork.

**Goal:** Mostrar acciones correspondientes a herramientas reales de agentes/subagentes y un planeta Tierra para Terra.

**Architecture:** El puente publica `activityKind` estructurado y registra herramientas activas por ID para no confundir finalizaciones en paralelo. La escena deriva accesorios del estado real; el pintor mantiene la pose frontal/sentada y dibuja objetos pixel-art con animación discreta. El modelo Terra añade una imagen de Tierra sin marco ni fondo.

**Tech Stack:** TypeScript, Zod, Bun, Electron y Canvas existentes; sin dependencias nuevas.

**Spec:** Solicitud de la conversación: leer/libro, buscar/lupa, parado/quieto y Terra/Tierra. Se incluyen escribir/lápiz, ejecutar/terminal y coordinación/notas como otras herramientas habituales.

## Global Constraints
- No adivinar acciones a partir del contenido de la conversación ni conservar una herramienta ya terminada.
- Espera humana, inactividad, detención y desconocido no muestran accesorios de trabajo.
- Caminar y transportar mesas tienen prioridad sobre los objetos; mantener el recorrido, sillas y sala de espera.
- Respetar reducción de movimiento y no tapar iconos de modelo ni avisos.
- Actualizar solamente el puente propio con su comprobación de propiedad. Las consolas existentes no se reinician automáticamente; las nuevas cargan la extensión actualizada.

## Review Focus
- Herramientas paralelas terminan fuera de orden sin dejar un libro/lupa obsoleto.
- Cambio de sesión y finalización limpian actividad anterior.
- Conexiones antiguas sin actividad estructurada muestran pose neutra, no una acción inventada.
- Objetos visibles en gatos y ratones tanto de frente como sentados de espaldas.
- Terra coincide por nombre/modelo completo y no por fragmentos de otra palabra.

### 1. Actividad
- [ ] Crear contrato compartido `ActivityKindSchema`, clasificador de herramientas y resolución por fase.
- [ ] Publicar actividad actual desde eventos del puente, con seguimiento por toolCallId.
- [ ] Comprobar lectura, búsqueda web, escritura, comandos, coordinación, fin, paralelismo e inactividad.

### 2. Dibujo
- [ ] Añadir libro, lupa, lápiz, terminal y notas con animación discreta; sin objetos de trabajo al estar parado.
- [ ] Mantener pose sentada, ropa, gafas, iconos de modelo y reducción de movimiento.
- [ ] Añadir Terra/Tierra transparente.

### 3. Integración y entrega
- [ ] Integrar actividad en escena y explicar las conexiones antiguas sin datos detallados.
- [ ] Comprobar visualmente acciones y transiciones de gatos/ratones; suite y tipos.
- [ ] Actualizar README/CHANGELOG, puente propio e instalación y conservar datos/sesiones.
