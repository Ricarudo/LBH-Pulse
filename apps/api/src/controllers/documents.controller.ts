import { Controller, Delete, Get, Inject, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getDocumentDownload, softDeleteDocument } from "@/lib/services/documentService";
import { AuthService } from "@/shared/auth.service";

function safeDownloadName(fileName: string) {
  const ascii = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\\r\n]/g, "_");
  return {
    ascii,
    encoded: encodeURIComponent(fileName).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )
  };
}

@Controller("documents")
export class DocumentsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get(":id/download")
  async download(
    @Req() request: Request,
    @Res() response: Response,
    @Param("id") id: string
  ) {
    const user = await this.auth.requireUser(request, "crm:read");
    const document = await getDocumentDownload(id, user);
    response.setHeader("Content-Type", document.mediaType);
    response.setHeader("Content-Length", String(document.byteSize));
    const downloadName = safeDownloadName(document.fileName);
    response.setHeader("Content-Disposition", `attachment; filename="${downloadName.ascii}"; filename*=UTF-8''${downloadName.encoded}`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(document.body as Readable, response);
  }

  @Delete(":id")
  async remove(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request, "crm:write");
    await softDeleteDocument(id, user);
    return { ok: true };
  }
}
