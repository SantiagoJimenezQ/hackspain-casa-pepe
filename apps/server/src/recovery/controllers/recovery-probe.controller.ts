import { ActivityService } from "@activity/services/activity.service"
import { StaleRunException } from "@common/exceptions/domain.exception"
import { ConfigurationService } from "@common/services/configuration.service"
import { RunsService } from "@incidents/services/runs.service"
import {
	Body,
	ConflictException,
	Controller,
	HttpCode,
	Post,
} from "@nestjs/common"
import { ApiProperty, ApiSecurity, ApiTags } from "@nestjs/swagger"
import { HTTPRecoveryAdapter } from "@recovery/adapters/http-recovery.adapter"
import { IsNotEmpty, IsString } from "class-validator"
import type { DeliveryProbeResult } from "../../../../../packages/contracts/demo-controls"

export class DeliveryProbeDTO {
	@ApiProperty()
	@IsString()
	@IsNotEmpty()
	runIdentifier: string
}

@ApiTags("Recovery")
@ApiSecurity("operator")
@Controller("recovery/probe")
export class RecoveryProbeController {
	constructor(
		private readonly runs: RunsService,
		private readonly config: ConfigurationService,
		private readonly adapter: HTTPRecoveryAdapter,
		private readonly activity: ActivityService,
	) {}

	@Post()
	@HttpCode(200)
	async probe(@Body() body: DeliveryProbeDTO): Promise<DeliveryProbeResult> {
		const run = await this.runs.getByRunIdentifier(body.runIdentifier)
		if (!run.active || run.runKind === "replay")
			throw new StaleRunException(body.runIdentifier)
		if (
			this.config.recovery.mode !== "http" ||
			run.simulation.mode !== "manual"
		) {
			throw new ConflictException(
				"La prueba funcional requiere recuperación HTTP y escenario manual.",
			)
		}
		const result = await this.adapter.verify(
			run.runIdentifier,
			"route-assignment",
		)
		const latest = await this.runs.getByRunIdentifier(body.runIdentifier)
		if (!latest.active) throw new StaleRunException(body.runIdentifier)
		const probe: DeliveryProbeResult = {
			checkedAt: new Date().toISOString(),
			deliveryIdentifier: result.deliveryIdentifier ?? null,
			detail: result.verified
				? "El pedido de prueba ha recibido una ruta."
				: "El pedido de prueba no ha recibido una ruta válida. Comprueba el servicio y la conexión con el entorno HTTP.",
			mode: "http",
			routeIdentifier: result.routeIdentifier ?? null,
			runIdentifier: run.runIdentifier,
			verified: result.verified,
		}
		await this.activity.record({
			correlation: { serviceIdentifier: "route-assignment" },
			incidentIdentifier: run.identifier,
			payload: { probe },
			runIdentifier: run.runIdentifier,
			simulated: false,
			source: "operator",
			summary: probe.detail,
			title: "Prueba funcional de reparto",
			type: "recovery.probed",
		})
		return probe
	}
}
