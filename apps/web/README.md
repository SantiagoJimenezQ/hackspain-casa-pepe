# Interfaz de operaciones

Responsable: frente de UI.

Dashboard de operaciones de Casa Pepe. Primera entrega: **Visión general** con datos de ejemplo, mapa de centros de datos y un panel de demo oculto.

## Comandos

Desde la raíz del repositorio:

```bash
pnpm install
pnpm dev
```

O solo esta app:

```bash
pnpm --filter web dev
pnpm --filter web test
```

La interfaz queda en [http://localhost:3000](http://localhost:3000).

## Alcance actual

- Resumen del incidente y consecuencias para el negocio.
- Mapa de España con nodos y enlaces verde / ámbar / rojo.
- Plan del agente, empresas afectadas, migración e infraestructura.
- Controles de demo (botón Demo o tecla `D`) para reiniciar, ciclar estados y avanzar el agente.

Pendiente cuando exista `apps/server/`: sustituir el snapshot mock por la API y los eventos en directo, sin reescribir las tarjetas.

## Integración

Consumir la API de `apps/server/` y los formatos acordados en `packages/contracts/`. Los datos de ejemplo viven ahora en `src/lib/mock-snapshot.ts` y deben alinearse con esos contratos. No incluir credenciales ni importar implementaciones de herramientas en el navegador.
