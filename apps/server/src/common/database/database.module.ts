import { requiresTLS } from "@common/helpers/database-url.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
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
				migrations: [BrowserSessions1790000000000],
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
