const baseUrl = process.env.PULSE_WEB_URL || "http://web:4300";

async function jsonResponse(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${init?.method || "GET"} ${path} returned ${response.status}: ${body}`);
  }

  return {
    response,
    payload: body ? JSON.parse(body) : null
  };
}

const login = await jsonResponse("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "admin@r2.local",
    password: "PulseAdmin123!"
  })
});
const setCookie = login.response.headers.get("set-cookie");

if (!setCookie) {
  throw new Error("Login response did not set a session cookie.");
}

const headers = { cookie: setCookie.split(";", 1)[0] };
const items = await jsonResponse("/api/items", { headers });

if (!Array.isArray(items.payload?.items)) {
  throw new Error("Items endpoint did not return an items array.");
}

const search = await jsonResponse("/api/items/search?q=cable", { headers });

if (!Array.isArray(search.payload?.items)) {
  throw new Error("Item search endpoint did not return an items array.");
}

const quotes = await jsonResponse("/api/quotes", { headers });

if (!Array.isArray(quotes.payload?.quotes) || !quotes.payload.quotes[0]?.id) {
  throw new Error("Seeded quote list is missing from the API response.");
}

const quote = await jsonResponse(`/api/quotes/${quotes.payload.quotes[0].id}`, {
  headers
});

if (!Array.isArray(quote.payload?.quote?.items) || !quote.payload?.quote?.context) {
  throw new Error("Quote detail endpoint did not return BOM and snapshot context.");
}

console.log("HTTP smoke checks passed through Next.js to NestJS.");
