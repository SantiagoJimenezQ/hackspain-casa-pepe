export function normalizeCasaPepeAPIBaseURL(configured: string): string {
  const normalized = configured.trim().replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/api") ? "" : "/api"}`;
}
