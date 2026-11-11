import type { BuilderConfigurationResponse, BuilderLoadResponse, BuilderSaveResponse, BuilderWorkspace, CalculationResult, CalculationSettings, LaborClass } from "@pulse/contracts/quote-builder";
import { apiRequest } from "./client";

const path = (id: string) => `/api/quotes/${encodeURIComponent(id)}/builder`;
export const loadQuoteBuilder = (id: string, signal?: AbortSignal) => apiRequest<BuilderLoadResponse>(path(id), { cache: "no-store", signal });
export const saveQuoteBuilder = (id: string, state: BuilderWorkspace, expectedWriteToken: number | null) => apiRequest<BuilderSaveResponse>(path(id), { method: "PUT", json: { state, expectedWriteToken } });
export const verifyBuilderCalculation = (id: string, state: BuilderWorkspace, configurationId: string) => apiRequest<{ calculation: CalculationResult; configurationId: string }>(`${path(id)}/calculate`, { method: "POST", json: { state, configurationId } });
export const loadCalculationConfiguration = (signal?: AbortSignal) => apiRequest<BuilderConfigurationResponse>("/api/settings/quote-calculation", { cache: "no-store", signal });
export const saveCalculationSettings = (settings: CalculationSettings, expectedConfigurationId: string) => apiRequest<BuilderConfigurationResponse>("/api/settings/quote-calculation", { method: "PUT", json: { settings, expectedConfigurationId } });
export const saveCompanyLaborClass = (input: Omit<LaborClass, "id">, id?: string) => apiRequest<BuilderConfigurationResponse>(id ? `/api/settings/labor-classes/${encodeURIComponent(id)}` : "/api/settings/labor-classes", { method: id ? "PATCH" : "POST", json: input });
