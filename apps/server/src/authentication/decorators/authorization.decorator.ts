import { AUTHORIZATION_SCOPE_METADATA_KEY } from "@authentication/constants/authentication.constant"
import { AuthorizationScope } from "@authentication/types/authorization.type"
import { SetMetadata } from "@nestjs/common"

export function Authorization(scope: AuthorizationScope) {
	return SetMetadata(AUTHORIZATION_SCOPE_METADATA_KEY, scope)
}
