import { AUTHORIZATION_SCOPES } from "@authentication/constants/authentication.constant"

export type AuthorizationScope = (typeof AUTHORIZATION_SCOPES)[number]

export type Principal =
	| { readonly kind: "anonymous" }
	| { readonly kind: "operator" }

export interface AuthenticatedRequestState {
	readonly principal: Principal
}
