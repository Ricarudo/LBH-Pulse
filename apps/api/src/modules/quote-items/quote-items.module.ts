import { Module } from "@nestjs/common";
import { QuoteItemsController } from "@/modules/quote-items/quote-items.controller";
import { QuoteItemsService } from "@/modules/quote-items/quote-items.service";

@Module({
  controllers: [QuoteItemsController],
  providers: [QuoteItemsService]
})
export class QuoteItemsModule {}
