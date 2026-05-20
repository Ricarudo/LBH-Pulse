import { Module } from "@nestjs/common";
import { ActivityController } from "@/controllers/activity.controller";
import { AuthController } from "@/controllers/auth.controller";
import { ClientsController } from "@/controllers/clients.controller";
import { HealthController } from "@/controllers/health.controller";
import { RequestsController } from "@/controllers/requests.controller";
import { SettingsController } from "@/controllers/settings.controller";
import { AuthService } from "@/shared/auth.service";

@Module({
  controllers: [
    ActivityController,
    AuthController,
    ClientsController,
    HealthController,
    RequestsController,
    SettingsController
  ],
  providers: [AuthService]
})
export class AppModule {}
