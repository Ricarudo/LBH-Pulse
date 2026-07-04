import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/services/activityService";
import type { AuthenticatedUser } from "@/lib/auth/permissions";
import type { RequestChecklistTemplateRecord } from "@/types/requestChecklistTemplate";
import type { UpdateRequestChecklistTemplateInput } from "@/lib/validations/requestChecklistTemplate";

type TemplateWithItems = Prisma.RequestChecklistTemplateGetPayload<{
  include: { items: true };
}>;

function matchType(template: Pick<TemplateWithItems, "key" | "requestType" | "serviceCategory">) {
  if (template.key === "general") return "CORE" as const;
  if (template.serviceCategory) return "TRADE" as const;
  return "REQUEST_TYPE" as const;
}

function toTemplateRecord(template: TemplateWithItems): RequestChecklistTemplateRecord {
  return {
    id: template.id,
    key: template.key,
    name: template.name,
    requestType: (template.requestType ?? "") as RequestChecklistTemplateRecord["requestType"],
    serviceCategory: (template.serviceCategory ?? "") as RequestChecklistTemplateRecord["serviceCategory"],
    active: template.active,
    archivedAt: template.archivedAt?.toISOString() ?? "",
    matchType: matchType(template),
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    items: template.items
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description ?? "",
        required: item.required,
        appliesWhen: item.appliesWhen ?? "",
        sortOrder: item.sortOrder,
        group: item.group ?? "",
        active: item.active
      }))
  };
}

async function findTemplateById(id: string) {
  return prisma.requestChecklistTemplate.findUnique({
    where: { id },
    include: { items: true }
  });
}

async function assertUniqueActiveMapping(
  templateId: string | undefined,
  input: UpdateRequestChecklistTemplateInput
) {
  if (!input.active) return;
  const mapping = input.serviceCategory
    ? { serviceCategory: input.serviceCategory }
    : input.requestType
      ? { requestType: input.requestType }
      : null;
  if (!mapping) throw new Error("REQUEST_CHECKLIST_TEMPLATE_MAPPING_REQUIRED");

  const duplicate = await prisma.requestChecklistTemplate.findFirst({
    where: {
      ...(templateId ? { id: { not: templateId } } : {}),
      active: true,
      archivedAt: null,
      ...mapping
    }
  });
  if (duplicate) throw new Error("REQUEST_CHECKLIST_TEMPLATE_DUPLICATE_MAPPING");
}

function assertActiveItems(input: UpdateRequestChecklistTemplateInput) {
  if (input.active && input.items.every((item) => !item.active)) {
    throw new Error("REQUEST_CHECKLIST_TEMPLATE_EMPTY");
  }
}

async function uniqueKey(name: string) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "checklist";
  let key = base;
  let suffix = 2;
  while (await prisma.requestChecklistTemplate.findUnique({ where: { key } })) {
    key = `${base}-${suffix++}`;
  }
  return key;
}

export async function listRequestChecklistTemplates() {
  const templates = await prisma.requestChecklistTemplate.findMany({
    include: { items: true },
    orderBy: [
      { archivedAt: "asc" },
      { active: "desc" },
      { name: "asc" }
    ]
  });
  return templates.map(toTemplateRecord);
}

export async function createRequestChecklistTemplate(
  input: UpdateRequestChecklistTemplateInput,
  user?: AuthenticatedUser
) {
  if (!input.requestType && !input.serviceCategory) {
    throw new Error("REQUEST_CHECKLIST_TEMPLATE_MAPPING_REQUIRED");
  }
  const key = await uniqueKey(input.name);
  const template = await prisma.requestChecklistTemplate.create({
    data: {
      key,
      name: input.name,
      requestType: input.requestType || null,
      serviceCategory: input.serviceCategory || null,
      active: false,
      items: {
        create: input.items.map(({ id: _id, ...item }) => ({
          ...item,
          description: item.description || null,
          appliesWhen: item.appliesWhen || null,
          group: item.group || null
        }))
      }
    },
    include: { items: true }
  });
  await recordActivity({
    user,
    relatedEntityType: "RequestChecklistTemplate",
    relatedEntityId: template.id,
    type: "Created",
    title: `${template.name} checklist template created`,
    detail: "A request checklist template was created."
  });
  return toTemplateRecord(template);
}

export async function updateRequestChecklistTemplate(
  id: string,
  input: UpdateRequestChecklistTemplateInput,
  user?: AuthenticatedUser
) {
  const existing = await findTemplateById(id);
  if (!existing) throw new Error("REQUEST_CHECKLIST_TEMPLATE_NOT_FOUND");
  if (existing.archivedAt) throw new Error("REQUEST_CHECKLIST_TEMPLATE_ARCHIVED");
  if (existing.key === "general") {
    if (!input.active) throw new Error("REQUEST_CHECKLIST_TEMPLATE_FALLBACK_REQUIRED");
    input = { ...input, requestType: "", serviceCategory: "" };
  } else if (!input.requestType && !input.serviceCategory) {
    throw new Error("REQUEST_CHECKLIST_TEMPLATE_MAPPING_REQUIRED");
  }
  assertActiveItems(input);
  if (existing.key !== "general") await assertUniqueActiveMapping(id, input);

  const existingItemIds = new Set(existing.items.map((item) => item.id));
  for (const item of input.items) {
    if (item.id && !existingItemIds.has(item.id)) {
      throw new Error("REQUEST_CHECKLIST_TEMPLATE_ITEM_INVALID");
    }
  }

  const template = await prisma.$transaction(async (tx) => {
    await tx.requestChecklistTemplate.update({
      where: { id },
      data: {
        name: input.name,
        requestType: input.requestType || null,
        serviceCategory: input.serviceCategory || null,
        active: input.active
      }
    });
    const payloadIds = input.items.map((item) => item.id).filter(Boolean);
    await tx.requestChecklistTemplateItem.updateMany({
      where: { templateId: id, id: { notIn: payloadIds } },
      data: { active: false }
    });
    for (const item of input.items) {
      const data = {
        label: item.label,
        description: item.description || null,
        required: item.required,
        appliesWhen: item.appliesWhen || null,
        sortOrder: item.sortOrder,
        group: item.group || null,
        active: item.active
      };
      if (item.id) {
        await tx.requestChecklistTemplateItem.update({ where: { id: item.id }, data });
      } else {
        await tx.requestChecklistTemplateItem.create({ data: { ...data, templateId: id } });
      }
    }
    return tx.requestChecklistTemplate.findUniqueOrThrow({
      where: { id },
      include: { items: true }
    });
  });
  await recordActivity({
    user,
    relatedEntityType: "RequestChecklistTemplate",
    relatedEntityId: template.id,
    type: "Updated",
    title: `${template.name} checklist template updated`,
    detail: "Request checklist template settings were changed."
  });
  return toTemplateRecord(template);
}

export async function duplicateRequestChecklistTemplate(id: string, user?: AuthenticatedUser) {
  const source = await findTemplateById(id);
  if (!source) throw new Error("REQUEST_CHECKLIST_TEMPLATE_NOT_FOUND");
  const key = await uniqueKey(`${source.name} Copy`);
  const copy = await prisma.requestChecklistTemplate.create({
    data: {
      key,
      name: `${source.name} Copy`,
      requestType: source.requestType,
      serviceCategory: source.key === "general" ? "Other" : source.serviceCategory,
      active: false,
      items: {
        create: source.items.map((item) => ({
          label: item.label,
          description: item.description,
          required: item.required,
          appliesWhen: item.appliesWhen,
          sortOrder: item.sortOrder,
          group: item.group,
          active: item.active
        }))
      }
    },
    include: { items: true }
  });
  await recordActivity({
    user,
    relatedEntityType: "RequestChecklistTemplate",
    relatedEntityId: copy.id,
    type: "Created",
    title: `${copy.name} duplicated`,
    detail: `Duplicated from ${source.name}.`
  });
  return toTemplateRecord(copy);
}

export async function archiveRequestChecklistTemplate(id: string, user?: AuthenticatedUser) {
  const existing = await findTemplateById(id);
  if (!existing) throw new Error("REQUEST_CHECKLIST_TEMPLATE_NOT_FOUND");
  if (existing.key === "general") throw new Error("REQUEST_CHECKLIST_TEMPLATE_FALLBACK_REQUIRED");
  const template = await prisma.requestChecklistTemplate.update({
    where: { id },
    data: { active: false, archivedAt: new Date() },
    include: { items: true }
  });
  await recordActivity({
    user,
    relatedEntityType: "RequestChecklistTemplate",
    relatedEntityId: id,
    type: "Archived",
    title: `${template.name} checklist template archived`,
    detail: "Archived templates no longer apply to new Requests."
  });
  return toTemplateRecord(template);
}

export async function restoreRequestChecklistTemplate(id: string, user?: AuthenticatedUser) {
  const existing = await findTemplateById(id);
  if (!existing) throw new Error("REQUEST_CHECKLIST_TEMPLATE_NOT_FOUND");
  const template = await prisma.requestChecklistTemplate.update({
    where: { id },
    data: { active: false, archivedAt: null },
    include: { items: true }
  });
  await recordActivity({
    user,
    relatedEntityType: "RequestChecklistTemplate",
    relatedEntityId: id,
    type: "Restored",
    title: `${template.name} checklist template restored`,
    detail: "The restored template remains inactive until reviewed."
  });
  return toTemplateRecord(template);
}
