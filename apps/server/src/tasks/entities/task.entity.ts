import { Actor } from "@common/types/identity.type"
import { TaskAssignee, TaskPriority, TaskStatus } from "@tasks/types/task.type"
import { Column, Entity, Index, PrimaryColumn } from "typeorm"

@Entity({ name: "tasks" })
export class TaskEntity {
	@PrimaryColumn({ type: "text" })
	identifier: string

	@Index()
	@Column({ type: "text" })
	runIdentifier: string

	@Column({ type: "text" })
	incidentIdentifier: string

	@Column({ type: "text" })
	title: string

	@Column({ type: "text" })
	description: string

	@Column({ type: "jsonb" })
	assignee: TaskAssignee

	@Column({ type: "text" })
	priority: TaskPriority

	@Column({ type: "text" })
	status: TaskStatus

	@Column({ type: "text" })
	serviceIdentifier: string

	@Column({ type: "jsonb" })
	createdBy: Actor

	@Column({ type: "text" })
	planIdentifier: string

	@Column({ type: "text" })
	planStepIdentifier: string

	@Column({ type: "text" })
	toolCallIdentifier: string

	@Column({ type: "text" })
	statusNote: string

	@Column({ type: "text" })
	createdAt: string

	@Column({ type: "text" })
	updatedAt: string
}
