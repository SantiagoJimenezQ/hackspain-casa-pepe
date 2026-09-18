import { Authorization } from "@authentication/decorators/authorization.decorator"
import { Controller, Get, Header } from "@nestjs/common"
import { CommunicationToolsService } from "@tools/implementations/communication-tools"
import { renderStatusPage } from "@tools/views/status-page"
@Controller("status")
export class PublicStatusController {
	constructor(private readonly communications: CommunicationToolsService) {}
	@Get()
	@Authorization("public")
	@Header("Cache-Control", "no-store")
	@Header("Content-Type", "text/html; charset=utf-8")
	@Header(
		"Content-Security-Policy",
		"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
	)
	async page() {
		return renderStatusPage(await this.communications.latest())
	}
	@Get("public")
	@Authorization("public")
	@Header("Cache-Control", "no-store")
	latest() {
		return this.communications.latest()
	}
}
