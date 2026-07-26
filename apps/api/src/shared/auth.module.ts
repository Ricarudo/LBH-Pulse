import { Global, Module } from "@nestjs/common";
import { AuthService } from "@/shared/auth.service";
import { AuthProtectionService } from "@/shared/auth-protection.service";
import { CsrfMiddleware } from "@/shared/csrf.middleware";
import { FirstRunSetupService } from "@/shared/first-run-setup.service";

@Global()
@Module({
  providers: [AuthService, AuthProtectionService, CsrfMiddleware, FirstRunSetupService],
  exports: [AuthService, AuthProtectionService, CsrfMiddleware, FirstRunSetupService]
})
export class AuthModule {}
