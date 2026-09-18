# Casa Pepe

Our project for the HackSpain hackathon.

## Organización del repositorio

[MASTER.md](MASTER.md) recoge el alcance y el reparto del trabajo. [AGENTS.md](AGENTS.md) contiene la guía del reto para los asistentes de desarrollo.

Usaremos una estructura de monorepo, con Next.js como propuesta para la interfaz. Cada frente tiene su carpeta y comparte los contratos de integración. Por ahora solo existe la estructura documental: todavía no hay aplicaciones ejecutables, dependencias ni comandos de arranque.

```text
apps/
  web/                 Interfaz de operaciones (Next.js previsto)
  server/              API, eventos y proceso de ejecución
packages/
  contracts/           Contratos compartidos y ejemplos de mensajes
  harness/             Simulación, escenarios y reinicio
  agent/               Decisiones, planificación y adaptación
  tools/               HappyRobot y adaptadores de ejecución
demo/                  Guion, ensayos y presentación
```

| Frente | Carpetas principales | Primera entrega |
|---|---|---|
| UI | `apps/web/` | Pantalla con datos de ejemplo del contrato común |
| Harness y backend | `packages/harness/`, `apps/server/` | Escenario reiniciable y eventos para la UI |
| Agente e integraciones | `packages/agent/`, `packages/tools/` | Decisión, llamada y acción verificable |
| Integración y demo | `demo/`, coordinación de `packages/contracts/` | Recorrido completo y repetible |

## Cómo encajan las piezas

La UI consume la API y sus eventos. El servidor conecta el harness, el agente y las herramientas. El harness mantiene el estado de la simulación. El agente decide a partir de ese estado y de los resultados de las herramientas. Los adaptadores ejecutan las acciones y devuelven resultados al servidor.

La UI no importa implementaciones del agente, del harness ni de las herramientas. Todos utilizan los contratos acordados en `packages/contracts/`. Las credenciales y las integraciones externas permanecen en el servidor.

Next.js cubre la interfaz. El proceso que espera llamadas, aprobaciones y nuevos eventos tiene su espacio en `apps/server/`, para poder ejecutarse de forma independiente. No necesitamos un despliegue distinto para cada paquete.

## Acuerdos de colaboración

1. Cerrar primero los contratos y un escenario mínimo entre los responsables de cada frente.
2. Trabajar en ramas cortas, por ejemplo `feat/ui-incident`, `feat/harness-events` o `feat/agent-replanning`, y abrir PR hacia `main`.
3. Avisar de cambios en contratos antes de integrarlos y actualizar los ejemplos junto con sus consumidores.
4. Coordinar los cambios de configuración raíz y mantener un único gestor de paquetes y su archivo de bloqueo cuando se inicialice el proyecto.
5. Integrar pronto el recorrido: evento, UI, propuesta, aprobación, acción y comprobación del resultado.
6. Documentar en cada carpeta sus comandos reales cuando exista implementación. Mantener las credenciales fuera del repositorio.
