import { EngineersModule } from "@engineers/engineers.module"
import { RunsModule } from "@incidents/runs.module"
import { HttpModule } from "@nestjs/axios"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { RecoveryModule } from "@recovery/recovery.module"
import { InboundWebhooksController } from "@webhooks/controllers/inbound-webhooks.controller"
import { WebhookSubscriptionsController } from "@webhooks/controllers/webhook-subscriptions.controller"
import { InboundEmailEntity } from "@webhooks/entities/inbound-email.entity"
import { WebhookDeliveryEntity } from "@webhooks/entities/webhook-delivery.entity"
import { WebhookSubscriptionEntity } from "@webhooks/entities/webhook-subscription.entity"
import {
	HappyRobotSecretGuard,
	RecoverySecretGuard,
	ResendWebhookSecretGuard,
} from "@webhooks/guards/inbound-secret.guard"
import { InboundEmailsService } from "@webhooks/services/inbound-emails.service"
import { WebhookDeliveryWorkerService } from "@webhooks/services/webhook-delivery-worker.service"
import { WebhookDispatcherService } from "@webhooks/services/webhook-dispatcher.service"
import { WebhookSubscriptionsService } from "@webhooks/services/webhook-subscriptions.service"

@Module({
	controllers: [WebhookSubscriptionsController, InboundWebhooksController],
	exports: [
		WebhookSubscriptionsService,
		WebhookDispatcherService,
		InboundEmailsService,
	],
	imports: [
		TypeOrmModule.forFeature([
			WebhookSubscriptionEntity,
			WebhookDeliveryEntity,
			InboundEmailEntity,
		]),
		HttpModule,
		EngineersModule,
		RecoveryModule,
		RunsModule,
	],
	providers: [
		WebhookSubscriptionsService,
		WebhookDispatcherService,
		WebhookDeliveryWorkerService,
		HappyRobotSecretGuard,
		RecoverySecretGuard,
		ResendWebhookSecretGuard,
		InboundEmailsService,
	],
})
export class WebhooksModule {}
