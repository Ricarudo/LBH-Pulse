import { Module } from "@nestjs/common";
import { QuotesController } from "@/controllers/quotes.controller";
import { QuotesService } from "@/modules/quotes/quotes.service";

@Module({
  controllers: [QuotesController],
  providers: [QuotesService]
})
export class QuotesModule {}
