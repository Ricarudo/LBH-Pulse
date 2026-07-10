import { Module } from "@nestjs/common";
import { ProposalsController } from "@/modules/proposals/proposals.controller";
import { ProposalsService } from "@/modules/proposals/proposals.service";

@Module({
  controllers: [ProposalsController],
  providers: [ProposalsService]
})
export class ProposalsModule {}
