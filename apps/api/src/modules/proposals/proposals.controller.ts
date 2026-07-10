import { Body, Controller, Inject, Param, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import { updateQuoteProposalSchema } from "@pulse/contracts/items";
import { AuthService } from "@/shared/auth.service";
import { ProposalsService } from "@/modules/proposals/proposals.service";

@Controller("quotes/:quoteId/proposal")
export class ProposalsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ProposalsService) private readonly proposals: ProposalsService
  ) {}

  @Patch()
  async update(
    @Req() request: Request,
    @Param("quoteId") quoteId: string,
    @Body() body: unknown
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    return {
      quote: await this.proposals.update(
        quoteId,
        updateQuoteProposalSchema.parse(body),
        user
      )
    };
  }
}
