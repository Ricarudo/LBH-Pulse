import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import type {
  AddAdHocQuoteItemInput,
  AddQuoteItemInput,
  AddQuoteKitInput,
  ReorderQuoteItemsInput,
  UpdateQuoteItemInput
} from "@pulse/contracts/items";
import {
  addAdHocQuoteItem,
  addQuoteItem,
  addQuoteKit,
  removeQuoteItem,
  reorderQuoteItems,
  updateQuoteItem
} from "@/lib/services/workService";

@Injectable()
export class QuoteItemsService {
  addCatalog(quoteId: string, input: AddQuoteItemInput, user: AuthenticatedUser) {
    return addQuoteItem(quoteId, input, user);
  }

  addKit(quoteId: string, input: AddQuoteKitInput, user: AuthenticatedUser) {
    return addQuoteKit(quoteId, input, user);
  }

  addAdHoc(
    quoteId: string,
    input: AddAdHocQuoteItemInput,
    user: AuthenticatedUser
  ) {
    return addAdHocQuoteItem(quoteId, input, user);
  }

  update(
    quoteId: string,
    quoteItemId: string,
    input: UpdateQuoteItemInput,
    user: AuthenticatedUser
  ) {
    return updateQuoteItem(quoteId, quoteItemId, input, user);
  }

  remove(quoteId: string, quoteItemId: string, user: AuthenticatedUser) {
    return removeQuoteItem(quoteId, quoteItemId, user);
  }

  reorder(
    quoteId: string,
    input: ReorderQuoteItemsInput,
    user: AuthenticatedUser
  ) {
    return reorderQuoteItems(quoteId, input, user);
  }
}
