import type { RequestType, ServiceCategory } from "@/types/request";

export type RequestChecklistTemplateItemRecord = {
  id: string;
  label: string;
  description: string;
  required: boolean;
  appliesWhen: string;
  sortOrder: number;
  group: string;
  active: boolean;
};

export type RequestChecklistTemplateRecord = {
  id: string;
  key: string;
  name: string;
  requestType: RequestType | "";
  serviceCategory: ServiceCategory | "";
  active: boolean;
  createdAt: string;
  updatedAt: string;
  items: RequestChecklistTemplateItemRecord[];
};
