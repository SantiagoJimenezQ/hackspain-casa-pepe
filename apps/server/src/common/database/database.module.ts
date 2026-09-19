import { requiresTLS } from "@common/helpers/database-url.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"

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
				ssl: requiresTLS(configuration.database.url)
					? { rejectUnauthorized: false }
					: false,
				synchronize: true,
				type: "postgres",
				url: configuration.database.url,
			}),
		}),
	],
})
export class DatabaseModule {}
