import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, unlink } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Express } from "express";
import { prisma } from "@/lib/db";
import { canUser, type AuthenticatedUser } from "@pulse/contracts/auth";
import type { Permission } from "@pulse/contracts/access-control";
import { recordActivity } from "@/lib/services/activityService";
import {
  projectDocumentCategories,
  quoteDocumentCategories,
  requestDocumentCategories,
  type DocumentSourceType,
  type LifecycleDocumentRecord
} from "@pulse/contracts/documents";

const PDF_LIMIT = 100 * 1024 * 1024;
const IMAGE_LIMIT = 10 * 1024 * 1024;
const LINEAGE_LIMIT = 500 * 1024 * 1024;
const allowedMedia = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
} as const;

type Stage = "request" | "quote" | "project";

type Lineage = {
  requestIds: string[];
  quoteId: string | null;
  projectId: string | null;
  sourceId: string;
  sourceNumber: string;
  sourceType: DocumentSourceType;
};

function storageConfig() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("DOCUMENT_STORAGE_UNAVAILABLE");
  }
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region: process.env.S3_REGION || "us-east-1",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: { accessKeyId, secretAccessKey }
    })
  };
}

async function lineageFor(stage: Stage, id: string): Promise<Lineage> {
  if (stage === "request") {
    const request = await prisma.request.findFirst({
      where: { id, archivedAt: null },
      select: {
        id: true,
        requestNumber: true,
        relatedQuoteId: true,
        relatedQuote: { select: { project: { select: { id: true } } } }
      }
    });
    if (!request) throw new Error("REQUEST_NOT_FOUND");
    return {
      requestIds: [request.id],
      quoteId: request.relatedQuoteId,
      projectId: request.relatedQuote?.project?.id ?? null,
      sourceId: request.id,
      sourceNumber: request.requestNumber,
      sourceType: "Request"
    };
  }
  if (stage === "quote") {
    const quote = await prisma.quote.findFirst({
      where: { id, archivedAt: null },
      select: {
        id: true,
        quoteNumber: true,
        requests: { where: { archivedAt: null }, select: { id: true } },
        project: { select: { id: true } }
      }
    });
    if (!quote) throw new Error("QUOTE_NOT_FOUND");
    return {
      requestIds: quote.requests.map((request) => request.id),
      quoteId: quote.id,
      projectId: quote.project?.id ?? null,
      sourceId: quote.id,
      sourceNumber: quote.quoteNumber,
      sourceType: "Quote"
    };
  }
  const project = await prisma.project.findFirst({
    where: { id, archivedAt: null },
    select: {
      id: true,
      projectNumber: true,
      quoteId: true,
      quote: {
        select: { requests: { where: { archivedAt: null }, select: { id: true } } }
      }
    }
  });
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return {
    requestIds: project.quote?.requests.map((request) => request.id) ?? [],
    quoteId: project.quoteId,
    projectId: project.id,
    sourceId: project.id,
    sourceNumber: project.projectNumber,
    sourceType: "Project"
  };
}

function documentOrigin(document: {
  requestId: string | null;
  quoteId: string | null;
  projectId: string | null;
}) {
  if (document.requestId) return { type: "Request" as const, id: document.requestId };
  if (document.quoteId) return { type: "Quote" as const, id: document.quoteId };
  if (document.projectId) return { type: "Project" as const, id: document.projectId };
  throw new Error("DOCUMENT_ORIGIN_INVALID");
}

async function assertDocumentAccess(
  document: { requestId: string | null; quoteId: string | null; projectId: string | null },
  user: AuthenticatedUser,
  mode: "read" | "write"
) {
  const permissions = new Set<Permission>();
  if (document.requestId) {
    permissions.add(mode === "read" ? "requests:read" : "requests:write");
    if (mode === "read") {
      const request = await prisma.request.findUnique({
        where: { id: document.requestId },
        select: { relatedQuoteId: true, relatedQuote: { select: { project: { select: { id: true } } } } }
      });
      if (request?.relatedQuoteId) permissions.add("quotes:read");
      if (request?.relatedQuote?.project) permissions.add("projects:read");
    }
  }
  if (document.quoteId) {
    permissions.add(mode === "read" ? "quotes:read" : "quotes:write");
    if (mode === "read") {
      const quote = await prisma.quote.findUnique({
        where: { id: document.quoteId },
        select: { project: { select: { id: true } } }
      });
      if (quote?.project) permissions.add("projects:read");
    }
  }
  if (document.projectId) permissions.add(mode === "read" ? "projects:read" : "projects:write");
  if (![...permissions].some((permission) => canUser(user, permission))) {
    throw new Error("DOCUMENT_ACCESS_DENIED");
  }
}

function visibleWhere(stage: Stage, lineage: Lineage) {
  if (stage === "request") return { requestId: lineage.sourceId };
  if (stage === "quote") {
    return { OR: [{ requestId: { in: lineage.requestIds } }, { quoteId: lineage.quoteId! }] };
  }
  return {
    OR: [
      { requestId: { in: lineage.requestIds } },
      ...(lineage.quoteId ? [{ quoteId: lineage.quoteId }] : []),
      { projectId: lineage.projectId! }
    ]
  };
}

async function sourceNumbers(lineage: Lineage) {
  const [requests, quote, project] = await Promise.all([
    lineage.requestIds.length
      ? prisma.request.findMany({
          where: { id: { in: lineage.requestIds } },
          select: { id: true, requestNumber: true }
        })
      : [],
    lineage.quoteId
      ? prisma.quote.findUnique({ where: { id: lineage.quoteId }, select: { id: true, quoteNumber: true } })
      : null,
    lineage.projectId
      ? prisma.project.findUnique({
          where: { id: lineage.projectId },
          select: { id: true, projectNumber: true }
        })
      : null
  ]);
  return new Map<string, string>([
    ...requests.map((request) => [request.id, request.requestNumber] as const),
    ...(quote ? [[quote.id, quote.quoteNumber] as const] : []),
    ...(project ? [[project.id, project.projectNumber] as const] : [])
  ]);
}

async function listForStage(stage: Stage, id: string): Promise<LifecycleDocumentRecord[]> {
  const lineage = await lineageFor(stage, id);
  const [documents, numbers] = await Promise.all([
    prisma.lifecycleDocument.findMany({
      where: { deletedAt: null, ...visibleWhere(stage, lineage) },
      orderBy: { createdAt: "desc" }
    }),
    sourceNumbers(lineage)
  ]);
  return documents.map((document) => {
    const origin = documentOrigin(document);
    const available = document.scanStatus === "Clean" && Boolean(document.objectKey);
    return {
      id: document.id,
      sourceType: origin.type,
      sourceId: origin.id,
      sourceNumber: numbers.get(origin.id) ?? origin.type,
      inherited: origin.type !== lineage.sourceType || origin.id !== lineage.sourceId,
      canDelete: origin.type === lineage.sourceType && origin.id === lineage.sourceId,
      originalFileName: document.originalFileName,
      mediaType: document.mediaType ?? "",
      byteSize: Number(document.byteSize),
      category: document.category,
      scanStatus: document.scanStatus,
      available,
      uploadedByName: document.uploadedByName,
      createdAt: document.createdAt.toISOString(),
      downloadUrl: available ? `/api/documents/${document.id}/download` : null,
      previewUrl: available ? `/api/documents/${document.id}/preview` : null
    };
  });
}

export const listRequestDocuments = (id: string) => listForStage("request", id);
export const listQuoteDocuments = (id: string) => listForStage("quote", id);
export const listProjectDocuments = (id: string) => listForStage("project", id);

async function readSignature(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function validDocumentSignature(mediaType: string, bytes: Buffer) {
  if (mediaType === "application/pdf") return bytes.subarray(0, 5).toString() === "%PDF-";
  if (mediaType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mediaType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mediaType === "image/webp") {
    return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  }
  return false;
}

export function validateDocumentUpload(file: Express.Multer.File) {
  const original = file.originalname.normalize("NFKC");
  if (
    original !== path.basename(original) ||
    original.length > 180 ||
    /[\u0000-\u001f\u007f]/.test(original)
  ) {
    throw new Error("DOCUMENT_FILENAME_INVALID");
  }
  const extension = path.extname(original).toLowerCase() as keyof typeof allowedMedia;
  const expectedMedia = allowedMedia[extension];
  if (!expectedMedia || expectedMedia !== file.mimetype) throw new Error("DOCUMENT_TYPE_INVALID");
  const limit = expectedMedia === "application/pdf" ? PDF_LIMIT : IMAGE_LIMIT;
  if (file.size > limit) throw new Error("DOCUMENT_TOO_LARGE");
  return { original, expectedMedia, extension };
}

async function sha256(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function scanDocumentWithClamAv(filePath: string) {
  const host = process.env.CLAMAV_HOST || "clamav";
  const port = Number(process.env.CLAMAV_PORT || 3310);
  const timeout = Number(process.env.CLAMAV_TIMEOUT_MS || 180000);
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let response = "";
    const fail = () => reject(new Error("DOCUMENT_SCANNER_UNAVAILABLE"));
    socket.setTimeout(timeout, () => socket.destroy(new Error("scan timeout")));
    socket.once("error", fail);
    socket.once("connect", async () => {
      socket.write("zINSTREAM\0");
      try {
        for await (const chunk of createReadStream(filePath)) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const length = Buffer.alloc(4);
          length.writeUInt32BE(buffer.length);
          if (!socket.write(Buffer.concat([length, buffer]))) {
            await new Promise<void>((resume) => socket.once("drain", resume));
          }
        }
        socket.write(Buffer.alloc(4));
      } catch {
        socket.destroy();
        fail();
      }
    });
    socket.on("data", (chunk) => {
      response += chunk.toString();
    });
    socket.once("end", () => {
      if (response.includes("FOUND")) reject(new Error("DOCUMENT_MALWARE_DETECTED"));
      else if (response.includes("OK")) resolve();
      else reject(new Error("DOCUMENT_SCANNER_UNAVAILABLE"));
    });
  });
}

function categoriesFor(stage: Stage): readonly string[] {
  if (stage === "request") return requestDocumentCategories;
  if (stage === "quote") return quoteDocumentCategories;
  return projectDocumentCategories;
}

export async function uploadDocument(
  stage: Stage,
  id: string,
  file: Express.Multer.File | undefined,
  category: string,
  user: AuthenticatedUser
) {
    const lineage = await lineageFor(stage, id);
  if (!file) throw new Error("DOCUMENT_FILE_REQUIRED");
  const activityBase = {
    user,
    relatedEntityType: lineage.sourceType,
    relatedEntityId: lineage.sourceId
  };
  try {
    if (!categoriesFor(stage).includes(category)) throw new Error("DOCUMENT_CATEGORY_INVALID");
    const { original, expectedMedia, extension } = validateDocumentUpload(file);
    const signature = await readSignature(file.path);
    if (!validDocumentSignature(expectedMedia, signature)) throw new Error("DOCUMENT_SIGNATURE_INVALID");
    const quota = await prisma.lifecycleDocument.aggregate({
      where: {
        deletedAt: null,
        OR: [
          { requestId: { in: lineage.requestIds } },
          ...(lineage.quoteId ? [{ quoteId: lineage.quoteId }] : []),
          ...(lineage.projectId ? [{ projectId: lineage.projectId }] : [])
        ]
      },
      _sum: { byteSize: true }
    });
    if (Number(quota._sum.byteSize ?? 0n) + file.size > LINEAGE_LIMIT) {
      throw new Error("DOCUMENT_LINEAGE_LIMIT");
    }
    const digest = await sha256(file.path);
    await scanDocumentWithClamAv(file.path);
    const objectKey = `${lineage.sourceType.toLowerCase()}/${lineage.sourceId}/${randomUUID()}${extension}`;
    const { client, bucket } = storageConfig();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: createReadStream(file.path),
        ContentLength: file.size,
        ContentType: expectedMedia,
        Metadata: { sha256: digest }
      })
    );
    let document;
    try {
      document = await prisma.$transaction(async (tx) => {
        const lockKey = lineage.quoteId ?? lineage.projectId ?? lineage.requestIds[0] ?? id;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`documents:${lockKey}`}))`;
        const finalQuota = await tx.lifecycleDocument.aggregate({
          where: {
            deletedAt: null,
            OR: [
              { requestId: { in: lineage.requestIds } },
              ...(lineage.quoteId ? [{ quoteId: lineage.quoteId }] : []),
              ...(lineage.projectId ? [{ projectId: lineage.projectId }] : [])
            ]
          },
          _sum: { byteSize: true }
        });
        if (Number(finalQuota._sum.byteSize ?? 0n) + file.size > LINEAGE_LIMIT) {
          throw new Error("DOCUMENT_LINEAGE_LIMIT");
        }
        return tx.lifecycleDocument.create({
          data: {
            ...(stage === "request" ? { requestId: id } : {}),
            ...(stage === "quote" ? { quoteId: id } : {}),
            ...(stage === "project" ? { projectId: id } : {}),
            objectKey,
            originalFileName: original,
            mediaType: expectedMedia,
            byteSize: BigInt(file.size),
            sha256: digest,
            category,
            scanStatus: "Clean",
            scanMessage: "ClamAV scan passed.",
            scannedAt: new Date(),
            uploadedById: user.id,
            uploadedByName: user.name
          }
        });
      });
    } catch (error) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey })).catch(() => undefined);
      throw error;
    }
    await recordActivity({
      ...activityBase,
      type: "Document Uploaded",
      title: `${original} uploaded`,
      metadata: { documentId: document.id, category, byteSize: file.size, sha256: digest }
    });
    return (await listForStage(stage, id)).find((item) => item.id === document.id)!;
  } catch (error) {
    await recordActivity({
      ...activityBase,
      type: "Document Rejected",
      title: `${file.originalname || "Document"} rejected`,
      detail: error instanceof Error ? error.message : "Upload failed."
    }).catch(() => undefined);
    throw error;
  } finally {
    await unlink(file.path).catch(() => undefined);
  }
}

export async function getDocumentDownload(id: string, user: AuthenticatedUser) {
  const document = await prisma.lifecycleDocument.findFirst({ where: { id, deletedAt: null } });
  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  await assertDocumentAccess(document, user, "read");
  if (document.scanStatus !== "Clean" || !document.objectKey) throw new Error("DOCUMENT_NOT_AVAILABLE");
  const { client, bucket } = storageConfig();
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: document.objectKey }));
  if (!object.Body) throw new Error("DOCUMENT_NOT_AVAILABLE");
  const origin = documentOrigin(document);
  await recordActivity({
    user,
    relatedEntityType: origin.type,
    relatedEntityId: origin.id,
    type: "Document Downloaded",
    title: `${document.originalFileName} downloaded`,
    metadata: { documentId: document.id }
  });
  return {
    body: object.Body,
    fileName: document.originalFileName,
    mediaType: document.mediaType || "application/octet-stream",
    byteSize: Number(document.byteSize)
  };
}

export type DocumentByteRange = {
  start: number;
  end: number;
};

export class DocumentRangeError extends Error {
  constructor(readonly byteSize: number) {
    super("DOCUMENT_RANGE_INVALID");
  }
}

export function parseDocumentRange(
  rangeHeader: string | undefined,
  byteSize: number
): DocumentByteRange | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || byteSize <= 0) throw new DocumentRangeError(byteSize);
  const [, startText, endText] = match;
  if (!startText && !endText) throw new DocumentRangeError(byteSize);

  let start: number;
  let end: number;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new DocumentRangeError(byteSize);
    }
    start = Math.max(0, byteSize - suffixLength);
    end = byteSize - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : byteSize - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      start >= byteSize
    ) {
      throw new DocumentRangeError(byteSize);
    }
    end = Math.min(end, byteSize - 1);
  }
  return { start, end };
}

export async function getDocumentPreview(
  id: string,
  rangeHeader: string | undefined,
  user: AuthenticatedUser
) {
  const document = await prisma.lifecycleDocument.findFirst({ where: { id, deletedAt: null } });
  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  await assertDocumentAccess(document, user, "read");
  if (document.scanStatus !== "Clean" || !document.objectKey) throw new Error("DOCUMENT_NOT_AVAILABLE");
  const byteSize = Number(document.byteSize);
  const range = parseDocumentRange(rangeHeader, byteSize);
  const { client, bucket } = storageConfig();
  const object = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: document.objectKey,
      ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {})
    })
  );
  if (!object.Body) throw new Error("DOCUMENT_NOT_AVAILABLE");
  if (!range || range.start === 0) {
    const origin = documentOrigin(document);
    await recordActivity({
      user,
      relatedEntityType: origin.type,
      relatedEntityId: origin.id,
      type: "Document Previewed",
      title: `${document.originalFileName} previewed`,
      metadata: { documentId: document.id }
    });
  }
  return {
    body: object.Body,
    fileName: document.originalFileName,
    mediaType: document.mediaType || "application/octet-stream",
    byteSize,
    range
  };
}

export async function softDeleteDocument(id: string, user: AuthenticatedUser) {
  const existing = await prisma.lifecycleDocument.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new Error("DOCUMENT_NOT_FOUND");
  await assertDocumentAccess(existing, user, "write");
  const origin = documentOrigin(existing);
  await prisma.lifecycleDocument.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedById: user.id,
      deletedByName: user.name
    }
  });
  await recordActivity({
    user,
    relatedEntityType: origin.type,
    relatedEntityId: origin.id,
    type: "Document Removed",
    title: `${existing.originalFileName} removed`,
    metadata: { documentId: existing.id }
  });
}
