# Interfaz de operaciones

Responsable: frente de UI.

Aquí irá la aplicación Next.js. Esta carpeta todavía no contiene una aplicación ejecutable.

## Alcance

- Resumen del incidente y consecuencias para el negocio.
- Servicios afectados y recursos disponibles.
- Plan actual, responsables y cambios respecto al plan anterior.
- Actividad en directo, con estados de ejecución y errores.
- Aprobación y rechazo de acciones.
- Controles separados para iniciar, modificar y reiniciar la demo.

## Integración

Consumir la API de `apps/server/` y los formatos acordados en `packages/contracts/`. Los datos de ejemplo deben respetar esos mismos formatos. No incluir credenciales ni importar implementaciones de herramientas en el navegador.

Primera entrega: una pantalla funcional con datos de ejemplo y estados de carga, fallo y espera de aprobación. Después, sustituir la fuente de datos por la API sin cambiar el modelo de la pantalla.
