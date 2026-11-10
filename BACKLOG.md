# Backlog

## Completado en los cambios actuales

- [x] Quitar el mensajero que aparece al abrir la aplicación para traer el historial.
- [x] Al instalar la oficina, instalar también omp si todavía no está instalado.
- [x] Abrir y leer conversaciones desde la oficina; las sesiones cerradas se reanudan en consola para evitar duplicar escritores.
- [x] Actualizar omp automáticamente, sin aviso, con opción para desactivarlo en Ajustes. Se pospone mientras haya procesos de omp o no se pueda verificar el origen de la instalación.
- [x] Mejorar la legibilidad de la ventana para leer la conversación y escribir mensajes al agente.
- [x] Adaptar correctamente toda la oficina cuando la ventana esté maximizada.

## Bocadillos de actividad para agentes y subagentes

**Estado:** completado; las sesiones ya abiertas cargarán el puente actualizado cuando se reinicien.

**Objetivo:** mostrar viñetas como si cada agente o subagente hablase mientras trabaja, con mensajes muy breves, concretos y descriptivos de su actividad real.

- [x] Obtener descripciones a partir del nombre y los argumentos de las herramientas, sin inventar acciones ni exponer comandos completos, secretos o contenido de archivos.
- [x] Mostrar frases clave como «Edito renderer.ts», «Busco referencias» o «Ejecuto pruebas», actualizadas al cambiar de actividad.
- [x] Identificar la skill utilizada y mostrar su nombre en el bocadillo.
- [x] Aplicar el comportamiento tanto a agentes como a subagentes y a los temas Robots y Animales.
- [x] Dibujar bocadillos legibles junto al personaje correspondiente, evitando tapar nombres, distintivos y otros bocadillos.
- [x] Retirar el bocadillo al dejar de trabajar; conservar brevemente las acciones rápidas para que puedan leerse.
- [x] Verificar actividades simultáneas, cambios de herramienta, skills, reposo y movimiento reducido.
- [x] Comprobar visualmente la escena y actualizar la aplicación instalada; actualizar el puente propio si cambian los datos publicados, sin reiniciar sesiones ni borrar preferencias o historial.


## Completado

- [x] Mantener visible el botón de cerrar de las ventanas internas al desplazarse, para distinguirlo del cierre de la aplicación.
- [x] Utilizar negritas para mejorar la legibilidad de los mensajes de las preguntas.

## Modo de ahorro de tokens para omp

**Estado:** completado.

- [x] Añadir a los ajustes de la oficina un modo de ahorro conservador, activado por defecto y desactivable.
- [x] Incorporar instrucciones Markdown breves para lectura selectiva y respuestas concisas sin omitir comprobaciones importantes.
- [x] Recomendar delegación selectiva y resultados resumidos para subagentes.
- [x] Respetar perfiles e instrucciones existentes; comprobar el puente en una sesión aislada de omp.
- [x] Documentar una comparación con y sin el modo, distinguiendo consumo real de estimaciones.
- [x] Verificar el comportamiento y actualizar la aplicación instalada y el puente propio.
