interface PublicStatus {
	updatedAt: string
	simulated: boolean
	services: ReadonlyArray<{ name: string; status: string }>
}
function escapeHTML(value: string) {
	return value.replace(
		/[&<>"']/g,
		(character) =>
			({
				"'": "&#39;",
				'"': "&quot;",
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
			})[character] ?? character,
	)
}
export function renderStatusPage(status: PublicStatus | null): string {
	const labels: Record<string, string> = {
		"awaiting-verification": "Checking recovery",
		degraded: "Limited service",
		down: "Unavailable",
		healthy: "Operational",
		recovering: "Recovering",
	}
	const healthy =
		status?.services.filter((s) => s.status === "healthy").length ?? 0
	const total = status?.services.length ?? 0
	const rows =
		status?.services
			.map(
				(service) =>
					`<li><span>${escapeHTML(service.name)}</span><strong class="${service.status === "healthy" ? "good" : "affected"}">${labels[service.status] ?? "Unknown"}</strong></li>`,
			)
			.join("") ?? ""
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Casa Pepe · Service status</title><style>
 *{box-sizing:border-box}body{margin:0;background:#f5f2e9;color:#193c31;font-family:Verdana,sans-serif;line-height:1.6}main{max-width:800px;margin:0 auto;padding:48px 24px}header{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #bdc6b8;padding-bottom:24px;font-size:12px;letter-spacing:.08em;text-transform:uppercase}.brand{font-weight:700}h1{font-family:Georgia,serif;font-size:clamp(38px,7vw,64px);font-weight:400;line-height:1.08;letter-spacing:-.035em;margin:48px 0 20px}.intro{max-width:570px;color:#4b6055;font-size:15px}.summary{margin:36px 0 14px;font-size:14px}.summary b{font-family:Georgia,serif;font-size:36px;font-weight:400;margin-right:8px}ul{padding:0;margin:0;list-style:none;border-top:2px solid #193c31}li{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px 0;border-bottom:1px solid #c9cec1;font-size:14px}strong{font-size:12px;white-space:nowrap}.good{color:#216749}.affected{color:#8b481b}footer{margin-top:28px;color:#526157;font-size:12px}a{color:#193c31;text-underline-offset:4px;display:inline-block;padding:10px 0}a:focus-visible{outline:2px solid #193c31;outline-offset:4px}.empty{padding:30px 0;border-top:2px solid #193c31}@media(max-width:440px){main{padding:28px 20px}header{font-size:10px}li{align-items:flex-start;flex-direction:column;gap:5px;padding:16px 0}}
 </style></head><body><main><header><span class="brand">Casa Pepe / Service status</span><span>Demo incident</span></header><h1>${!status ? "Waiting for an update." : healthy === total ? "Services are back." : "Recovery is under way."}</h1><p class="intro">${!status ? "Our incident coordinator has not published a service update yet." : "Follow the recovery of our delivery services. A service is marked operational only after an independent check."}</p>${status ? `<p class="summary"><b>${healthy} / ${total}</b> services operational</p><ul aria-label="Service status">${rows}</ul>` : '<p class="empty">No published status for the current run.</p>'}<footer>${status ? `<p>Published ${escapeHTML(status.updatedAt)}<br>${status.simulated ? "Simulated recovery results" : "Test-environment recovery results"} · HackSpain demo</p>` : ""}<a href="/api/status">Refresh status</a></footer></main></body></html>`
}
