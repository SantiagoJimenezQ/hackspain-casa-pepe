import { ApiProperty } from "@nestjs/swagger"
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator"

export class ChangeCapacityDTO {
	@ApiProperty()
	@IsString()
	@IsNotEmpty()
	runIdentifier: string

	@ApiProperty()
	@IsString()
	@IsNotEmpty()
	resourceIdentifier: string

	@ApiProperty({
		description: "Total usable units, including already allocated units",
	})
	@IsInt()
	@Min(0)
	totalCapacity: number

	@ApiProperty()
	@IsString()
	@IsNotEmpty()
	@MaxLength(500)
	reason: string
}
