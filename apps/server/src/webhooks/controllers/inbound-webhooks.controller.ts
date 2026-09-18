import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { HappyRobotCallResultDTO } from "@engineers/dtos/happyrobot-call-result.dto"
import { EngineersService } from "@engineers/services/engineers.service"
import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
} from "@nestjs/common"
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger"
import { RecoveryCallbackDTO } from "@recovery/dtos/recovery-callback.dto"
import { RecoveryService } from "@recovery/services/recovery.service"
import {
	HappyRobotInbound,
	RecoveryInbound,
} from "@webhooks/guards/inbound-secret.guard"

@ApiTags("Inbound webhooks")
@Controller("webhooks")
export class InboundWebhooksController {
	private readonly logger = new Logger(InboundWebhooksController.name)

	constructor(
		private readonly engineersService: EngineersService,
		private readonly recoveryService: RecoveryService,
	) {}

	@Post("happyrobot")
	@HttpCode(HttpStatus.ACCEPTED)
	@HappyRobotInbound()
	@ApiHeader({
		description: "Shared secret configured in HAPPYROBOT_WEBHOOK_SECRET",
		name: "x-happyrobot-signature",
	})
	@ApiOperation({
		summary:
			"Result of an engineer call sent by HappyRobot when the call ends",
	})
	async happyRobot(
		@Body() body: HappyRobotCallResultDTO,
	): Promise<{ readonly accepted: true }> {
		this.logger.log(LOG_MESSAGES.WEBHOOKS.INBOUND_RECEIVED, {
			callIdentifier: body.callIdentifier,
			provider: "HappyRobot",
		})
		const call = await this.engineersService.getByIdentifier(
			body.callIdentifier,
		)
		const questionsByKey = new Map(
			call.questions.map((question) => [question.key, question.question]),
		)
		await this.engineersService.completeCall(body.callIdentifier, {
			answers: body.answers.map((answer) => {
				const question = questionsByKey.get(answer.key)
				return {
					answer: answer.answer,
					key: answer.key,
					question: question ? question : answer.key,
				}
			}),
			outcome: body.outcome,
			summary: body.summary,
			transcript: body.transcript,
		})
		return { accepted: true }
	}

	@Post("recovery")
	@HttpCode(HttpStatus.ACCEPTED)
	@RecoveryInbound()
	@ApiHeader({
		description: "Shared secret configured in RECOVERY_WEBHOOK_SECRET",
		name: "x-recovery-signature",
	})
	@ApiOperation({
		summary:
			"Result of a recovery action sent by the test environment when it finishes",
	})
	async recovery(
		@Body() body: RecoveryCallbackDTO,
	): Promise<{ readonly accepted: true }> {
		this.logger.log(LOG_MESSAGES.WEBHOOKS.INBOUND_RECEIVED, {
			actionIdentifier: body.actionIdentifier,
			provider: "Recovery environment",
		})
		const outcome =
			body.status === "succeeded"
				? "success"
				: body.status === "partial"
					? "partial"
					: "failure"
		await this.recoveryService.complete(body.actionIdentifier, {
			detail: body.detail,
			outcome,
		})
		return { accepted: true }
	}
}
