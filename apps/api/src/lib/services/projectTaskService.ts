import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { createWorkSystemUpdate, resolveWorkAssignee } from "@/lib/services/workUpdateService";
import {
  calculateProjectProgress,
  projectTaskInclude,
  toProjectTask
} from "@/lib/services/workService";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import type {
  CreateProjectTaskInput,
  ProjectTasksResponse,
  ReorderProjectTasksInput,
  UpdateProjectTaskInput
} from "@pulse/contracts/work";

async function projectIdOrThrow(id: string, db: typeof prisma | Prisma.TransactionClient = prisma) {
  const project = await db.project.findFirst({
    where: { archivedAt: null, OR: [{ id }, { projectNumber: id }] },
    select: { id: true, projectNumber: true }
  });
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return project;
}

async function taskState(projectId: string): Promise<ProjectTasksResponse> {
  const tasks = await prisma.projectTask.findMany({
    where: { projectId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: projectTaskInclude
  });
  return {
    tasks: tasks.map(toProjectTask),
    progress: calculateProjectProgress(tasks)
  };
}

export async function createProjectTask(
  projectReference: string,
  input: CreateProjectTaskInput,
  user?: AuthenticatedUser
) {
  const project = await projectIdOrThrow(projectReference);
  const task = await prisma.$transaction(async (tx) => {
    const assignedTo = await resolveWorkAssignee("project", input.assignedToId, tx);
    const aggregate = await tx.projectTask.aggregate({
      where: { projectId: project.id, archivedAt: null },
      _max: { sortOrder: true }
    });
    const created = await tx.projectTask.create({
      data: {
        projectId: project.id,
        title: input.title,
        status: input.status,
        weight: input.weight,
        assignedToId: assignedTo?.id ?? null,
        dueDate: input.dueDate ? new Date(`${input.dueDate}T12:00:00.000Z`) : null,
        notes: input.notes || null,
        sortOrder: (aggregate._max.sortOrder ?? -1) + 1,
        completedAt: input.status === "DONE" ? new Date() : null
      },
      include: projectTaskInclude
    });
    await createWorkSystemUpdate(tx, {
      stage: "project",
      recordId: project.id,
      title: `Task added: ${created.title}`,
      body: `Weight ${created.weight}${assignedTo ? ` · Assigned to ${assignedTo.name}` : ""}`,
      user,
      metadata: { eventType: "project_task_created", taskId: created.id }
    });
    return created;
  });
  return { task: toProjectTask(task), progress: (await taskState(project.id)).progress };
}

export async function updateProjectTask(
  projectReference: string,
  taskId: string,
  input: UpdateProjectTaskInput,
  user?: AuthenticatedUser
) {
  const project = await projectIdOrThrow(projectReference);
  const existing = await prisma.projectTask.findFirst({
    where: { id: taskId, projectId: project.id, archivedAt: null },
    include: projectTaskInclude
  });
  if (!existing) throw new Error("PROJECT_TASK_NOT_FOUND");
  const task = await prisma.$transaction(async (tx) => {
    const assignedTo = input.assignedToId !== undefined
      ? await resolveWorkAssignee("project", input.assignedToId, tx)
      : undefined;
    const updated = await tx.projectTask.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.status !== undefined
          ? {
              status: input.status,
              completedAt: input.status === "DONE"
                ? existing.completedAt ?? new Date()
                : null
            }
          : {}),
        ...(input.weight !== undefined ? { weight: input.weight } : {}),
        ...(input.assignedToId !== undefined ? { assignedToId: assignedTo?.id ?? null } : {}),
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(`${input.dueDate}T12:00:00.000Z`) : null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {})
      },
      include: projectTaskInclude
    });
    const changes: string[] = [];
    if (input.status !== undefined && input.status !== existing.status) {
      changes.push(`${existing.status} → ${input.status}`);
    }
    if (input.weight !== undefined && input.weight !== existing.weight) {
      changes.push(`weight ${existing.weight} → ${input.weight}`);
    }
    if (input.assignedToId !== undefined && input.assignedToId !== existing.assignedToId) {
      changes.push(`assigned to ${assignedTo?.name ?? "Unassigned"}`);
    }
    if (changes.length) {
      await createWorkSystemUpdate(tx, {
        stage: "project",
        recordId: project.id,
        title: `${updated.title} updated`,
        body: changes.join(" · "),
        user,
        metadata: { eventType: "project_task_updated", taskId: updated.id }
      });
    }
    return updated;
  });
  return { task: toProjectTask(task), progress: (await taskState(project.id)).progress };
}

export async function archiveProjectTask(
  projectReference: string,
  taskId: string,
  user?: AuthenticatedUser
) {
  const project = await projectIdOrThrow(projectReference);
  const existing = await prisma.projectTask.findFirst({
    where: { id: taskId, projectId: project.id, archivedAt: null },
    select: { id: true, title: true }
  });
  if (!existing) throw new Error("PROJECT_TASK_NOT_FOUND");
  await prisma.$transaction(async (tx) => {
    await tx.projectTask.update({ where: { id: existing.id }, data: { archivedAt: new Date() } });
    await createWorkSystemUpdate(tx, {
      stage: "project",
      recordId: project.id,
      title: `Task archived: ${existing.title}`,
      user,
      metadata: { eventType: "project_task_archived", taskId: existing.id }
    });
  });
  return taskState(project.id);
}

export async function reorderProjectTasks(
  projectReference: string,
  input: ReorderProjectTasksInput
) {
  const project = await projectIdOrThrow(projectReference);
  await prisma.$transaction(async (tx) => {
    const active = await tx.projectTask.findMany({
      where: { projectId: project.id, archivedAt: null },
      select: { id: true }
    });
    const activeIds = new Set(active.map((task) => task.id));
    if (
      input.taskIds.length !== active.length ||
      input.taskIds.some((id) => !activeIds.has(id))
    ) {
      throw new Error("PROJECT_TASK_ORDER_INVALID");
    }
    await Promise.all(input.taskIds.map((id, sortOrder) =>
      tx.projectTask.update({ where: { id }, data: { sortOrder } })
    ));
  });
  return taskState(project.id);
}
