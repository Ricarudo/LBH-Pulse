import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Express, Request, Response } from "express";
import { memoryStorage } from "multer";
import {
  clientCsvTemplate,
  commitClientBulkCsv,
  exportClientCsv,
  previewClientBulkCsv
} from "@/lib/services/clientBulkService";
import type { ClientBulkCommitSelection } from "@/types/clientBulk";
import { AuthError, AuthService } from "@/shared/auth.service";

const csvUpload = FileInterceptor("file", {
  storage: memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  }
});

function sendCsv(response: Response, filename: string, csv: string) {
  response
    .status(200)
    .setHeader("Content-Type", "text/csv; charset=utf-8")
    .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    .send(Buffer.from(csv, "utf8"));
}

@Controller("clients/bulk")
export class ClientBulkController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("template")
  async template(@Req() request: Request, @Res() response: Response) {
    await this.auth.requireUser(request, "crm:read");
    sendCsv(response, "pulse-client-import-template.csv", clientCsvTemplate());
  }

  @Get("export")
  async export(@Req() request: Request, @Res() response: Response) {
    await this.auth.requireUser(request, "crm:read");
    const date = new Date().toISOString().slice(0, 10);
    sendCsv(response, `pulse-clients-${date}.csv`, await exportClientCsv());
  }

  @Post("preview")
  @HttpCode(200)
  @UseInterceptors(csvUpload)
  async preview(
    @Req() request: Request,
    @UploadedFile() file?: Express.Multer.File
  ) {
    await this.auth.requireUser(request, "crm:read");
    if (!file) throw new Error("CLIENT_BULK_FILE_REQUIRED");
    const preview = await previewClientBulkCsv(file);
    return { preview };
  }

  @Post("commit")
  @HttpCode(200)
  @UseInterceptors(csvUpload)
  async commit(
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("fileDigest") fileDigest?: string,
    @Body("selections") rawSelections?: string
  ) {
    const user = await this.auth.requireUser(request, "crm:write");
    if (user.role !== "Admin") {
      throw new AuthError("Admin access is required to import clients.", 403);
    }
    if (!file) throw new Error("CLIENT_BULK_FILE_REQUIRED");
    if (!fileDigest || !rawSelections) {
      throw new Error("CLIENT_BULK_INVALID_SELECTION");
    }

    let selections: ClientBulkCommitSelection[];
    try {
      selections = JSON.parse(rawSelections) as ClientBulkCommitSelection[];
    } catch {
      throw new Error("CLIENT_BULK_INVALID_SELECTION");
    }

    const result = await commitClientBulkCsv(
      file,
      fileDigest,
      selections,
      user
    );
    return { result };
  }
}
