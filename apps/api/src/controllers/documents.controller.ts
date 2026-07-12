import { Controller, Delete, Get, Inject, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getDocumentDownload, getDocumentPreview, softDeleteDocument } from "@/lib/services/documentService";
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
    const user = await this.auth.requireUser(request);
    const document = await getDocumentDownload(id, user);
    response.setHeader("Content-Type", document.mediaType);
    response.setHeader("Content-Length", String(document.byteSize));
    const downloadName = safeDownloadName(document.fileName);
    response.setHeader("Content-Disposition", `attachment; filename="${downloadName.ascii}"; filename*=UTF-8''${downloadName.encoded}`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(document.body as Readable, response);
  }

  @Get(":id/preview")
  async preview(
    @Req() request: Request,
    @Res() response: Response,
    @Param("id") id: string
  ) {
    const user = await this.auth.requireUser(request);
    const document = await getDocumentPreview(id, request.headers.range, user);
    const previewName = safeDownloadName(document.fileName);
    response.status(document.range ? 206 : 200);
    response.setHeader("Content-Type", document.mediaType);
    response.setHeader("Content-Disposition", `inline; filename="${previewName.ascii}"; filename*=UTF-8''${previewName.encoded}`);
    response.setHeader("Content-Length", String(document.range ? document.range.end - document.range.start + 1 : document.byteSize));
    response.setHeader("Accept-Ranges", "bytes");
    if (document.range) {
      response.setHeader(
        "Content-Range",
        `bytes ${document.range.start}-${document.range.end}/${document.byteSize}`
      );
    }
    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "SAMEORIGIN");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      document.mediaType === "application/pdf"
        ? "default-src 'none'; frame-ancestors 'self'"
        : "default-src 'none'; img-src 'self' data:; frame-ancestors 'self'; sandbox"
    );
    await pipeline(document.body as Readable, response);
  }

  @Delete(":id")
  async remove(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.requireUser(request);
    await softDeleteDocument(id, user);
    return { ok: true };
  }
}
