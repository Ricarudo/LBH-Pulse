import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Express, Request, Response } from "express";
import { memoryStorage } from "multer";
import type { BulkImportCommitSelection } from "@pulse/contracts/bulk-import";
import { importerFor } from "@/lib/importers/importerRegistry";
import { AuthService } from "@/shared/auth.service";

const csvUpload = FileInterceptor("file", {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

function sendCsv(response: Response, filename: string, csv: string) {
  response
    .status(200)
    .setHeader("Content-Type", "text/csv; charset=utf-8")
    .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    .send(Buffer.from(csv, "utf8"));
}

@Controller("importers/:importerKey")
export class BulkImportController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("template")
  async template(
    @Param("importerKey") importerKey: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const importer = importerFor(importerKey);
    await this.auth.requireUser(request, importer.readPermission);
    sendCsv(response, importer.templateFileName, importer.template());
  }

  @Get("export")
  async export(
    @Param("importerKey") importerKey: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const importer = importerFor(importerKey);
    await this.auth.requireUser(request, importer.readPermission);
    const date = new Date().toISOString().slice(0, 10);
    sendCsv(response, importer.exportFileName(date), await importer.export());
  }

  @Post("preview")
  @HttpCode(200)
  @UseInterceptors(csvUpload)
  async preview(
    @Param("importerKey") importerKey: string,
    @Req() request: Request,
    @UploadedFile() file?: Express.Multer.File
  ) {
    const importer = importerFor(importerKey);
    await this.auth.requireUser(request, importer.readPermission);
    if (!file) throw new Error("BULK_IMPORT_FILE_REQUIRED");
    return { preview: await importer.preview(file) };
  }

  @Post("commit")
  @HttpCode(200)
  @UseInterceptors(csvUpload)
  async commit(
    @Param("importerKey") importerKey: string,
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("fileDigest") fileDigest?: string,
    @Body("selections") rawSelections?: string
  ) {
    const importer = importerFor(importerKey);
    const user = await this.auth.requireUser(request, importer.writePermission);
    if (!file) throw new Error("BULK_IMPORT_FILE_REQUIRED");
    if (!fileDigest || !rawSelections) throw new Error("BULK_IMPORT_INVALID_SELECTION");
    let selections: BulkImportCommitSelection[];
    try {
      selections = JSON.parse(rawSelections) as BulkImportCommitSelection[];
    } catch {
      throw new Error("BULK_IMPORT_INVALID_SELECTION");
    }
    return {
      result: await importer.commit(file, fileDigest, selections, user)
    };
  }
}
