import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Request } from "express";
import type { AuthenticatedUser, Permission } from "@pulse/contracts/auth";
import type { Prisma } from "@/generated/prisma/client";

const date = new Date("2026-11-17T12:00:00Z");
const projectRef = { id: "project", projectNumber: "P-1", invoices: [] };
const original = {
  id: "original", quoteNumber: "Q-1", project: projectRef, sourceRequestIdSnapshot: null,
  requests: [{ id: "request" }]
};
const approved = {
  id: "approved-co", quoteNumber: "Q-2", project: null, sourceRequestIdSnapshot: "snapshot-request",
  requests: [], projectLink: { project: projectRef }
};
const pending = {
  id: "pending-co", quoteNumber: "Q-3", project: null, sourceRequestIdSnapshot: null,
  requests: [], projectLink: { project: projectRef }
};
const quotes = [original, approved, pending];
const requests = [
  { id: "request", requestNumber: "R-1", relatedQuote: original, relatedQuoteId: original.id },
  { id: "snapshot-request", requestNumber: "R-2", relatedQuote: approved, relatedQuoteId: approved.id }
];
const project = {
  ...projectRef, title: "Fixture project", status: "Ready", budget: 0, updatedAt: date,
  client: { displayName: "Fixture client" }, quoteId: original.id,
  quoteLinks: [
    { role: "ORIGINAL", quote: original, quoteId: original.id, approvedAt: date },
    { role: "CHANGE_ORDER", quote: approved, quoteId: approved.id, approvedAt: date },
    { role: "CHANGE_ORDER", quote: pending, quoteId: pending.id, approvedAt: null }
  ]
};

const fixtures = [
  { id: "project-file", origin: { projectId: project.id }, source: project.projectNumber, type: "Project", projectRead: true, quoteRead: false },
  { id: "original-file", origin: { quoteId: original.id }, source: original.quoteNumber, type: "Quote", projectRead: true, quoteRead: true },
  { id: "request-file", origin: { requestId: requests[0].id }, source: requests[0].requestNumber, type: "Request", projectRead: true, quoteRead: true },
  { id: "approved-file", origin: { quoteId: approved.id }, source: approved.quoteNumber, type: "Quote", projectRead: false, quoteRead: true },
  { id: "pending-file", origin: { quoteId: pending.id }, source: pending.quoteNumber, type: "Quote", projectRead: false, quoteRead: true },
  { id: "snapshot-request-file", origin: { requestId: requests[1].id }, source: requests[1].requestNumber, type: "Request", projectRead: false, quoteRead: true }
] as const;

const files = fixtures.map(({ id, origin }) => ({
  id, projectId: null, quoteId: null, requestId: null, invoiceId: null, ...origin,
  originalFileName: `${id}.pdf`, mediaType: "application/pdf", byteSize: 4n, deletedAt: null,
  scanStatus: "Clean", objectKey: `fixture/${id}.pdf`, category: "Reference",
  tags: [], uploadedByName: "Fixture uploader", createdAt: date
}));

const database = {
  project: {
    findMany: async () => [project],
    findFirst: async ({ where, select }: Prisma.ProjectFindFirstArgs) => {
      assert.equal(where?.id, project.id);
      const links = select?.quoteLinks;
      assert.ok(links && typeof links === "object", "Project document lineage must select ProjectQuote links");
      assert.equal(links.where, undefined, "Current listing includes pending as well as approved links");
      return project;
    },
    findUnique: async () => project
  },
  request: {
    findUnique: async ({ where }: { where: { id: string } }) => requests.find((item) => item.id === where.id),
    findMany: async ({ where }: { where: { id: { in: string[] } } }) => requests.filter((item) => where.id.in.includes(item.id))
  },
  quote: {
    findUnique: async ({ where }: { where: { id: string } }) => quotes.find((item) => item.id === where.id),
    findFirst: async ({ where }: { where: { id: string } }) => quotes.find((item) => item.id === where.id),
    findMany: async ({ where }: { where: { id: { in: string[] } } }) => quotes.filter((item) => where.id.in.includes(item.id))
  },
  invoice: { findFirst: async () => null },
  lifecycleDocument: {
    findMany: async ({ where }: Prisma.LifecycleDocumentFindManyArgs) => {
      assert.equal(where?.deletedAt, null);
      return files.filter((file) => where?.OR?.some((scope) => {
        const requestIds = typeof scope.requestId === "object" ? scope.requestId?.in : undefined;
        const quoteIds = typeof scope.quoteId === "object" ? scope.quoteId?.in : undefined;
        return (file.requestId !== null && Array.isArray(requestIds) && requestIds.includes(file.requestId)) ||
          (file.quoteId !== null && Array.isArray(quoteIds) && quoteIds.includes(file.quoteId)) ||
          (typeof scope.projectId === "string" && scope.projectId === file.projectId);
      }));
    },
    findFirst: async ({ where }: Prisma.LifecycleDocumentFindFirstArgs) => {
      assert.equal(where?.deletedAt, null);
      return files.find((file) => file.id === where?.id) ?? null;
    }
  },
  activity: { create: async () => undefined }
};

Object.assign(globalThis, { prisma: database });
const services = Promise.all([
  import("@/lib/services/documentService"),
  import("@/controllers/projects.controller"),
  import("@/shared/auth.service")
]);

function viewer(...permissions: Permission[]) {
  return { id: "fixture-viewer", name: "Viewer", permissions, mustChangePassword: false } as AuthenticatedUser;
}

const profiles = [
  { label: "project-only", principal: viewer("projects:read"), canListProject: true, canOpen: (file: typeof fixtures[number]) => file.projectRead },
  { label: "quote-only", principal: viewer("quotes:read"), canListProject: false, canOpen: (file: typeof fixtures[number]) => file.quoteRead },
  { label: "project and quote", principal: viewer("projects:read", "quotes:read"), canListProject: true, canOpen: () => true },
  { label: "unrelated read", principal: viewer("clients:read"), canListProject: false, canOpen: () => false }
];

for (const { label, principal, canListProject, canOpen } of profiles) {
  test(`Project document listing and direct file access for the ${label} role`, async (t) => {
    const [{ getDocumentDownload, getDocumentPreview, getDocumentPreviewMetadata }, { ProjectsController }, { AuthError, AuthService }] = await services;
    // Replace the storage call before configuring a loopback-only fixture endpoint.
    const readObject = t.mock.method(S3Client.prototype, "send", async (command: GetObjectCommand) => {
      assert.ok(command instanceof GetObjectCommand);
      assert.ok(files.some((file) => file.objectKey === command.input.Key));
      return { Body: Readable.from([Buffer.from("test")]) };
    });
    const storage = {
      S3_ENDPOINT: "http://127.0.0.1:1", S3_BUCKET: "document-fixtures",
      S3_ACCESS_KEY: "fixture", S3_SECRET_KEY: "fixture"
    };
    const saved = Object.fromEntries(Object.keys(storage).map((key) => [key, process.env[key]]));
    Object.assign(process.env, storage);
    t.after(() => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    const auth = new AuthService();
    t.mock.method(auth, "getCurrentUser", async () => principal);
    const list = new ProjectsController(auth).list({ headers: {} } as Request);
    if (canListProject) {
      const { projects } = await list;
      const [listed] = projects;
      assert.equal(listed.documents.length, fixtures.length);
      for (const fixture of fixtures) {
        const item = listed.documents.find((file) => file.id === fixture.id);
        assert.ok(item, fixture.id);
        assert.equal(item.sourceNumber, fixture.source);
        assert.equal(item.sourceType, fixture.type);
        assert.equal(item.inherited, fixture.type !== "Project");
        assert.equal(item.canDelete, fixture.type === "Project");
        assert.equal(item.originalFileName, `${fixture.id}.pdf`);
        assert.equal(item.available, true);
        assert.equal(item.previewUrl, `/api/documents/${fixture.id}/preview`);
        assert.equal(item.downloadUrl, `/api/documents/${fixture.id}/download`);
      }
    } else {
      await assert.rejects(list, (error: unknown) => error instanceof AuthError && error.status === 403);
    }

    for (const fixture of fixtures) {
      const callsBefore = readObject.mock.callCount();
      const metadata = () => getDocumentPreviewMetadata(fixture.id, principal);
      const preview = () => getDocumentPreview(fixture.id, undefined, principal);
      const download = () => getDocumentDownload(fixture.id, principal);
      if (canOpen(fixture)) {
        const expected = { fileName: `${fixture.id}.pdf`, mediaType: "application/pdf", byteSize: 4 };
        assert.deepEqual(await metadata(), expected);
        assert.equal(readObject.mock.callCount(), callsBefore, "HEAD does not open storage");
        assert.equal((await preview()).fileName, expected.fileName);
        assert.equal((await download()).fileName, expected.fileName);
        assert.equal(readObject.mock.callCount(), callsBefore + 2);
      } else {
        for (const open of [metadata, preview, download]) {
          await assert.rejects(open, /DOCUMENT_ACCESS_DENIED/, fixture.id);
        }
        assert.equal(readObject.mock.callCount(), callsBefore, "Denied requests do not open storage");
      }
    }
  });
}

test("Quote lists inherit only their own files and Request lineage, including the saved Request snapshot", async () => {
  const [{ listQuoteDocuments }] = await services;
  for (const [quote, expected] of [
    [original, ["original-file", "request-file"]],
    [approved, ["approved-file", "snapshot-request-file"]],
    [pending, ["pending-file"]]
  ] as const) {
    const listed = await listQuoteDocuments(quote.id);
    assert.deepEqual(listed.map((item) => item.id).sort(), [...expected].sort());
  }
});
