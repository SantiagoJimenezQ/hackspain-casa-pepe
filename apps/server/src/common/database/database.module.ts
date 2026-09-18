import { ConfigurationService } from "@common/services/configuration.service"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			inject: [ConfigurationService],
			useFactory: (configuration: ConfigurationService) => ({
				autoLoadEntities: true,
				ssl: configuration.database.ssl
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
