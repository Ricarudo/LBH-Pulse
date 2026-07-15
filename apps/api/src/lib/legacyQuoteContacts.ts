export type LegacyQuoteContactCandidate = {
  quoteId: string;
  quoteNumber: string;
  clientId: string;
  clientName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  updatedAt: Date;
};

export type ExistingClientContactCandidate = {
  id: string;
  clientId: string;
  name: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
};

export type ExistingContactLinkPlan = {
  quoteId: string;
  quoteNumber: string;
  quoteUpdatedAt: Date;
  clientId: string;
  clientName: string;
  contactId: string;
};

export type NewClientContactPlan = {
  clientId: string;
  clientName: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredContactMethod: "Email" | "Phone";
  quoteIds: string[];
  quoteNumbers: string[];
  quoteUpdatedAtById: Map<string, Date>;
};

export type UnresolvedQuoteContactPlan = {
  quoteId: string;
  quoteNumber: string;
  clientId: string;
  clientName: string;
  reason: "missing_identity" | "ambiguous_existing_contact";
  candidateContactIds: string[];
};

export type LegacyQuoteContactReconciliationPlan = {
  existingLinks: ExistingContactLinkPlan[];
  newContacts: NewClientContactPlan[];
  unresolved: UnresolvedQuoteContactPlan[];
};

type LegacyIdentity = LegacyQuoteContactCandidate & {
  name: string;
  email: string;
  phone: string;
};

type ExistingIdentity = ExistingClientContactCandidate & {
  name: string;
  email: string;
  phones: string[];
};

function clean(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function normalizeContactName(value: string | null | undefined) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeContactEmail(value: string | null | undefined) {
  return clean(value).toLocaleLowerCase("en-US");
}

export function isValidContactEmail(value: string | null | undefined) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizeContactEmail(value));
}

function contactEmailsLikelySame(
  leftValue: string | null | undefined,
  rightValue: string | null | undefined
) {
  const left = normalizeContactEmail(leftValue);
  const right = normalizeContactEmail(rightValue);
  if (!left || !right) return false;
  if (left === right) return true;
  const leftValid = isValidContactEmail(left);
  const rightValid = isValidContactEmail(right);
  if (leftValid === rightValid) return false;
  const valid = leftValid ? left : right;
  const invalid = leftValid ? right : left;
  return valid.replace("@", ".") === invalid;
}

export function normalizeContactPhone(value: string | null | undefined) {
  const digits = clean(value).replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

function givenNamesLikelySame(left: string, right: string) {
  if (left === right) return true;
  if (left.length === 1 || right.length === 1) {
    return left[0] === right[0];
  }
  const tolerance = Math.min(left.length, right.length) >= 6 ? 2 : 1;
  return editDistance(left, right) <= tolerance;
}

export function contactNamesLikelySame(
  leftValue: string | null | undefined,
  rightValue: string | null | undefined
) {
  const left = normalizeContactName(leftValue);
  const right = normalizeContactName(rightValue);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftTokens = left.split(" ");
  const rightTokens = right.split(" ");
  const leftFirst = leftTokens[0]!;
  const rightFirst = rightTokens[0]!;
  const leftLast = leftTokens.at(-1)!;
  const rightLast = rightTokens.at(-1)!;

  if (
    leftLast === rightLast &&
    givenNamesLikelySame(leftFirst, rightFirst)
  ) {
    return true;
  }

  const shorter = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const longer = shorter === leftTokens ? rightTokens : leftTokens;
  const shorterFirst = shorter[0]!;
  const longerFirst = longer[0]!;
  const substantiveShorter = shorter.filter((token) => token.length > 1);
  if (
    givenNamesLikelySame(shorterFirst, longerFirst) &&
    substantiveShorter.every((token) => longer.includes(token))
  ) {
    return true;
  }

  const tolerance = Math.max(left.length, right.length) >= 12 ? 2 : 1;
  return editDistance(left, right) <= tolerance;
}

function legacyIdentity(quote: LegacyQuoteContactCandidate): LegacyIdentity {
  return {
    ...quote,
    name: normalizeContactName(quote.contactName),
    email: normalizeContactEmail(quote.contactEmail),
    phone: normalizeContactPhone(quote.contactPhone)
  };
}

function existingIdentity(contact: ExistingClientContactCandidate): ExistingIdentity {
  const name = clean(contact.name) || clean(`${contact.firstName} ${contact.lastName}`);
  return {
    ...contact,
    name: normalizeContactName(name),
    email: normalizeContactEmail(contact.email),
    phones: [
      normalizeContactPhone(contact.phone),
      normalizeContactPhone(contact.mobile)
    ].filter((value, index, values) => value && values.indexOf(value) === index)
  };
}

function existingMatchScore(quote: LegacyIdentity, contact: ExistingIdentity) {
  const emailMatch = contactEmailsLikelySame(quote.email, contact.email);
  const phoneMatch = Boolean(quote.phone && contact.phones.includes(quote.phone));
  const nameMatch = contactNamesLikelySame(quote.name, contact.name);
  const emailConflict = Boolean(
    quote.email && contact.email && !contactEmailsLikelySame(quote.email, contact.email)
  );
  const phoneConflict = Boolean(
    quote.phone && contact.phones.length && !contact.phones.includes(quote.phone)
  );

  if (emailMatch && phoneMatch) return 3_000 + (nameMatch ? 10 : 0);
  if (emailMatch && (nameMatch || !quote.name || !contact.name)) {
    return 2_000 + (nameMatch ? 10 : 0);
  }
  if (phoneMatch && !emailConflict && (nameMatch || !quote.name || !contact.name)) {
    return 1_000 + (nameMatch ? 10 : 0);
  }
  if (nameMatch && !emailConflict && !phoneConflict) return 500;
  return 0;
}

function sameLegacyPerson(left: LegacyIdentity, right: LegacyIdentity) {
  const emailMatch = contactEmailsLikelySame(left.email, right.email);
  const phoneMatch = Boolean(left.phone && left.phone === right.phone);
  const namesMatch = contactNamesLikelySame(left.name, right.name);
  const emailConflict = Boolean(
    left.email && right.email && !contactEmailsLikelySame(left.email, right.email)
  );
  const phoneConflict = Boolean(left.phone && right.phone && left.phone !== right.phone);

  if (emailMatch && phoneMatch) return true;
  if (namesMatch && !(emailConflict && phoneConflict)) return true;
  if (!left.name || !right.name) return emailMatch || phoneMatch;
  return false;
}

function preferredValue(
  rows: LegacyIdentity[],
  value: (row: LegacyIdentity) => string,
  normalized: (value: string) => string
) {
  const options = new Map<string, { raw: string; count: number; latest: number }>();
  for (const row of rows) {
    const raw = clean(value(row));
    const key = normalized(raw);
    if (!key) continue;
    const existing = options.get(key);
    options.set(key, {
      raw: !existing || raw.length > existing.raw.length ? raw : existing.raw,
      count: (existing?.count ?? 0) + 1,
      latest: Math.max(existing?.latest ?? 0, row.updatedAt.getTime())
    });
  }
  return Array.from(options.values()).sort((left, right) =>
    right.count - left.count ||
    right.latest - left.latest ||
    right.raw.length - left.raw.length ||
    left.raw.localeCompare(right.raw)
  )[0]?.raw ?? "";
}

function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("en-US") + part.slice(1))
    .join(" ");
}

function splitName(name: string) {
  const parts = clean(name).split(" ").filter(Boolean);
  return {
    firstName: parts[0] || "Unknown",
    lastName: parts.slice(1).join(" ")
  };
}

function connectedComponents(rows: LegacyIdentity[]) {
  const parents = rows.map((_, index) => index);
  const find = (index: number): number => {
    if (parents[index] !== index) parents[index] = find(parents[index]!);
    return parents[index]!;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };

  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      if (sameLegacyPerson(rows[left]!, rows[right]!)) union(left, right);
    }
  }

  const groups = new Map<number, LegacyIdentity[]>();
  rows.forEach((row, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), row]);
  });
  return Array.from(groups.values());
}

export function planLegacyQuoteContactReconciliation(
  quoteCandidates: LegacyQuoteContactCandidate[],
  existingContactCandidates: ExistingClientContactCandidate[]
): LegacyQuoteContactReconciliationPlan {
  const contactsByClient = new Map<string, ExistingIdentity[]>();
  for (const contact of existingContactCandidates) {
    const list = contactsByClient.get(contact.clientId) ?? [];
    list.push(existingIdentity(contact));
    contactsByClient.set(contact.clientId, list);
  }

  const existingLinks: ExistingContactLinkPlan[] = [];
  const unresolved: UnresolvedQuoteContactPlan[] = [];
  const unmatchedByClient = new Map<string, LegacyIdentity[]>();

  for (const quoteCandidate of quoteCandidates) {
    const quote = legacyIdentity(quoteCandidate);
    if (!quote.name && !quote.email && !quote.phone) {
      unresolved.push({
        quoteId: quote.quoteId,
        quoteNumber: quote.quoteNumber,
        clientId: quote.clientId,
        clientName: quote.clientName,
        reason: "missing_identity",
        candidateContactIds: []
      });
      continue;
    }

    const scored = (contactsByClient.get(quote.clientId) ?? [])
      .map((contact) => ({ contact, score: existingMatchScore(quote, contact) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.contact.id.localeCompare(right.contact.id));
    const bestScore = scored[0]?.score ?? 0;
    const best = scored.filter(({ score }) => score === bestScore);

    if (best.length === 1) {
      existingLinks.push({
        quoteId: quote.quoteId,
        quoteNumber: quote.quoteNumber,
        quoteUpdatedAt: quote.updatedAt,
        clientId: quote.clientId,
        clientName: quote.clientName,
        contactId: best[0]!.contact.id
      });
      continue;
    }
    if (best.length > 1) {
      unresolved.push({
        quoteId: quote.quoteId,
        quoteNumber: quote.quoteNumber,
        clientId: quote.clientId,
        clientName: quote.clientName,
        reason: "ambiguous_existing_contact",
        candidateContactIds: best.map(({ contact }) => contact.id)
      });
      continue;
    }

    const list = unmatchedByClient.get(quote.clientId) ?? [];
    list.push(quote);
    unmatchedByClient.set(quote.clientId, list);
  }

  const newContacts: NewClientContactPlan[] = [];
  for (const rows of unmatchedByClient.values()) {
    for (const group of connectedComponents(rows)) {
      const email = normalizeContactEmail(
        preferredValue(
          group,
          (row) => isValidContactEmail(row.contactEmail) ? row.contactEmail ?? "" : "",
          normalizeContactEmail
        )
      );
      const phone = preferredValue(
        group,
        (row) => row.contactPhone ?? "",
        normalizeContactPhone
      ) || null;
      const capturedName = preferredValue(
        group,
        (row) => row.contactName ?? "",
        normalizeContactName
      );
      if (!capturedName && !email && !phone) {
        unresolved.push(...group.map((row) => ({
          quoteId: row.quoteId,
          quoteNumber: row.quoteNumber,
          clientId: row.clientId,
          clientName: row.clientName,
          reason: "missing_identity" as const,
          candidateContactIds: []
        })));
        continue;
      }
      const name = capturedName || nameFromEmail(email) || "Legacy quote contact";
      const { firstName, lastName } = splitName(name);
      const sorted = [...group].sort((left, right) =>
        left.quoteNumber.localeCompare(right.quoteNumber) || left.quoteId.localeCompare(right.quoteId)
      );

      newContacts.push({
        clientId: group[0]!.clientId,
        clientName: group[0]!.clientName,
        name,
        firstName,
        lastName,
        email: email || null,
        phone,
        preferredContactMethod: email ? "Email" : "Phone",
        quoteIds: sorted.map((row) => row.quoteId),
        quoteNumbers: sorted.map((row) => row.quoteNumber),
        quoteUpdatedAtById: new Map(sorted.map((row) => [row.quoteId, row.updatedAt]))
      });
    }
  }

  existingLinks.sort((left, right) =>
    left.clientName.localeCompare(right.clientName) || left.quoteNumber.localeCompare(right.quoteNumber)
  );
  newContacts.sort((left, right) =>
    left.clientName.localeCompare(right.clientName) || left.name.localeCompare(right.name)
  );
  unresolved.sort((left, right) =>
    left.clientName.localeCompare(right.clientName) || left.quoteNumber.localeCompare(right.quoteNumber)
  );

  return { existingLinks, newContacts, unresolved };
}
