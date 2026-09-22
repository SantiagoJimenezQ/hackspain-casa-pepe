import "reflect-metadata"
import {
	createApplicationConfiguration,
	validateEnvironmentVariables,
} from "@common/configuration/configuration.factory"
import { ConfigurationService } from "@common/services/configuration.service"
import { ForbiddenException } from "@nestjs/common"
import { MODULE_METADATA } from "@nestjs/common/constants"
import { Test } from "@nestjs/testing"
import { HappyRobotSecretGuard } from "@webhooks/guards/inbound-secret.guard"
import { CompanyCallGuard } from "../company-calls/company-call.guard"
import { ElevenLabsEngineerCallAdapter } from "./adapters/elevenlabs-engineer-call.adapter"
import { HappyRobotEngineerCallAdapter } from "./adapters/happyrobot-engineer-call.adapter"
import { SimulatedEngineerCallAdapter } from "./adapters/simulated-engineer-call.adapter"
import { ENGINEER_CALL_ADAPTER } from "./constants/engineer.constant"
import { EngineersModule } from "./engineers.module"

describe("simulated-only voice runtime", () => {
	it.each(["happyrobot", "elevenlabs"])(
		"selects simulation and rejects callbacks with legacy %s settings",
		async (provider) => {
			const configuration = createApplicationConfiguration(
				validateEnvironmentVariables({
					API_KEY: "test-key",
					CASA_PEPE_INBOUND_WEBHOOK_SECRET: "old-secret",
					ENGINEER_CALL_MODE: "live",
					ENGINEER_CALL_PROVIDER: provider,
					HAPPYROBOT_INBOUND_PHONE_NUMBER: "+34600000000",
					HAPPYROBOT_MODE: "live",
					HAPPYROBOT_WEBHOOK_SECRET: "old-secret",
					RECOVERY_WEBHOOK_SECRET: "test-secret",
					SUPABASE_DATABASE_URL: "postgresql://localhost/test",
				}),
			)
			expect(configuration.happyRobot.inboundPhoneNumber).toBe("")
			const simulated = { mode: "simulated", start: jest.fn() }
			const live = {
				getResult: jest.fn(),
				mode: "live",
				start: jest.fn(),
			}
			const providers = Reflect.getMetadata(
				MODULE_METADATA.PROVIDERS,
				EngineersModule,
			)
			const binding = providers.find(
				(entry: { provide?: unknown }) =>
					entry.provide === ENGINEER_CALL_ADAPTER,
			)
			const module = await Test.createTestingModule({
				providers: [
					binding,
					{ provide: ConfigurationService, useValue: configuration },
					{
						provide: SimulatedEngineerCallAdapter,
						useValue: simulated,
					},
					{ provide: HappyRobotEngineerCallAdapter, useValue: live },
					{ provide: ElevenLabsEngineerCallAdapter, useValue: live },
				],
			}).compile()
			expect(module.get(ENGINEER_CALL_ADAPTER)).toBe(simulated)
			const request = {
				headers: {
					"x-casa-pepe-webhook-secret": "old-secret",
					"x-happyrobot-signature": "old-secret",
				},
			}
			const context = {
				switchToHttp: () => ({ getRequest: () => request }),
			}
			for (const Guard of [HappyRobotSecretGuard, CompanyCallGuard]) {
				expect(() =>
					new Guard(configuration as never).canActivate(
						context as never,
					),
				).toThrow(ForbiddenException)
			}
			expect(live.start).not.toHaveBeenCalled()
			expect(live.getResult).not.toHaveBeenCalled()
			await module.close()
		},
	)
})
