import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "@/app.module";
import { ApiExceptionFilter } from "@/shared/api-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:4300";

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: frontendOrigin,
    credentials: true
  });
  app.useGlobalFilters(new ApiExceptionFilter());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
