import { Actor } from "@common/types/identity.type"
import { TASK_PRIORITIES, TASK_STATUSES } from "@tasks/constants/task.constant"

export type TaskStatus = (typeof TASK_STATUSES)[number]

export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export interface TaskAssignee {
	readonly name: string
	readonly role: string
}

export interface TaskRecord {
	readonly identifier: string
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly title: string
	readonly description: string
	readonly assignee: TaskAssignee
	readonly priority: TaskPriority
	readonly status: TaskStatus
	readonly serviceIdentifier: string
	readonly createdBy: Actor
	readonly planIdentifier: string
	readonly planStepIdentifier: string
	readonly toolCallIdentifier: string
	readonly statusNote: string
	readonly createdAt: string
	readonly updatedAt: string
}

export interface CreateTaskCommand {
	readonly runIdentifier: string
	readonly incidentIdentifier: string
	readonly title: string
	readonly description: string
	readonly assignee: TaskAssignee
	readonly priority: TaskPriority
	readonly serviceIdentifier: string
	readonly createdBy: Actor
	readonly planIdentifier: string
	readonly planStepIdentifier: string
	readonly toolCallIdentifier: string
}

export interface TaskUpdatedEvent {
	readonly task: TaskRecord
}
