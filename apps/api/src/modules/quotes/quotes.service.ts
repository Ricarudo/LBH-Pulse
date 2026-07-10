import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import type {
  ConvertQuoteInput,
  CreateQuoteInput,
  UpdateQuoteInput
} from "@pulse/contracts/work";
import {
  archiveQuote,
  convertQuoteToProject,
  createQuote,
  getQuoteById,
  listQuotes,
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

  get(id: string) {
    return getQuoteById(id);
  }

  update(id: string, input: UpdateQuoteInput, user: AuthenticatedUser) {
    return updateQuote(id, input, user);
  }

  archive(id: string, user: AuthenticatedUser) {
    return archiveQuote(id, user);
  }

  convert(id: string, input: ConvertQuoteInput, user: AuthenticatedUser) {
    return convertQuoteToProject(id, input, user);
  }
}
