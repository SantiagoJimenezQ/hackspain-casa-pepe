import { APIKeyGuard } from "@authentication/guards/api-key.guard"
import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"

@Module({
	exports: [APIKeyGuard],
	providers: [APIKeyGuard, { provide: APP_GUARD, useExisting: APIKeyGuard }],
})
export class AuthenticationModule {}
