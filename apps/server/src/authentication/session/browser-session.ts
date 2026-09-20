import { AsyncLocalStorage } from "node:async_hooks"
import { createHash } from "node:crypto"
import { SetMetadata } from "@nestjs/common"
import { EntityTarget, ObjectLiteral } from "typeorm"

export const SESSION_HEADER = "x-casa-pepe-session"
export const LEGACY_SESSION = "legacy"
export const sessionContext = new AsyncLocalStorage<string>()
export const currentSessionId = () =>
	sessionContext.getStore() ?? LEGACY_SESSION
export const sessionIdForToken = (token: string) =>
	createHash("sha256").update(token).digest("hex")
export const RUN_RESOURCE = "browser-session:run-resource"
export const SESSION_ADMIN = "browser-session:administration"
export const RunResource = (entity: EntityTarget<ObjectLiteral>) =>
	SetMetadata(RUN_RESOURCE, entity)
export const SessionAdministration = () => SetMetadata(SESSION_ADMIN, true)
