# API y proceso de ejecución

Responsable: frente de harness y backend, en coordinación con agente e integraciones.

Aquí irá el proceso que conecta la interfaz, el harness, el agente y las herramientas. No hay servidor implementado todavía.

## Alcance

- Exponer el estado del incidente y las actualizaciones para la UI.
- Recibir controles de demo y decisiones del operador.
- Ejecutar el ciclo del agente y procesar resultados de herramientas.
- Recibir las respuestas asíncronas de integraciones como HappyRobot.
- Mantener la relación entre ejecución, evento, decisión, herramienta y aprobación.
- Gestionar tiempos de espera, cancelación y errores.

## Integración

Los contratos se acuerdan en `packages/contracts/`. La lógica de simulación pertenece a `packages/harness/`, la de decisión a `packages/agent/` y las integraciones a `packages/tools/`.

Al reiniciar una demo, los resultados tardíos de la ejecución anterior no deben modificar la nueva. Una aprobación debe corresponder a una acción y a una versión concreta del plan.

Primera entrega: iniciar una ejecución, consultar su estado, emitir un evento y recibir una aprobación desde la UI. Elegir el transporte de eventos y la persistencia al cerrar el contrato inicial.
