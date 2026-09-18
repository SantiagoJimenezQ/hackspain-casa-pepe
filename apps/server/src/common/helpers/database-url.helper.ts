const TLS_HOST_SUFFIXES = [".supabase.com", ".supabase.co"] as const

export function requiresTLS(databaseURL: string): boolean {
	const parsed = new URL(databaseURL)
	if (parsed.searchParams.get("sslmode") === "require") {
		return true
	}
	return TLS_HOST_SUFFIXES.some((suffix) => parsed.hostname.endsWith(suffix))
}
