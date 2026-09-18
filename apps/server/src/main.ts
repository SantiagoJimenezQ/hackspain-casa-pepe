import {
	API_PREFIX,
	APPLICATION_DESCRIPTION,
	APPLICATION_NAME,
	DOCUMENTATION_PATH,
} from "@common/constants/application.constant"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { HTTPExceptionFilter } from "@common/filters/http-exception.filter"
import { ConfigurationService } from "@common/services/configuration.service"
import { Logger, ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { AppModule } from "@root/app.module"

async function bootstrap(): Promise<void> {
	const application = await NestFactory.create(AppModule)
	const configuration = application.get(ConfigurationService)
	const logger = new Logger("Bootstrap")

	application.setGlobalPrefix(API_PREFIX)
	application.enableCors({ origin: true })
	application.useGlobalPipes(
		new ValidationPipe({
			forbidUnknownValues: false,
			transform: true,
			transformOptions: {
				enableImplicitConversion: false,
				exposeDefaultValues: true,
			},
			whitelist: true,
		}),
	)
	application.useGlobalFilters(new HTTPExceptionFilter())
	application.enableShutdownHooks()

	const documentConfiguration = new DocumentBuilder()
		.setTitle(APPLICATION_NAME)
		.setDescription(APPLICATION_DESCRIPTION)
		.setVersion("0.1.0")
		.addApiKey(
			{
				description: "Authorization: API <API_KEY>",
				in: "header",
				name: "Authorization",
				type: "apiKey",
			},
			"operator",
		)
		.build()
	SwaggerModule.setup(
		DOCUMENTATION_PATH,
		application,
		SwaggerModule.createDocument(application, documentConfiguration),
	)

	await application.listen(configuration.runtime.port)
	logger.log(LOG_MESSAGES.APPLICATION.STARTED, {
		documentation: `${configuration.runtime.publicBaseURL}/${DOCUMENTATION_PATH}`,
		engineerCalls: configuration.happyRobot.mode,
		environment: configuration.runtime.environment,
		port: configuration.runtime.port,
		recovery: configuration.recovery.mode,
	})
}

void bootstrap()
