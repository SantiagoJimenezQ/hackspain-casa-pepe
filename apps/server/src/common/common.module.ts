import { validateEnvironmentVariables } from "@common/configuration/configuration.factory"
import { ConfigurationService } from "@common/services/configuration.service"
import { Global, Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"

@Global()
@Module({
	exports: [ConfigurationService],
	imports: [
		ConfigModule.forRoot({
			cache: true,
			envFilePath: [".env.local", ".env"],
			isGlobal: true,
			validate: validateEnvironmentVariables,
		}),
	],
	providers: [ConfigurationService],
})
export class CommonModule {}
