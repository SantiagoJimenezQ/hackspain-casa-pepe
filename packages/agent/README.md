# Agente de coordinación

Responsable: frente de agente e integraciones.

Esta carpeta contendrá la lógica de decisión, las instrucciones del agente, la planificación y la adaptación.

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

Primera entrega: un ciclo de decisión completo y una prueba donde dos condiciones distintas produzcan acciones diferentes. Definir límites de pasos, tiempos de espera y tratamiento de errores.
