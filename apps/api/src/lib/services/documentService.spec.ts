import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Express } from "express";
import type { AuthenticatedUser, Permission } from "@pulse/contracts/auth";
import { prisma } from "@/lib/db";
import {
  assertDocumentAccess,
  getDocumentPreviewMetadata,
  parseDocumentTags,
  parseDocumentRange,
  validateDocumentUpload,
  validDocumentSignature
} from "@/lib/services/documentService";

const originalRequestFindUnique = prisma.request.findUnique.bind(prisma.request);
const originalQuoteFindUnique = prisma.quote.findUnique.bind(prisma.quote);
const originalInvoiceFindFirst = prisma.invoice.findFirst.bind(prisma.invoice);
const originalDocumentFindFirst = prisma.lifecycleDocument.findFirst.bind(prisma.lifecycleDocument);

afterEach(() => {
  (prisma.request as any).findUnique = originalRequestFindUnique;
  (prisma.quote as any).findUnique = originalQuoteFindUnique;
  (prisma.invoice as any).findFirst = originalInvoiceFindFirst;
  (prisma.lifecycleDocument as any).findFirst = originalDocumentFindFirst;
});

function user(...permissions: Permission[]) {
  return { id: "user-1", name: "Viewer", permissions } as AuthenticatedUser;
}

function upload(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "plans.pdf",
    encoding: "7bit",
    mimetype: "application/pdf",
    size: 1024,
    destination: "/tmp",
    filename: "upload",
    path: "/tmp/upload",
    buffer: Buffer.alloc(0),
    stream: null as never,
    ...overrides
  };
}

describe("document upload validation", () => {
  it("accepts supported extensions with matching declared media types", () => {
    assert.equal(validateDocumentUpload(upload()).expectedMedia, "application/pdf");
    assert.equal(
      validateDocumentUpload(upload({ originalname: "photo.webp", mimetype: "image/webp" }))
        .expectedMedia,
      "image/webp"
    );
  });

  it("rejects traversal names, spoofed types, and oversized images", () => {
    assert.throws(
      () => validateDocumentUpload(upload({ originalname: "../plans.pdf" })),
      /DOCUMENT_FILENAME_INVALID/
    );
    assert.throws(
      () => validateDocumentUpload(upload({ originalname: "plans.pdf", mimetype: "image/png" })),
      /DOCUMENT_TYPE_INVALID/
    );
    assert.throws(
      () =>
        validateDocumentUpload(
          upload({ originalname: "photo.png", mimetype: "image/png", size: 10 * 1024 * 1024 + 1 })
        ),
      /DOCUMENT_TOO_LARGE/
    );
  });

  it("recognizes PDF and supported image signatures", () => {
    assert.equal(validDocumentSignature("application/pdf", Buffer.from("%PDF-1.7")), true);
    assert.equal(
      validDocumentSignature(
        "image/png",
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      ),
      true
    );
    assert.equal(validDocumentSignature("image/jpeg", Buffer.from([0xff, 0xd8, 0xff])), true);
    assert.equal(validDocumentSignature("application/pdf", Buffer.from("not a pdf")), false);
  });
});

describe("document purpose tags", () => {
  it("normalizes JSON tags, canonicalizes suggestions, and removes duplicates", () => {
    assert.deepEqual(
      parseDocumentTags('[" work   in progress ", "WORK IN PROGRESS", "Panel A"]'),
      ["Work in Progress", "Panel A"]
    );
  });

  it("accepts comma-separated multipart values and rejects unsafe or excessive tags", () => {
    assert.deepEqual(parseDocumentTags("Reference, Approval"), ["Reference", "Approval"]);
    assert.throws(() => parseDocumentTags("Reference,tag,with,too,many,values,for,this,upload"), /DOCUMENT_TAGS_INVALID/);
    assert.throws(() => parseDocumentTags('["bad,tag"]'), /DOCUMENT_TAGS_INVALID/);
    assert.throws(() => parseDocumentTags("[not-json"), /DOCUMENT_TAGS_INVALID/);
  });
});

describe("document preview ranges", () => {
  it("parses bounded, open-ended, and suffix ranges", () => {
    assert.deepEqual(parseDocumentRange("bytes=10-19", 100), { start: 10, end: 19 });
    assert.deepEqual(parseDocumentRange("bytes=90-", 100), { start: 90, end: 99 });
    assert.deepEqual(parseDocumentRange("bytes=-10", 100), { start: 90, end: 99 });
    assert.equal(parseDocumentRange(undefined, 100), null);
  });

  it("clamps end positions and rejects malformed or unsatisfiable ranges", () => {
    assert.deepEqual(parseDocumentRange("bytes=95-200", 100), { start: 95, end: 99 });
    for (const value of ["items=0-1", "bytes=20-10", "bytes=100-101", "bytes=-0", "bytes=-"]) {
      assert.throws(() => parseDocumentRange(value, 100), /DOCUMENT_RANGE_INVALID/);
    }
  });
});

describe("document access", () => {
  it("allows a request document through every workspace where it is inherited", async () => {
    (prisma.request as any).findUnique = async () => ({
      relatedQuoteId: "quote-1",
      relatedQuote: {
        project: { id: "project-1", invoices: [{ id: "invoice-1" }] }
      }
    });
    const document = { requestId: "request-1", quoteId: null, projectId: null, invoiceId: null };

    await assertDocumentAccess(document, user("requests:read"), "read");
    await assertDocumentAccess(document, user("quotes:read"), "read");
    await assertDocumentAccess(document, user("projects:read"), "read");
    await assertDocumentAccess(document, user("billing:read"), "read");
    await assert.rejects(
      () => assertDocumentAccess(document, user("clients:read"), "read"),
      /DOCUMENT_ACCESS_DENIED/
    );
  });

  it("allows quote and project documents through their downstream workspaces", async () => {
    (prisma.quote as any).findUnique = async () => ({
      project: { id: "project-1", invoices: [{ id: "invoice-1" }] }
    });
    (prisma.invoice as any).findFirst = async () => ({
      id: "invoice-1"
    });

    await assertDocumentAccess(
      { requestId: null, quoteId: "quote-1", projectId: null, invoiceId: null },
      user("projects:read"),
      "read"
    );
    await assertDocumentAccess(
      { requestId: null, quoteId: "quote-1", projectId: null, invoiceId: null },
      user("billing:read"),
      "read"
    );
    await assertDocumentAccess(
      { requestId: null, quoteId: null, projectId: "project-1", invoiceId: null },
      user("billing:read"),
      "read"
    );
  });

  it("keeps document writes restricted to the originating workspace", async () => {
    const requestDocument = { requestId: "request-1", quoteId: null, projectId: null, invoiceId: null };
    await assertDocumentAccess(requestDocument, user("requests:write"), "write");
    await assert.rejects(
      () => assertDocumentAccess(requestDocument, user("projects:write"), "write"),
      /DOCUMENT_ACCESS_DENIED/
    );
  });

  it("checks preview metadata authorization without opening document storage", async () => {
    (prisma.lifecycleDocument as any).findFirst = async () => ({
      id: "document-1",
      requestId: null,
      quoteId: null,
      projectId: null,
      invoiceId: "invoice-1",
      scanStatus: "Clean",
      objectKey: "documents/document-1.pdf",
      originalFileName: "plans.pdf",
      mediaType: "application/pdf",
      byteSize: 1024n
    });

    assert.deepEqual(
      await getDocumentPreviewMetadata("document-1", user("billing:read")),
      { fileName: "plans.pdf", mediaType: "application/pdf", byteSize: 1024 }
    );
    await assert.rejects(
      () => getDocumentPreviewMetadata("document-1", user("projects:read")),
      /DOCUMENT_ACCESS_DENIED/
    );
  });
});
