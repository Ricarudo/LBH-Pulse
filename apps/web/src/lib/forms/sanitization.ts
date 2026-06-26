// Shared client-side form sanitation utilities. These helpers mirror the API
// validation rules enough to give users immediate field-level feedback, while
// the server-side Zod schemas remain the final source of truth.
export type ApiIssue = {
  path?: Array<string | number>;
  message?: string;
};

export type ApiErrorBody = {
  error?: string;
  fields?: Record<string, string>;
  issues?: ApiIssue[];
};

export class FormRequestError extends Error {
  fields: Record<string, string>;
  issues: ApiIssue[];

  constructor(message: string, fields?: Record<string, string>, issues?: ApiIssue[]) {
    super(message);
    this.name = "FormRequestError";
    this.fields = fields ?? {};
    this.issues = issues ?? [];
  }
}

export type FieldErrors<TField extends string> = Partial<Record<TField | "form", string>>;

export const unsafeFreeTextMessage = "Remove HTML or script content.";

const unsafeFreeTextPattern = /[<>]|javascript\s*:/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+().\-\s]*(?:(?:x|ext\.?)\s?\d{1,8})?$/i;

export function normalizeText(value: string, collapseSpaces = false) {
  const trimmed = value.trim();
  return collapseSpaces ? trimmed.replace(/\s+/g, " ") : trimmed;
}

export function normalizeEmail(value: string) {
  return normalizeText(value).toLowerCase();
}

export function normalizePhone(value: string) {
  return normalizeText(value, true);
}

export function hasUnsafeFreeText(value: string) {
  return unsafeFreeTextPattern.test(value);
}

export function isEmailFormatValid(value: string) {
  return !value || emailPattern.test(value);
}

export function isPhoneFormatValid(value: string) {
  return !value || (phonePattern.test(value) && value.replace(/\D/g, "").length >= 7);
}

export function isAllowedValue<const T extends readonly string[]>(
  value: string,
  allowedValues: T
): value is T[number] {
  return allowedValues.includes(value);
}

export function validateCleanText<TField extends string>(
  errors: FieldErrors<TField>,
  field: TField,
  value: string,
  limit: number
) {
  // Keep per-field validators small and composable so feature forms can reuse
  // the same text limits and unsafe-input messaging without component inheritance.
  if (value.length > limit) {
    errors[field] = `Must be ${limit} characters or less.`;
    return;
  }

  if (hasUnsafeFreeText(value)) {
    errors[field] = unsafeFreeTextMessage;
  }
}

export function mapApiErrors<TField extends string>(
  error: FormRequestError,
  fieldFromPath: (path: string) => TField | "form"
) {
  // API errors arrive as Zod paths. Each form supplies a tiny path mapper so
  // nested payload errors can still land next to the visible field.
  const mapped: FieldErrors<TField> = {};

  for (const [path, message] of Object.entries(error.fields)) {
    const field = fieldFromPath(path);
    mapped[field] ??= message;
  }

  for (const issue of error.issues) {
    if (!issue.message || !issue.path) {
      continue;
    }

    const field = fieldFromPath(issue.path.map(String).join("."));
    mapped[field] ??= issue.message;
  }

  if (!Object.keys(mapped).length) {
    mapped.form = error.message;
  }

  return mapped;
}

export async function formJson<T>(url: string, init?: RequestInit, fallback = "Request failed.") {
  // Fetch wrapper used by form surfaces that need structured field errors.
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  const data = (await response.json().catch(() => ({}))) as ApiErrorBody;

  if (!response.ok) {
    throw new FormRequestError(
      typeof data.error === "string" ? data.error : fallback,
      data.fields,
      data.issues
    );
  }

  return data as T;
}
