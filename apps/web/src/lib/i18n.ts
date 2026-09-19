import type {
  AgentPhaseId,
  SectorId,
  SiteId,
} from "@/lib/dashboard-types";

export const LOCALES = ["es", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_STORAGE_KEY = "casa-pepe-locale";

export const localeTags: Record<Locale, string> = {
  es: "es-ES",
  en: "en-GB",
};

const es = {
  "nav.overview": "Visión general",
  "nav.incidents": "Incidentes",
  "nav.migration": "Migración",
  "nav.companies": "Empresas",
  "nav.infrastructure": "Infraestructura",
  "nav.logs": "Logs",

  "agent.online": "Agente IA activo",
  "agent.resolving": "Resolviendo incidente",
  "agent.title": "Agente de Respuesta",
  "agent.active": "Activo",
  "agent.copy": "Copiar razonamiento",
  "agent.copied": "Copiado",
  "agent.more": "Más acciones",
  "agent.executingCount": "Ejecutando {completed}/{total}",
  "agent.executingPlan": "Ejecutando plan",
  "agent.planComplete": "Plan completado",
  "agent.quote":
    "Centro de datos de Madrid fuera de servicio. Iniciando migración de cargas de trabajo a Barcelona y Valencia. Priorizando empresas críticas.",
  "agent.reasoning.current":
    "Estoy gestionando la recuperación del servicio tras la caída del DC de Madrid. Voy a analizar el impacto, priorizar empresas críticas y ejecutar la migración a centros de respaldo.",
  "agent.followup.ack":
    "Entendido. Sigo con la migración de empresas críticas y ajusto el plan con tu indicación.",
  "agent.composer.placeholder": "Pregunta al agente…",
  "agent.composer.send": "Enviar",
  "agent.composer.attach": "Adjuntar contexto",
  "agent.subagent.label": "Subagente · {name}",
  "agent.phase.analyze": "Analizando el incidente",
  "agent.phase.plan": "Generando plan de recuperación",
  "agent.phase.launch_subagents": "Lanzando subagentes",
  "agent.phase.restore": "Restaurando conexiones",
  "agent.phase.validate": "Validando servicios",
  "agent.phase.close": "Cerrando incidente",
  "agent.step.running": "En curso",
  "agent.step.pending": "Pendiente",
  "agent.progressSr": "Progreso del agente {percent}%",
  "agent.tool.logs.summary": "Logs obtenidos (1.2 MB)",
  "agent.tool.logs.detail":
    "Recolectados 1.2 MB de logs del DC de Madrid. El pico de errores empieza a las 10:16 con pérdida total de energía.",
  "agent.tool.services.summary": "28 empresas afectadas",
  "agent.tool.services.detail":
    "6 empresas críticas sin servicio y 22 degradadas. Prioridad: energía, banca y telecomunicaciones.",
  "agent.tool.deps.summary": "Dependencias mapeadas",
  "agent.tool.deps.detail":
    "El grafo de dependencias apunta a Barcelona y Valencia como destinos de failover con capacidad suficiente.",
  "agent.tool.plan.summary": "Plan generado (v1)",
  "agent.tool.plan.detail":
    "Plan v1: migrar Iberdrola, Santander y Telefónica en paralelo, luego restaurar DNS y validar servicios.",
  "agent.subagent.iberdrola.headline": "Migrando datos…",
  "agent.subagent.iberdrola.reasoning":
    "Replicando volúmenes críticos de Iberdrola hacia Barcelona. La red de control queda en modo degradado hasta el corte final.",
  "agent.subagent.iberdrola.volumes.summary": "Volúmenes replicados (12/12)",
  "agent.subagent.iberdrola.volumes.detail":
    "Los 12 volúmenes productivos están en Barcelona. Checksum verificado.",
  "agent.subagent.iberdrola.sync.summary": "Sincronizando servicios…",
  "agent.subagent.iberdrola.sync.detail":
    "Arranque de servicios de facturación y telemetría sobre el clúster de respaldo.",
  "agent.subagent.santander.headline": "Sincronizando servicios…",
  "agent.subagent.santander.reasoning":
    "La réplica de bases de datos de Santander va hacia Valencia. Priorizo core bancario sobre analítica.",
  "agent.subagent.santander.db.summary": "Replicando bases de datos…",
  "agent.subagent.santander.db.detail":
    "Core bancario al 64%. La ventana de RPO actual es de 38 segundos.",
  "agent.subagent.telefonica.headline": "Replicando datos…",
  "agent.subagent.telefonica.reasoning":
    "Telefónica necesita red y DNS antes que cómputo. Estoy replicando el plano de control hacia Barcelona.",
  "agent.subagent.telefonica.net.summary": "Replicando plano de red…",
  "agent.subagent.telefonica.net.detail":
    "Anycast DNS y peering de borde se están anunciando desde Barcelona.",

  "incident.critical": "INCIDENTE CRÍTICO",
  "incident.title": "Caída del centro de datos de Madrid",
  "incident.description":
    "El centro de datos principal está fuera de servicio. Estamos ejecutando el plan de recuperación con apoyo de agentes IA.",
  "incident.elapsed": "Hace {minutes} min",
  "incident.location": "Madrid DC",
  "incident.kpi.companies": "Empresas afectadas",
  "incident.kpi.users": "Usuarios sin servicio",
  "incident.kpi.critical": "Servicios críticos",
  "incident.kpi.elapsed": "Tiempo transcurrido",
  "incident.kpi.minutes": "{minutes} min",

  "global.title": "Estado global",
  "global.servicesOnline": "Servicios online",
  "global.active": "Activos",
  "global.degraded": "Degradados",
  "global.down": "Caídos",
  "global.companiesOnNetwork": "{count} empresas en la red",

  "affected.title": "Empresas afectadas",
  "affected.companiesOffline": "Empresas offline",
  "affected.usersOffline": "Usuarios sin servicio",

  "camera.title": "Cámara en directo – Madrid DC",

  "map.aria": "Mapa de centros de datos en España",
  "map.canaries": "Islas Canarias",
  "map.primaryDc": "Centro de datos principal",

  "status.company.up": "Operativo",
  "status.company.degraded": "Degradado",
  "status.company.down": "Caída total",
  "status.infra.up": "Operativo",
  "status.infra.degraded": "Degradado",
  "status.infra.down": "Fuera de servicio",
  "status.map.up": "Operativo",
  "status.map.degraded": "Degradado",
  "status.map.down": "Sin conexión",

  "companies.title": "Empresas afectadas",
  "companies.titleIdle": "Empresas",
  "companies.seeAll": "Ver todas",
  "companies.company": "Empresa",
  "companies.sector": "Sector",
  "companies.status": "Estado",
  "companies.users": "Usuarios",
  "companies.actions": "Acciones",
  "companies.migrating": "Migrando",
  "companies.queued": "En cola",
  "companies.offline": "Sin conexión",
  "companies.migrated": "Migrado",
  "companies.open": "Abrir {name}",

  "sector.energy": "Energía",
  "sector.banking": "Banca",
  "sector.retail": "Retail",
  "sector.telecom": "Telecomunicaciones",
  "sector.transport": "Transporte",

  "migration.title": "Progreso de recuperación",
  "migration.doneOf": "{done} de {total} empresas",
  "migration.eta": "ETA {minutes} min",
  "migration.queued": "En cola",
  "migration.waiting": "Esperando el primer ciclo del agente.",

  "map.networkLive": "Red operativa",
  "map.networkCrisis": "Golfo · failover activo",
  "map.networkRestored": "Red restaurada",
  "map.legendOnline": "operativo",
  "map.legendMigrating": "migrando",
  "map.legendOffline": "sin conexión",
  "map.impactConfirmed": "impacto confirmado",

  "infra.title": "Estado de la infraestructura",
  "infra.seeAll": "Ver todo",
  "infra.madrid": "Madrid (Principal)",
  "infra.barcelona": "Barcelona (Secundario)",
  "infra.valencia": "Valencia (Secundario)",
  "infra.sevilla": "Sevilla",
  "infra.bilbao": "Bilbao",
  "infra.a_coruna": "A Coruña",
  "infra.malaga": "Málaga",
  "infra.canarias": "Islas Canarias",

  "site.madrid": "Madrid",
  "site.barcelona": "Barcelona",
  "site.valencia": "Valencia",
  "site.sevilla": "Sevilla",
  "site.malaga": "Málaga",
  "site.bilbao": "Bilbao",
  "site.a_coruna": "A Coruña",
  "site.zaragoza": "Zaragoza",
  "site.canarias": "Islas Canarias",

  "demo.title": "Controles de demo",
  "demo.description":
    "Atajo {key}. Estos controles prueban el mapa y el agente hasta que exista el backend.",
  "demo.scenario": "Escenario",
  "demo.reset": "Reiniciar",
  "demo.start": "Iniciar escenario",
  "demo.twist": "Inyectar giro",
  "demo.advance": "Avanzar agente",
  "demo.approve": "Aprobar",
  "demo.reject": "Rechazar",
  "demo.sites": "Centros de datos",
  "demo.cycleHint": "Pulsa para ciclar verde → ámbar → rojo.",
  "demo.links": "Enlaces",
  "demo.inherited": "heredado",

  "placeholder.body":
    "Esta vista se conectará al mismo snapshot cuando el backend esté listo. Por ahora el diseño completo vive en Visión general.",

  "plan.todos.progress": "{completed} de {total} tareas",
  "plan.todos.completed": "{completed} de {total} tareas completadas",
  "plan.todos.toggle": "Mostrar u ocultar las tareas del plan",

  "language.label": "Idioma",
  "language.es": "ES",
  "language.en": "EN",

  "theme.label": "Tema",
  "theme.dark": "Oscuro",
  "theme.light": "Claro",
} as const;

const en: { [K in keyof typeof es]: string } = {
  "nav.overview": "Overview",
  "nav.incidents": "Incidents",
  "nav.migration": "Migration",
  "nav.companies": "Companies",
  "nav.infrastructure": "Infrastructure",
  "nav.logs": "Logs",

  "agent.online": "AI agent online",
  "agent.resolving": "Resolving incident",
  "agent.title": "Response agent",
  "agent.active": "Active",
  "agent.copy": "Copy reasoning",
  "agent.copied": "Copied",
  "agent.more": "More actions",
  "agent.executingCount": "Running {completed}/{total}",
  "agent.executingPlan": "Executing plan",
  "agent.planComplete": "Plan complete",
  "agent.quote":
    "Madrid data center is offline. Starting workload migration to Barcelona and Valencia. Prioritizing critical companies.",
  "agent.reasoning.current":
    "I am recovering service after the Madrid DC outage. Next I will assess impact, prioritize critical companies, and migrate them to backup sites.",
  "agent.followup.ack":
    "Understood. I will keep migrating critical companies and adjust the plan with your note.",
  "agent.composer.placeholder": "Ask the agent…",
  "agent.composer.send": "Send",
  "agent.composer.attach": "Attach context",
  "agent.subagent.label": "Subagent · {name}",
  "agent.phase.analyze": "Analyzing the incident",
  "agent.phase.plan": "Generating recovery plan",
  "agent.phase.launch_subagents": "Launching subagents",
  "agent.phase.restore": "Restoring connections",
  "agent.phase.validate": "Validating services",
  "agent.phase.close": "Closing incident",
  "agent.step.running": "In progress",
  "agent.step.pending": "Pending",
  "agent.progressSr": "Agent progress {percent}%",
  "agent.tool.logs.summary": "Logs retrieved (1.2 MB)",
  "agent.tool.logs.detail":
    "Collected 1.2 MB of logs from Madrid DC. Error spike starts at 10:16 with a total power loss.",
  "agent.tool.services.summary": "28 companies affected",
  "agent.tool.services.detail":
    "6 critical companies offline and 22 degraded. Priority: energy, banking, and telecom.",
  "agent.tool.deps.summary": "Dependencies mapped",
  "agent.tool.deps.detail":
    "The dependency graph points to Barcelona and Valencia as failover targets with enough capacity.",
  "agent.tool.plan.summary": "Plan generated (v1)",
  "agent.tool.plan.detail":
    "Plan v1: migrate Iberdrola, Santander, and Telefónica in parallel, then restore DNS and validate services.",
  "agent.subagent.iberdrola.headline": "Migrating data…",
  "agent.subagent.iberdrola.reasoning":
    "Replicating Iberdrola’s critical volumes to Barcelona. Control-plane traffic stays degraded until the final cutover.",
  "agent.subagent.iberdrola.volumes.summary": "Volumes replicated (12/12)",
  "agent.subagent.iberdrola.volumes.detail":
    "All 12 production volumes are in Barcelona. Checksums verified.",
  "agent.subagent.iberdrola.sync.summary": "Syncing services…",
  "agent.subagent.iberdrola.sync.detail":
    "Starting billing and telemetry services on the backup cluster.",
  "agent.subagent.santander.headline": "Syncing services…",
  "agent.subagent.santander.reasoning":
    "Santander database replica is moving to Valencia. Core banking is ahead of analytics.",
  "agent.subagent.santander.db.summary": "Replicating databases…",
  "agent.subagent.santander.db.detail":
    "Core banking at 64%. Current RPO window is 38 seconds.",
  "agent.subagent.telefonica.headline": "Replicating data…",
  "agent.subagent.telefonica.reasoning":
    "Telefónica needs network and DNS before compute. Replicating the control plane to Barcelona.",
  "agent.subagent.telefonica.net.summary": "Replicating network plane…",
  "agent.subagent.telefonica.net.detail":
    "Anycast DNS and edge peering are being announced from Barcelona.",

  "incident.critical": "CRITICAL INCIDENT",
  "incident.title": "Madrid data center outage",
  "incident.description":
    "The primary data center is offline. We are executing the recovery plan with AI agents.",
  "incident.elapsed": "{minutes} min ago",
  "incident.location": "Madrid DC",
  "incident.kpi.companies": "Companies affected",
  "incident.kpi.users": "Users without service",
  "incident.kpi.critical": "Critical services",
  "incident.kpi.elapsed": "Time elapsed",
  "incident.kpi.minutes": "{minutes} min",

  "global.title": "Global status",
  "global.servicesOnline": "Services online",
  "global.active": "Active",
  "global.degraded": "Degraded",
  "global.down": "Down",
  "global.companiesOnNetwork": "{count} companies on the network",

  "affected.title": "Affected companies",
  "affected.companiesOffline": "Companies offline",
  "affected.usersOffline": "Users without service",

  "camera.title": "Live camera – Madrid DC",

  "map.aria": "Map of data centers in Spain",
  "map.canaries": "Canary Islands",
  "map.primaryDc": "Primary data center",

  "status.company.up": "Operational",
  "status.company.degraded": "Degraded",
  "status.company.down": "Total outage",
  "status.infra.up": "Operational",
  "status.infra.degraded": "Degraded",
  "status.infra.down": "Out of service",
  "status.map.up": "Operational",
  "status.map.degraded": "Degraded",
  "status.map.down": "Offline",

  "companies.title": "Affected companies",
  "companies.titleIdle": "Companies",
  "companies.seeAll": "View all",
  "companies.company": "Company",
  "companies.sector": "Sector",
  "companies.status": "Status",
  "companies.users": "Users",
  "companies.actions": "Actions",
  "companies.migrating": "Migrating",
  "companies.queued": "Queued",
  "companies.offline": "Offline",
  "companies.migrated": "Migrated",
  "companies.open": "Open {name}",

  "sector.energy": "Energy",
  "sector.banking": "Banking",
  "sector.retail": "Retail",
  "sector.telecom": "Telecom",
  "sector.transport": "Transport",

  "migration.title": "Recovery progress",
  "migration.doneOf": "{done} of {total} companies",
  "migration.eta": "ETA {minutes} min",
  "migration.queued": "Queued",
  "migration.waiting": "Waiting for the agent's first cycle.",

  "map.networkLive": "Operational network",
  "map.networkCrisis": "Gulf · failover active",
  "map.networkRestored": "Network restored",
  "map.legendOnline": "operational",
  "map.legendMigrating": "migrating",
  "map.legendOffline": "offline",
  "map.impactConfirmed": "impact confirmed",

  "infra.title": "Infrastructure status",
  "infra.seeAll": "View all",
  "infra.madrid": "Madrid (Primary)",
  "infra.barcelona": "Barcelona (Secondary)",
  "infra.valencia": "Valencia (Secondary)",
  "infra.sevilla": "Seville",
  "infra.bilbao": "Bilbao",
  "infra.a_coruna": "A Coruña",
  "infra.malaga": "Málaga",
  "infra.canarias": "Canary Islands",

  "site.madrid": "Madrid",
  "site.barcelona": "Barcelona",
  "site.valencia": "Valencia",
  "site.sevilla": "Seville",
  "site.malaga": "Málaga",
  "site.bilbao": "Bilbao",
  "site.a_coruna": "A Coruña",
  "site.zaragoza": "Zaragoza",
  "site.canarias": "Canary Islands",

  "demo.title": "Demo controls",
  "demo.description":
    "Shortcut {key}. These controls exercise the map and the agent until the backend is ready.",
  "demo.scenario": "Scenario",
  "demo.reset": "Reset",
  "demo.start": "Start scenario",
  "demo.twist": "Inject twist",
  "demo.advance": "Advance agent",
  "demo.approve": "Approve",
  "demo.reject": "Reject",
  "demo.sites": "Data centers",
  "demo.cycleHint": "Click to cycle green → amber → red.",
  "demo.links": "Links",
  "demo.inherited": "inherited",

  "placeholder.body":
    "This view will connect to the same snapshot when the backend is ready. The full design currently lives in Overview.",

  "plan.todos.progress": "{completed} of {total} To-dos",
  "plan.todos.completed": "{completed} of {total} To-dos Completed",
  "plan.todos.toggle": "Show or hide plan to-dos",

  "language.label": "Language",
  "language.es": "ES",
  "language.en": "EN",

  "theme.label": "Theme",
  "theme.dark": "Dark",
  "theme.light": "Light",
};

export const messages = { es, en };

export type MessageKey = keyof typeof es;

export function isLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale);
}

export function siteKey(id: SiteId): MessageKey {
  return `site.${id}` as MessageKey;
}

export function infraKey(id: SiteId): MessageKey {
  return `infra.${id}` as MessageKey;
}

export function sectorKey(id: SectorId): MessageKey {
  return `sector.${id}` as MessageKey;
}

export function agentPhaseKey(id: AgentPhaseId): MessageKey {
  return `agent.phase.${id}` as MessageKey;
}

export function messageKey(key: string): MessageKey | null {
  return key in es ? (key as MessageKey) : null;
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
) {
  let text: string = messages[locale][key];
  if (!vars) return text;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}
