import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "@pulse/contracts/auth";
import type { UpdateQuoteProposalInput } from "@pulse/contracts/items";
import { updateQuoteProposal } from "@/lib/services/workService";

@Injectable()
export class ProposalsService {
  update(
    quoteId: string,
    input: UpdateQuoteProposalInput,
    user: AuthenticatedUser
  ) {
    return updateQuoteProposal(quoteId, input, user);
  }
}
