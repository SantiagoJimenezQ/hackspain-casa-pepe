import { EngineersModule } from "@engineers/engineers.module"
import { HttpModule } from "@nestjs/axios"
import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { RecoveryModule } from "@recovery/recovery.module"
import { InboundWebhooksController } from "@webhooks/controllers/inbound-webhooks.controller"
import { WebhookSubscriptionsController } from "@webhooks/controllers/webhook-subscriptions.controller"
import { WebhookDeliveryEntity } from "@webhooks/entities/webhook-delivery.entity"
import { WebhookSubscriptionEntity } from "@webhooks/entities/webhook-subscription.entity"
import {
	HappyRobotSecretGuard,
	RecoverySecretGuard,
} from "@webhooks/guards/inbound-secret.guard"
import { WebhookDeliveryWorkerService } from "@webhooks/services/webhook-delivery-worker.service"
import { WebhookDispatcherService } from "@webhooks/services/webhook-dispatcher.service"
import { WebhookSubscriptionsService } from "@webhooks/services/webhook-subscriptions.service"

@Module({
	controllers: [WebhookSubscriptionsController, InboundWebhooksController],
	exports: [WebhookSubscriptionsService, WebhookDispatcherService],
	imports: [
		TypeOrmModule.forFeature([
			WebhookSubscriptionEntity,
			WebhookDeliveryEntity,
		]),
		HttpModule,
		EngineersModule,
		RecoveryModule,
	],
	providers: [
		WebhookSubscriptionsService,
		WebhookDispatcherService,
		WebhookDeliveryWorkerService,
		HappyRobotSecretGuard,
		RecoverySecretGuard,
	],
})
export class WebhooksModule {}
