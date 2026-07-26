import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { parseRuntimeEnvironment, assertProductionDatabaseSafety } from "@/config/runtimeEnvironment";

async function bootstrap() {
  const config = parseRuntimeEnvironment();
  const [{ AppModule }, { ApiExceptionFilter }, { AuthService }, { CsrfMiddleware }] = await Promise.all([
    import("@/app.module"),
    import("@/shared/api-exception.filter"),
    import("@/shared/auth.service"),
    import("@/shared/csrf.middleware")
  ]);
  const app = await NestFactory.create(AppModule, {
    logger: config.nodeEnv === "production" ? ["error", "warn", "log"] : undefined
  });
  const express = app.getHttpAdapter().getInstance();
  express.set("trust proxy", config.trustProxyHops);

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: config.allowedOrigins,
    credentials: true
  });
  app.useGlobalFilters(new ApiExceptionFilter());

  const auth = app.get(AuthService);
  const csrf = app.get(CsrfMiddleware);
  app.use((request: Request, response: Response, next: NextFunction) => csrf.use(request, response, next, auth));
  app.enableShutdownHooks();

  await assertProductionDatabaseSafety(config);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Pulse failed to start safely.";
  console.error(message);
  process.exitCode = 1;
});
