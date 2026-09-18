# Contratos compartidos

Responsabilidad compartida entre UI, backend y agente. Coordinar los cambios con los consumidores antes de integrarlos.

Esta carpeta contendrá los esquemas, tipos y ejemplos de intercambio. Los nombres siguientes son una propuesta pendiente de concretar, no una API implementada.

## Entidades iniciales

| Entidad | Contenido |
|---|---|
| `Incident` | Estado e impacto del incidente |
| `Service` | Salud y dependencias |
| `Resource` | Capacidad disponible y asignada |
| `PlanStep` | Acción, prioridad, responsable y estado |
| `ActivityEvent` | Identificador, fecha, tipo, origen y contenido |
| `ToolCall` | Parámetros, estado, resultado y error |
| `Approval` | Acción concreta, versión del plan y decisión del operador |

## Acuerdos que debemos cerrar primero

- Identificador de ejecución y correlación entre eventos y acciones.
- Formato del estado inicial y de las actualizaciones.
- Estados de herramientas: `pending`, `running`, `succeeded`, `failed` y, si se necesita, `cancelled`.
- Ciclo de una aprobación, incluida su invalidación cuando cambia el plan.
- Formato de errores y comportamiento ante mensajes duplicados.
- Interfaz para iniciar, introducir eventos y reiniciar el escenario.
- Ejemplos de un recorrido completo para desarrollar cada componente de forma independiente.

No introducir dependencias de UI, del harness ni de proveedores externos. Primera entrega: contrato mínimo revisado por los tres frentes y ejemplos coherentes con él.
