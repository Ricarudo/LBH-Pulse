import { Module } from "@nestjs/common";
import { ActivityController } from "@/controllers/activity.controller";
import { AuthController } from "@/controllers/auth.controller";
import { ClientBulkController } from "@/controllers/clientBulk.controller";
import { ClientsController } from "@/controllers/clients.controller";
import { HealthController } from "@/controllers/health.controller";
import { InvoicesController } from "@/controllers/invoices.controller";
import { ProjectsController } from "@/controllers/projects.controller";
import { QuotesController } from "@/controllers/quotes.controller";
import { RequestsController } from "@/controllers/requests.controller";
import { SearchController } from "@/controllers/search.controller";
import { SettingsController } from "@/controllers/settings.controller";
import { DocumentsController } from "@/controllers/documents.controller";
import { AuthService } from "@/shared/auth.service";

@Module({
  controllers: [
    ActivityController,
    AuthController,
    ClientBulkController,
    ClientsController,
    DocumentsController,
    HealthController,
    InvoicesController,
    ProjectsController,
    QuotesController,
    RequestsController,
    SearchController,
    SettingsController
  ],
  providers: [AuthService]
})
export class AppModule {}
