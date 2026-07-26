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
import type { ClientBulkCommitSelection } from "@pulse/contracts/client-bulk";
import { importerFor } from "@/lib/importers/importerRegistry";
import { legacyClientCommit, legacyClientPreview } from "@/lib/importers/clientImportCompatibility";
import { AuthService } from "@/shared/auth.service";

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

function deprecationHeaders(response: Response, successorPath: string) {
  response.setHeader("Deprecation", "true");
  response.setHeader("Link", `</api/importers/clients/${successorPath}>; rel=\"successor-version\"`);
  response.setHeader("Warning", '299 Pulse "Deprecated API; migrate to /api/importers/clients/* before Pulse 0.2."');
}

// Deprecated compatibility controller. It contains no import business logic;
// every operation delegates to the canonical importer registry.
@Controller("clients/bulk")
export class ClientBulkController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("template")
  async template(@Req() request: Request, @Res() response: Response) {
    const importer = importerFor("clients");
    await this.auth.requireUser(request, importer.readPermission);
    deprecationHeaders(response, "template");
    sendCsv(response, importer.templateFileName, importer.template());
  }

  @Get("export")
  async export(@Req() request: Request, @Res() response: Response) {
    const importer = importerFor("clients");
    await this.auth.requireUser(request, importer.readPermission);
    const date = new Date().toISOString().slice(0, 10);
    deprecationHeaders(response, "export");
    sendCsv(response, importer.exportFileName(date), await importer.export());
  }

  @Post("preview")
  @HttpCode(200)
  @UseInterceptors(csvUpload)
  async preview(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @UploadedFile() file?: Express.Multer.File
  ) {
    const importer = importerFor("clients");
    await this.auth.requireUser(request, importer.readPermission);
    if (!file) throw new Error("CLIENT_BULK_FILE_REQUIRED");
    deprecationHeaders(response, "preview");
    return { preview: legacyClientPreview(await importer.preview(file)) };
  }

  @Post("commit")
  @HttpCode(200)
  @UseInterceptors(csvUpload)
  async commit(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("fileDigest") fileDigest?: string,
    @Body("selections") rawSelections?: string
  ) {
    const importer = importerFor("clients");
    const user = await this.auth.requireUser(request, importer.writePermission);
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

    const result = await importer.commit(
      file,
      fileDigest,
      selections.map((selection) => ({
        rowNumber: selection.rowNumber,
        action: selection.action,
        targetId: selection.targetClientId,
        expectedUpdatedAt: selection.expectedUpdatedAt
      })),
      user
    );
    deprecationHeaders(response, "commit");
    return { result: legacyClientCommit(result) };
  }
}
