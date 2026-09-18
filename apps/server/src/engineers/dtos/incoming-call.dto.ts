import {
	IsInt,
	IsString,
	Max,
	MaxLength,
	Min,
	MinLength,
} from "class-validator"
import {
	ConfirmIncomingCall,
	IncomingCallReport,
} from "../../../../../packages/contracts/tools"
export class IncomingCallDTO implements IncomingCallReport {
	@IsString() @MinLength(1) @MaxLength(200) providerCallIdentifier: string
	@IsString() @MinLength(1) @MaxLength(200) runIdentifier: string
	@IsString() @MinLength(1) @MaxLength(100) callerName: string
	@IsString() @MinLength(1) @MaxLength(2000) summary: string
	@IsInt() @Min(0) @Max(10000) reportedCapacity: number
}
export class ConfirmIncomingCallDTO implements ConfirmIncomingCall {
	@IsString() @MinLength(1) @MaxLength(100) operatorName: string
	@IsInt() @Min(0) @Max(10000) confirmedCapacity: number
}
