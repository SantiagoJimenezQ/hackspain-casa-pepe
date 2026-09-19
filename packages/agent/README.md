# Agente de coordinación

Responsable: frente de agente e integraciones.

La implementación runtime vive en `apps/server/src/agent`. Esta carpeta conserva el límite de responsabilidad y la documentación del frente de agente; no inicia un segundo agente ni otro backend.

## Alcance

- Recoger evidencias y reconocer información pendiente de confirmar.
- Priorizar según impacto, dependencias y recursos disponibles.
- Seleccionar herramientas y procesar sus resultados.
- Solicitar aprobación cuando corresponda.
- Revisar el plan ante información nueva e invalidar acciones obsoletas.
- Comprobar la recuperación antes de comunicar éxito.
- Publicar explicaciones breves, basadas en evidencias, para el operador.

## Integración

Consumir los contratos compartidos y las interfaces de herramientas. Mantener los detalles de HappyRobot y de otros proveedores en `packages/tools/`. El servidor gestiona el transporte y la continuidad de la ejecución.

La implementación actual incluye un ciclo de decisión completo, planificación determinista basada en impacto/dependencias/capacidad, límites de ciclos y pasos, timeouts, reintentos, aprobaciones y replanning ante cambios de condiciones. Las integraciones concretas permanecen detrás de los adaptadores del servidor.
