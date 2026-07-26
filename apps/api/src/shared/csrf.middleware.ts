import { Injectable } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { runtimeEnvironment } from "@/config/runtimeEnvironment";
import { AuthProtectionService } from "@/shared/auth-protection.service";
import type { AuthService } from "@/shared/auth.service";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class CsrfMiddleware {
  constructor(private readonly protection: AuthProtectionService) {}

  private requestOrigin(request: Request) {
    const origin = request.header("origin");
    if (origin) {
      try {
        return new URL(origin).origin;
      } catch {
        return null;
      }
    }
    const referer = request.header("referer");
    if (!referer) return null;
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  private async reject(response: Response, reason: string) {
    await this.protection
      .recordSecurityEvent("CSRF_REJECTED", undefined, { reason })
      .catch(() => undefined);
    response.status(403).json({ error: "Request could not be verified." });
  }

  async use(request: Request, response: Response, next: NextFunction, auth: AuthService) {
    if (safeMethods.has(request.method.toUpperCase())) {
      next();
      return;
    }

    const config = runtimeEnvironment();
    const origin = this.requestOrigin(request);
    const fetchSite = request.header("sec-fetch-site");
    if (!origin || !config.allowedOrigins.includes(origin)) {
      await this.reject(response, "origin");
      return;
    }
    if (fetchSite && fetchSite !== "same-origin") {
      await this.reject(response, "fetch-site");
      return;
    }

    const path = request.originalUrl.split("?", 1)[0];
    if (path === "/api/auth/login" || path === "/api/auth/setup") {
      if (request.header("x-pulse-request") !== "browser") {
        await this.reject(response, "login-header");
        return;
      }
      next();
      return;
    }

    if (!(await auth.verifyCsrf(request))) {
      await this.reject(response, "token");
      return;
    }
    next();
  }
}
