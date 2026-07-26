const baseUrl = process.env.PULSE_WEB_URL || "http://web:4300";
const origin = process.env.PULSE_CI_ORIGIN || baseUrl;
const email = process.env.PULSE_CI_ADMIN_EMAIL;
const password = process.env.PULSE_CI_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error("Ephemeral CI login credentials are required.");
}

async function response(path, init = {}) {
  const result = await fetch(`${baseUrl}${path}`, init);
  const text = await result.text();
  return {
    response: result,
    payload: text ? JSON.parse(text) : null
  };
}

async function jsonResponse(path, init) {
  const result = await response(path, init);
  if (!result.response.ok) {
    const detail = typeof result.payload?.error === "string" ? ` ${result.payload.error}` : "";
    throw new Error(`${init?.method || "GET"} ${path} returned ${result.response.status}.${detail}`);
  }
  return result;
}

function loginRequest(loginEmail, loginPassword) {
  return response("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": "same-origin",
      "x-pulse-request": "browser"
    },
    body: JSON.stringify({ email: loginEmail, password: loginPassword })
  });
}

const unknownFailure = await loginRequest("unknown-account@example.invalid", "intentionally-invalid");
const knownFailure = await loginRequest(email, "intentionally-invalid");
if (
  unknownFailure.response.status !== 401 ||
  knownFailure.response.status !== 401 ||
  JSON.stringify(unknownFailure.payload) !== JSON.stringify(knownFailure.payload)
) {
  throw new Error("Login responses permit account enumeration.");
}

const unauthenticatedSession = await jsonResponse("/api/auth/session", {});
if (unauthenticatedSession.payload?.setupRequired !== false) {
  throw new Error("A populated database incorrectly reopened first-run setup.");
}
const repeatedSetup = await response("/api/auth/setup", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin,
    "sec-fetch-site": "same-origin",
    "x-pulse-request": "browser"
  },
  body: JSON.stringify({
    setupToken: "not-the-ci-setup-token",
    name: "Repeated Setup",
    email: "repeated-setup@example.invalid",
    password: "A-unique-bootstrap-passphrase-98765"
  })
});
if (repeatedSetup.response.status !== 409) {
  throw new Error("A populated database accepted or exposed first-run setup.");
}

const throttleEmail = `throttle-${Date.now()}@example.invalid`;
for (let attempt = 0; attempt < 3; attempt += 1) {
  const throttled = await loginRequest(throttleEmail, "intentionally-invalid");
  if (attempt < 2 && throttled.response.status !== 401) {
    throw new Error("Login failed before the configured account threshold.");
  }
  if (attempt === 2 && throttled.response.status !== 429) {
    throw new Error("Repeated login failures were not throttled.");
  }
}

const login = await loginRequest(email, password);
if (!login.response.ok || !login.payload?.csrfToken || login.payload?.user?.email !== email) {
  throw new Error("Valid login did not return the secure session contract.");
}
const setCookie = login.response.headers.get("set-cookie");
if (!setCookie || !/HttpOnly/i.test(setCookie)) {
  throw new Error("Login response did not set an HTTP-only session cookie.");
}

const cookie = setCookie.split(";", 1)[0];
const headers = { cookie };
const mutationHeaders = {
  cookie,
  origin,
  "sec-fetch-site": "same-origin",
  "x-pulse-request": "browser",
  "x-pulse-csrf": login.payload.csrfToken
};
const items = await jsonResponse("/api/items", { headers });
if (!Array.isArray(items.payload?.items)) throw new Error("Items endpoint did not return an items array.");

const search = await jsonResponse("/api/items/search?q=cable", { headers });
if (!Array.isArray(search.payload?.items)) throw new Error("Item search endpoint did not return an items array.");

const clientTemplate = await fetch(`${baseUrl}/api/importers/clients/template`, { headers });
const clientTemplateCsv = await clientTemplate.text();
if (!clientTemplate.ok || !clientTemplateCsv.includes("client_number,client_name")) {
  throw new Error("Client importer did not publish its exact CSV template.");
}
const clientPreviewBody = new FormData();
clientPreviewBody.set("file", new File([clientTemplateCsv], "pulse-client-import-template.csv", { type: "text/csv" }));
const clientPreview = await jsonResponse("/api/importers/clients/preview", {
  method: "POST",
  headers: mutationHeaders,
  body: clientPreviewBody
});
const clientPreviewRow = clientPreview.payload?.preview?.rows?.[0];
if (clientPreview.payload?.preview?.rows?.length !== 1 || clientPreviewRow?.status !== "new") {
  throw new Error("The isolated client template did not preview as one new client.");
}
const clientCommitBody = new FormData();
clientCommitBody.set("file", new File([clientTemplateCsv], "pulse-client-import-template.csv", { type: "text/csv" }));
clientCommitBody.set("fileDigest", clientPreview.payload.preview.fileDigest);
clientCommitBody.set("selections", JSON.stringify([{ rowNumber: clientPreviewRow.rowNumber, action: "create" }]));
const clientCommit = await jsonResponse("/api/importers/clients/commit", {
  method: "POST",
  headers: mutationHeaders,
  body: clientCommitBody
});
if (clientCommit.payload?.result?.created !== 1 || clientCommit.payload.result.updated !== 0) {
  throw new Error("Client importer did not atomically create the selected client.");
}
const clientRepeatBody = new FormData();
clientRepeatBody.set("file", new File([clientTemplateCsv], "pulse-client-import-template.csv", { type: "text/csv" }));
const clientRepeat = await jsonResponse("/api/importers/clients/preview", {
  method: "POST",
  headers: mutationHeaders,
  body: clientRepeatBody
});
if (clientRepeat.payload?.preview?.summary?.unchanged !== 1) {
  throw new Error("Client importer did not classify an identical re-import as unchanged.");
}

const itemTemplate = await fetch(`${baseUrl}/api/importers/items/template`, { headers });
const itemTemplateCsv = await itemTemplate.text();
if (!itemTemplate.ok || !itemTemplateCsv.includes("sku,part_number,name")) {
  throw new Error("Item importer did not publish its exact CSV template.");
}
const itemPreviewBody = new FormData();
itemPreviewBody.set("file", new File([itemTemplateCsv], "pulse-item-import-template.csv", { type: "text/csv" }));
const itemPreview = await jsonResponse("/api/importers/items/preview", {
  method: "POST",
  headers: mutationHeaders,
  body: itemPreviewBody
});
if (itemPreview.payload?.preview?.rows?.length !== 1 || itemPreview.payload.preview.summary?.invalid !== 0) {
  throw new Error("Item importer could not preview its own template without writing data.");
}
const itemPreviewRow = itemPreview.payload.preview.rows[0];
if (itemPreviewRow.status !== "new") {
  throw new Error("The isolated item template did not preview as one new catalog record.");
}
const itemCommitBody = new FormData();
itemCommitBody.set("file", new File([itemTemplateCsv], "pulse-item-import-template.csv", { type: "text/csv" }));
itemCommitBody.set("fileDigest", itemPreview.payload.preview.fileDigest);
itemCommitBody.set("selections", JSON.stringify([{ rowNumber: itemPreviewRow.rowNumber, action: "create" }]));
const itemCommit = await jsonResponse("/api/importers/items/commit", {
  method: "POST",
  headers: mutationHeaders,
  body: itemCommitBody
});
if (itemCommit.payload?.result?.created !== 1 || itemCommit.payload.result.updated !== 0) {
  throw new Error("Item importer did not atomically create the selected catalog record.");
}
const itemRepeatBody = new FormData();
itemRepeatBody.set("file", new File([itemTemplateCsv], "pulse-item-import-template.csv", { type: "text/csv" }));
const itemRepeat = await jsonResponse("/api/importers/items/preview", {
  method: "POST",
  headers: mutationHeaders,
  body: itemRepeatBody
});
if (itemRepeat.payload?.preview?.summary?.unchanged !== 1) {
  throw new Error("Item importer did not classify an identical re-import as unchanged.");
}

const quoteTemplate = await fetch(`${baseUrl}/api/importers/legacy-quotes/template`, { headers });
const quoteTemplateCsv = await quoteTemplate.text();
const quoteHeader = quoteTemplateCsv.split(/\r?\n/, 1)[0];
if (!quoteTemplate.ok || !quoteHeader.startsWith("external_quote_number,title,client_number")) {
  throw new Error("Quote importer did not publish its exact CSV template.");
}
const quoteValues = [
  "CI-LEGACY-1001", "CI imported quote", "", "Sample Company", "Jordan Rivera",
  "jordan@sample.example", "Draft", email, "12500.00", "8000.00", "3500.00",
  "1800.00", "1595.00", "10", "2025-01-06T13:00:00.000Z", "", "",
  "CI quote import and reconciliation fixture.", "", ""
];
const quoteCsv = `${quoteHeader}\r\n${quoteValues.join(",")}\r\n`;
const quotePreviewBody = new FormData();
quotePreviewBody.set("file", new File([quoteCsv], "pulse-quote-import-ci.csv", { type: "text/csv" }));
const quotePreview = await jsonResponse("/api/importers/legacy-quotes/preview", {
  method: "POST",
  headers: mutationHeaders,
  body: quotePreviewBody
});
const quotePreviewRow = quotePreview.payload?.preview?.rows?.[0];
if (quotePreview.payload?.preview?.rows?.length !== 1 || quotePreviewRow?.status !== "new") {
  throw new Error("The isolated quote summary did not preview as one new quote.");
}
const quoteCommitBody = new FormData();
quoteCommitBody.set("file", new File([quoteCsv], "pulse-quote-import-ci.csv", { type: "text/csv" }));
quoteCommitBody.set("fileDigest", quotePreview.payload.preview.fileDigest);
quoteCommitBody.set("selections", JSON.stringify([{ rowNumber: quotePreviewRow.rowNumber, action: "create" }]));
const quoteCommit = await jsonResponse("/api/importers/legacy-quotes/commit", {
  method: "POST",
  headers: mutationHeaders,
  body: quoteCommitBody
});
if (quoteCommit.payload?.result?.created !== 1 || quoteCommit.payload.result.updated !== 0) {
  throw new Error("Quote importer did not atomically create the selected quote summary.");
}
const quoteRepeatBody = new FormData();
quoteRepeatBody.set("file", new File([quoteCsv], "pulse-quote-import-ci.csv", { type: "text/csv" }));
const quoteRepeat = await jsonResponse("/api/importers/legacy-quotes/preview", {
  method: "POST",
  headers: mutationHeaders,
  body: quoteRepeatBody
});
if (quoteRepeat.payload?.preview?.summary?.unchanged !== 1) {
  throw new Error("Quote importer did not classify an identical re-import as unchanged.");
}

const quotes = await jsonResponse("/api/quotes", { headers });
if (!Array.isArray(quotes.payload?.quotes) || !quotes.payload.quotes[0]?.id) {
  throw new Error("Seeded quote list is missing from the API response.");
}

const quote = await jsonResponse(`/api/quotes/${quotes.payload.quotes[0].id}`, { headers });
if (!Array.isArray(quote.payload?.quote?.items) || !quote.payload?.quote?.context) {
  throw new Error("Quote detail endpoint did not return BOM and snapshot context.");
}

const fixtureBytes = new TextEncoder().encode("%PDF-1.4\n% Pulse CI backup and restore fixture\n%%EOF\n");
const uploadBody = new FormData();
uploadBody.set("file", new File([fixtureBytes], "ci-backup-restore-fixture.pdf", { type: "application/pdf" }));
uploadBody.set("category", "Proposal");
uploadBody.set("tags", JSON.stringify(["Reference"]));
const upload = await jsonResponse(`/api/quotes/${quotes.payload.quotes[0].id}/documents`, {
  method: "POST",
  headers: mutationHeaders,
  body: uploadBody
});
if (!upload.payload?.document?.id || upload.payload.document.scanStatus !== "Clean") {
  throw new Error("Document fixture did not pass scanning and object storage.");
}
const downloaded = await fetch(`${baseUrl}/api/documents/${upload.payload.document.id}/download`, { headers });
const downloadedBytes = new Uint8Array(await downloaded.arrayBuffer());
if (!downloaded.ok || Buffer.compare(Buffer.from(downloadedBytes), Buffer.from(fixtureBytes)) !== 0) {
  throw new Error("Document fixture did not round-trip through MinIO.");
}

const missingCsrf = await response("/api/auth/logout", {
  method: "POST",
  headers: { cookie, origin, "sec-fetch-site": "same-origin", "x-pulse-request": "browser" }
});
if (missingCsrf.response.status !== 403) throw new Error("State-changing requests accepted a missing CSRF token.");

await jsonResponse("/api/auth/logout", {
  method: "POST",
  headers: {
    cookie,
    origin,
    "sec-fetch-site": "same-origin",
    "x-pulse-request": "browser",
    "x-pulse-csrf": login.payload.csrfToken
  }
});
const invalidated = await jsonResponse("/api/auth/session", { headers });
if (invalidated.payload?.user !== null) throw new Error("Logout did not invalidate the database session.");

console.log("Authentication, CSRF, session, and HTTP smoke checks passed through Next.js to NestJS.");
