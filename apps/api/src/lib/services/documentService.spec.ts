import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Express } from "express";
import {
  validateDocumentUpload,
  validDocumentSignature
} from "@/lib/services/documentService";

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
