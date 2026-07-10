import { Module } from "@nestjs/common";
import { ItemRelationsModule } from "@/item-relations/item-relations.module";
import { ItemsController } from "@/items/items.controller";
import { ItemsService } from "@/items/items.service";
import { PrismaModule } from "@/shared/prisma.module";

@Module({
  imports: [PrismaModule, ItemRelationsModule],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService]
})
export class ItemsModule {}
