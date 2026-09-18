import { APIKeyGuard } from "@authentication/guards/api-key.guard"
import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"

@Module({
	providers: [{ provide: APP_GUARD, useClass: APIKeyGuard }],
})
export class AuthenticationModule {}
