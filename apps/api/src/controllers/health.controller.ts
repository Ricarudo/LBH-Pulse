import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { prisma } from "@/lib/db";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return { status: "ok", service: "pulse-api" };
  }

  @Get("database")
  async databaseHealth(@Res({ passthrough: true }) response: Response) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "postgres" };
    } catch (error) {
      response.status(503);
      return {
        status: "unavailable",
        database: "postgres",
        errors: error instanceof Error ? error.message : error
      };
    }
  }
}
