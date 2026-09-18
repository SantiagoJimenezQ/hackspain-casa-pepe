# Harness y escenarios

Responsable: frente de harness y backend.

Esta carpeta contendrá el estado y las reglas del entorno simulado, los escenarios y sus datos de prueba.

## Alcance

- Estado de servicios, dependencias, recursos e impacto.
- Escenario inicial de caída regional de AWS provocada por un meteorito.
- Eventos que modifican las condiciones durante la ejecución.
- Resultados simulados coherentes con el estado y los recursos disponibles.
- Reinicio reproducible y registro de cambios.
- Casos de capacidad insuficiente, fallos y recuperación parcial.

## Límites

El harness controla el entorno. Las decisiones corresponden al agente. No codificar en el escenario la secuencia exacta de herramientas que el agente debe ejecutar.

Utilizar los contratos compartidos. Distinguir los resultados simulados de los que proceden de una acción real del entorno de pruebas. Los guiones de presentación pertenecen a `demo/`.

Primera entrega: escenario inicial, evento de caída, giro de capacidad y reinicio, con pruebas de las transiciones de estado y los límites de recursos.
