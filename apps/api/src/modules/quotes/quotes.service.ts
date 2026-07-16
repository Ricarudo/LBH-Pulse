import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import type {
  ConvertQuoteInput,
  CreateQuoteRevisionInput,
  CreateQuoteInput,
  ReplaceLegacyQuoteFinancialsInput,
  SwitchQuoteCalculationModeInput,
  UpdateQuoteInput
} from "@pulse/contracts/work";
import {
  archiveQuote,
  convertQuoteToProject,
  createQuote,
  createQuoteRevision,
  getQuoteRevision,
  getQuoteById,
  listQuotes,
  replaceLegacyQuoteFinancials,
  switchQuoteCalculationMode,
  updateQuote
} from "@/lib/services/workService";

@Injectable()
export class QuotesService {
  list() {
    return listQuotes();
  }

  create(input: CreateQuoteInput, user: AuthenticatedUser) {
    return createQuote(input, user);
  }

  get(id: string, viewerId?: string) {
    return getQuoteById(id, viewerId);
  }

  getRevision(id: string, version: string) {
    return getQuoteRevision(id, version);
  }

  update(id: string, input: UpdateQuoteInput, user: AuthenticatedUser) {
    return updateQuote(id, input, user);
  }

  replaceLegacyFinancials(id: string, input: ReplaceLegacyQuoteFinancialsInput, user: AuthenticatedUser) {
    return replaceLegacyQuoteFinancials(id, input, user);
  }

  switchCalculationMode(id: string, input: SwitchQuoteCalculationModeInput, user: AuthenticatedUser) {
    return switchQuoteCalculationMode(id, input, user);
  }

  archive(id: string, user: AuthenticatedUser) {
    return archiveQuote(id, user);
  }

  convert(id: string, input: ConvertQuoteInput, user: AuthenticatedUser) {
    return convertQuoteToProject(id, input, user);
  }


  createRevision(id: string, input: CreateQuoteRevisionInput, user: AuthenticatedUser) {
    return createQuoteRevision(id, input, user);
  }
}
