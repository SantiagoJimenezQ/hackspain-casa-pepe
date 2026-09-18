import { Column, Entity, PrimaryColumn } from "typeorm"
import { StatusPublication } from "../../../../../packages/contracts/tools"
@Entity({ name: "status_publications" })
export class StatusPublicationEntity {
	@PrimaryColumn({ type: "text" }) identifier: string
	@Column({ type: "text" }) runIdentifier: string
	@Column({ type: "text" }) createdAt: string
	@Column({ type: "jsonb" }) publication: StatusPublication
}
