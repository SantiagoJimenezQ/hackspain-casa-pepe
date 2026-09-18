# Herramientas e integraciones

Responsable: frente de agente e integraciones, con apoyo del responsable del harness.

Aquí irán las interfaces de herramientas y sus adaptadores, separando integraciones reales y simuladas.

## Herramientas propuestas

- `get_incident_state`: consultar el incidente.
- `get_service_health`: consultar servicios y dependencias.
- `get_recovery_capacity`: consultar recursos de respaldo.
- `contact_engineer`: llamada real con HappyRobot y recepción del resultado.
- `assign_task`: registrar una tarea y su responsable.
- `request_approval`: registrar la acción pendiente de decisión del operador.
- `execute_recovery`: ejecutar una acción en el entorno de pruebas.
- `verify_recovery`: comprobar el resultado mediante una consulta independiente.

## Integración

Definir entradas, salidas, errores y estados en coordinación con `packages/contracts/`. Las consultas simuladas delegan en el harness. El servidor conecta los adaptadores con sus dependencias y recibe las respuestas asíncronas.

Mantener credenciales en el servidor. Evitar acciones duplicadas y comprobar que la aprobación sigue siendo válida antes de ejecutar una acción que la requiera. No presentar una respuesta simulada como resultado de una integración real.

Primera entrega: interfaces acordadas y adaptadores de prueba, seguidos de una llamada real con HappyRobot y una recuperación verificable en el entorno de pruebas.
