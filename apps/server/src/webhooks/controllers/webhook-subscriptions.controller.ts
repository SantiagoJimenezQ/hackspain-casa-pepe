import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Post,
	Query,
} from "@nestjs/common"
import { ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { CreateWebhookSubscriptionDTO } from "@webhooks/dtos/create-webhook-subscription.dto"
import { ListWebhookDeliveriesDTO } from "@webhooks/dtos/list-webhook-deliveries.dto"
import { WebhookDispatcherService } from "@webhooks/services/webhook-dispatcher.service"
import { WebhookSubscriptionsService } from "@webhooks/services/webhook-subscriptions.service"
import {
	WebhookDeliveryRecord,
	WebhookSubscriptionRecord,
} from "@webhooks/types/webhook.type"

@ApiTags("Webhooks")
@ApiSecurity("operator")
@Controller("webhooks")
export class WebhookSubscriptionsController {
	constructor(
		private readonly subscriptions: WebhookSubscriptionsService,
		private readonly dispatcher: WebhookDispatcherService,
	) {}

	@Post("subscriptions")
	@ApiOperation({
		summary:
			"Subscribe a URL to activity events. Every delivery is signed with HMAC SHA-256 using the shared secret",
	})
	create(
		@Body() body: CreateWebhookSubscriptionDTO,
	): Promise<WebhookSubscriptionRecord> {
		return this.subscriptions.create({
			description: body.description,
			eventTypes: body.eventTypes,
			name: body.name,
			secret: body.secret,
			targetURL: body.targetURL,
		})
	}

	@Get("subscriptions")
	@ApiOperation({ summary: "Active webhook subscriptions" })
	list(): Promise<ReadonlyArray<WebhookSubscriptionRecord>> {
		return this.subscriptions.list()
	}

	@Get("subscriptions/:identifier")
	@ApiOperation({ summary: "A specific subscription" })
	getByIdentifier(
		@Param("identifier") identifier: string,
	): Promise<WebhookSubscriptionRecord> {
		return this.subscriptions.getByIdentifier(identifier)
	}

	@Delete("subscriptions/:identifier")
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiOperation({
		summary: "Remove a subscription. Pending deliveries are abandoned",
	})
	remove(@Param("identifier") identifier: string): Promise<void> {
		return this.subscriptions.remove(identifier)
	}

	@Post("subscriptions/:identifier/ping")
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: "Send a test delivery to the subscription" })
	ping(
		@Param("identifier") identifier: string,
	): Promise<WebhookDeliveryRecord> {
		return this.dispatcher.sendPing(identifier)
	}

	@Get("deliveries")
	@ApiOperation({
		summary: "Delivery log with attempts, status codes and errors",
	})
	deliveries(
		@Query() query: ListWebhookDeliveriesDTO,
	): Promise<ReadonlyArray<WebhookDeliveryRecord>> {
		return this.dispatcher.list(
			query.subscriptionIdentifier,
			query.status,
			query.limit,
		)
	}
}
