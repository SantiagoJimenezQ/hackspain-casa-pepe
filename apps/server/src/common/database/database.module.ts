import { requiresTLS } from "@common/helpers/database-url.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { PrivateCallSchema1789860000000 } from "./migrations/1789860000000-private-call-schema"
import { IncidentCallCode1789889000000 } from "./migrations/1789889000000-incident-call-code"
import { BrowserSessions1790000000000 } from "./migrations/1790000000000-browser-sessions"

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			inject: [ConfigurationService],
			useFactory: (configuration: ConfigurationService) => ({
				autoLoadEntities: true,
				extra: {
					connectionTimeoutMillis: 5000,
					idleTimeoutMillis: 10000,
					max: configuration.database.poolMaximum,
				},
				logging: configuration.database.queryLogging
					? ["query"]
					: false,
				migrations: [
					PrivateCallSchema1789860000000,
					IncidentCallCode1789889000000,
					BrowserSessions1790000000000,
				],
				migrationsRun: configuration.database.sessionSchemaUpgrade,
				ssl: requiresTLS(configuration.database.url)
					? { rejectUnauthorized: false }
					: false,
				synchronize: configuration.database.sessionSchemaUpgrade,
				type: "postgres",
				url: configuration.database.url,
			}),
		}),
	],
})
export class DatabaseModule {}
