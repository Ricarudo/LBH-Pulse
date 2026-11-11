import { Module } from "@nestjs/common";
import { CalculationConfigService } from "./calculation-config.service";
import { CalculationConfigController } from "./calculation-config.controller";
import { QuoteBuilderController } from "./quote-builder.controller";
import { QuoteBuilderService } from "./quote-builder.service";

@Module({ controllers: [QuoteBuilderController, CalculationConfigController], providers: [QuoteBuilderService, CalculationConfigService] })
export class QuoteBuilderModule {}
