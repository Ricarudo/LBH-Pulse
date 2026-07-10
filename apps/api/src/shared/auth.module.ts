import { Global, Module } from "@nestjs/common";
import { AuthService } from "@/shared/auth.service";

@Global()
@Module({
  providers: [AuthService],
  exports: [AuthService]
})
export class AuthModule {}
