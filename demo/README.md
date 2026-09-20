# Integración, ensayos y presentación

Responsable: frente de integración y demo, con una persona encargada del recorrido completo.

Aquí guardaremos el guion, las instrucciones de ensayo, la presentación y los materiales de apoyo. El escenario ejecutable y sus controles pertenecen a `apps/server/` y están documentados en `apps/server/docs/API.md`.

## Primera demo integrada

1. Reiniciar el escenario.
2. Introducir la caída y mostrar su impacto en la UI.
3. Mostrar el plan del agente y una interacción real con HappyRobot.
4. Introducir una restricción que obligue a cambiar el plan.
5. Aprobar o rechazar una acción desde la interfaz.
6. Ejecutar la acción autorizada en el entorno de pruebas.
7. Comprobar el resultado y explicar lo que sigue pendiente.

## Preparación de la entrega

- Repartir los papeles de presentación y control de eventos.
- Documentar comandos de arranque y reinicio cuando existan.
- Ensayar fallos, tiempos de espera y respuestas alternativas.
- Preparar una reproducción de respaldo e identificarla como tal si se utiliza.
- Guardar mediciones reales de los ensayos, sin convertir objetivos en resultados.
- Revisar que la presentación diferencia simulación, integraciones reales y funcionalidades pendientes.

Referencia de alcance: [MASTER.md](../MASTER.md).

## Recorded demo: capacity, comparison and functional proof

1. Use the manual scenario. Set `AGENT_REQUIRE_OPERATOR_APPROVAL=true` when rehearsing a visible pending approval. For functional proof, start the HTTP recovery target and configure `RECOVERY_MODE=http` as described in `MVP-TOOLS.md`.
2. Start a new run and press **Probar servicio**. The HTTP demo environment starts unavailable for this run; keep the failed check as the before evidence.
3. Trigger the impact. While the first plan is awaiting approval and before capacity is allocated, open **Capacidad**, enter a reason, change Omán from **4** to **1** and press **Aplicar cambio**. Other resources are editable independently. The total cannot be lower than allocated capacity.
4. Once the agent revises the plan, open **Comparar planes**. Show the changed datacenter separately from the newly selected recovery resource, then the priorities, reasons and invalidated approval. This data survives a browser refresh.
5. Approve the current recovery action and wait for the routing service to recover. Press **Probar servicio** again; show the assigned route and previous failed check. The two latest checks are persisted per run.
6. Identify the HTTP target as a demo delivery application. Voice approvals retain their existing semantics; a call summary alone is not a new approval or a capacity report.
