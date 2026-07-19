import { Module } from "@nestjs/common";
import { AuditController } from "@/controllers/audit.controller";
import { AnalyticsController } from "@/controllers/analytics.controller";
import { AuthController } from "@/controllers/auth.controller";
import { BulkImportController } from "@/controllers/bulkImport.controller";
import { ClientBulkController } from "@/controllers/clientBulk.controller";
import { ClientsController } from "@/controllers/clients.controller";
import { HealthController } from "@/controllers/health.controller";
import { InvoicesController } from "@/controllers/invoices.controller";
import { ProjectsController } from "@/controllers/projects.controller";
import { RequestsController } from "@/controllers/requests.controller";
import { SearchController } from "@/controllers/search.controller";
import { SettingsController } from "@/controllers/settings.controller";
import { DocumentsController } from "@/controllers/documents.controller";
import { DashboardController } from "@/controllers/dashboard.controller";
import { AuthModule } from "@/shared/auth.module";
import { PrismaModule } from "@/shared/prisma.module";
import { ProposalsModule } from "@/modules/proposals/proposals.module";
import { QuoteItemsModule } from "@/modules/quote-items/quote-items.module";
import { QuotesModule } from "@/modules/quotes/quotes.module";
import { ItemsModule } from "@/items/items.module";
import { ActivityRetentionService } from "@/lib/services/activityRetentionService";

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    ItemsModule,
    QuotesModule,
    QuoteItemsModule,
    ProposalsModule
  ],
  controllers: [
    AnalyticsController,
    AuditController,
    AuthController,
    BulkImportController,
    ClientBulkController,
    ClientsController,
    DashboardController,
    DocumentsController,
    HealthController,
    InvoicesController,
    ProjectsController,
    RequestsController,
    SearchController,
    SettingsController
  ],
  providers: [ActivityRetentionService]
})
export class AppModule {}
