import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { recordActivity } from "@/lib/services/activityService";
import type { AuthenticatedUser } from "@/lib/auth/permissions";
import type { RequestChecklistTemplateRecord } from "@/types/requestChecklistTemplate";
import type { UpdateRequestChecklistTemplateInput } from "@/lib/validations/requestChecklistTemplate";

type TemplateWithItems = Prisma.RequestChecklistTemplateGetPayload<{
  include: { items: true };
}>;

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function toTemplateRecord(
  template: TemplateWithItems
): RequestChecklistTemplateRecord {
  return {
    id: template.id,
    key: template.key,
    name: template.name,
    requestType: (template.requestType ?? "") as RequestChecklistTemplateRecord["requestType"],
    serviceCategory: (template.serviceCategory ?? "") as RequestChecklistTemplateRecord["serviceCategory"],
    active: template.active,
    createdAt: formatDateTime(template.createdAt),
    updatedAt: formatDateTime(template.updatedAt),
    items: template.items.map((item) => ({
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
    include: {
      items: {
        orderBy: [
          { sortOrder: "asc" },
          { label: "asc" }
        ]
      }
    }
  });
}

async function assertUniqueActiveMapping(
  templateId: string,
  input: UpdateRequestChecklistTemplateInput
) {
  if (!input.active) {
    return;
  }

  if (input.serviceCategory) {
    const duplicate = await prisma.requestChecklistTemplate.findFirst({
      where: {
        id: { not: templateId },
        active: true,
        serviceCategory: input.serviceCategory
      }
    });

    if (duplicate) {
      throw new Error("REQUEST_CHECKLIST_TEMPLATE_DUPLICATE_MAPPING");
    }
  }

  if (input.requestType) {
    const duplicate = await prisma.requestChecklistTemplate.findFirst({
      where: {
        id: { not: templateId },
        active: true,
        requestType: input.requestType
      }
    });

    if (duplicate) {
      throw new Error("REQUEST_CHECKLIST_TEMPLATE_DUPLICATE_MAPPING");
    }
  }
}

export async function listRequestChecklistTemplates() {
  const templates = await prisma.requestChecklistTemplate.findMany({
    include: {
      items: {
        orderBy: [
          { sortOrder: "asc" },
          { label: "asc" }
        ]
      }
    },
    orderBy: [
      { active: "desc" },
      { serviceCategory: "asc" },
      { requestType: "asc" },
      { name: "asc" }
    ]
  });

  return templates.map(toTemplateRecord);
}

export async function updateRequestChecklistTemplate(
  id: string,
  input: UpdateRequestChecklistTemplateInput,
  user?: AuthenticatedUser
) {
  const existingTemplate = await findTemplateById(id);

  if (!existingTemplate) {
    throw new Error("REQUEST_CHECKLIST_TEMPLATE_NOT_FOUND");
  }

  if (existingTemplate.key === "general" && !input.active) {
    throw new Error("REQUEST_CHECKLIST_TEMPLATE_FALLBACK_REQUIRED");
  }

  if (input.active && input.items.every((item) => !item.active)) {
    throw new Error("REQUEST_CHECKLIST_TEMPLATE_EMPTY");
  }

  await assertUniqueActiveMapping(id, input);

  const existingItemIds = new Set(existingTemplate.items.map((item) => item.id));
  const payloadItemIds = new Set(input.items.map((item) => item.id).filter(Boolean));

  for (const item of input.items) {
    if (item.id && !existingItemIds.has(item.id)) {
      throw new Error("REQUEST_CHECKLIST_TEMPLATE_ITEM_INVALID");
    }
  }

  const template = await prisma.$transaction(async (tx) => {
    await tx.request.updateMany({
      where: {
        checklistTemplateId: id,
        checklistTemplateNameSnapshot: null
      },
      data: {
        checklistTemplateNameSnapshot: existingTemplate.name
      }
    });

    await tx.requestChecklistTemplate.update({
      where: { id },
      data: {
        name: input.name,
        requestType: input.requestType || null,
        serviceCategory: input.serviceCategory || null,
        active: input.active
      }
    });

    const omittedItemIds = existingTemplate.items
      .map((item) => item.id)
      .filter((itemId) => !payloadItemIds.has(itemId));

    if (omittedItemIds.length) {
      await tx.requestChecklistTemplateItem.updateMany({
        where: {
          templateId: id,
          id: { in: omittedItemIds }
        },
        data: {
          active: false
        }
      });
    }

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
        await tx.requestChecklistTemplateItem.updateMany({
          where: {
            id: item.id,
            templateId: id
          },
          data
        });
      } else {
        await tx.requestChecklistTemplateItem.create({
          data: {
            ...data,
            templateId: id
          }
        });
      }
    }

    return tx.requestChecklistTemplate.findUniqueOrThrow({
      where: { id },
      include: {
        items: {
          orderBy: [
            { sortOrder: "asc" },
            { label: "asc" }
          ]
        }
      }
    });
  });

  await recordActivity({
    user,
    relatedEntityType: "RequestChecklistTemplate",
    relatedEntityId: template.id,
    type: "Updated",
    title: `${template.name} checklist template updated`,
    detail: "Request checklist template settings were changed.",
    metadata: {
      templateKey: template.key,
      active: template.active,
      requestType: template.requestType,
      serviceCategory: template.serviceCategory,
      activeItemCount: template.items.filter((item) => item.active).length
    }
  });

  return toTemplateRecord(template);
}
