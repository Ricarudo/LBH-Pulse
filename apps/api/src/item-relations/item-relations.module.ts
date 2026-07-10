import { Module } from "@nestjs/common";
import { ItemRelationsService } from "@/item-relations/item-relations.service";

@Module({
  providers: [ItemRelationsService],
  exports: [ItemRelationsService]
})
export class ItemRelationsModule {}
