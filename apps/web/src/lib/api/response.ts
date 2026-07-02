import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/session";

function zodFieldErrors(error: ZodError) {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "form";
    fields[path] ??= issue.message;
  }

  return fields;
}

export function apiError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        fields: zodFieldErrors(error),
        issues: error.issues
      },
      { status: 400 }
    );
  }

  if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  if (error instanceof Error && error.message === "REQUEST_ASSIGNEE_INVALID") {
    return NextResponse.json(
      { error: "Assigned person must be an active Pulse operations user." },
      { status: 400 }
    );
  }

  if (error instanceof Error && error.message === "REQUEST_NOT_READY_FOR_QUOTE") {
    return NextResponse.json(
      { error: "Complete required intake checklist items before creating a quote workspace." },
      { status: 400 }
    );
  }

  if (error instanceof Error && error.message === "REQUEST_CHECKLIST_TEMPLATE_NOT_FOUND") {
    return NextResponse.json({ error: "Request checklist template not found." }, { status: 404 });
  }

  if (error instanceof Error && error.message === "REQUEST_CHECKLIST_TEMPLATE_FALLBACK_REQUIRED") {
    return NextResponse.json(
      { error: "The general request checklist template must remain active." },
      { status: 400 }
    );
  }

  if (error instanceof Error && error.message === "REQUEST_CHECKLIST_TEMPLATE_DUPLICATE_MAPPING") {
    return NextResponse.json(
      { error: "Only one active checklist template can use the same request type or service category." },
      { status: 400 }
    );
  }

  if (error instanceof Error && error.message === "REQUEST_CHECKLIST_TEMPLATE_EMPTY") {
    return NextResponse.json(
      { error: "An active checklist template must include at least one active item." },
      { status: 400 }
    );
  }

  if (error instanceof Error && error.message === "REQUEST_CHECKLIST_TEMPLATE_ITEM_INVALID") {
    return NextResponse.json(
      { error: "Checklist template items must belong to the selected template." },
      { status: 400 }
    );
  }

  if (error instanceof Error && error.message === "LOCAL_USER_NOT_FOUND") {
    return NextResponse.json({ error: "Pulse user not found." }, { status: 404 });
  }

  if (error instanceof Error && error.message === "LOCAL_USER_EMAIL_EXISTS") {
    return NextResponse.json(
      { error: "A Pulse user with this email already exists." },
      { status: 400 }
    );
  }

  if (error instanceof Error && error.message === "LOCAL_USER_LAST_ADMIN") {
    return NextResponse.json(
      { error: "At least one active Admin account must remain available." },
      { status: 400 }
    );
  }

  if (error instanceof Error && error.message === "LOCAL_USER_PASSWORD_UNAVAILABLE") {
    return NextResponse.json(
      { error: "Password changes are only available for local Pulse accounts." },
      { status: 400 }
    );
  }

  if (error instanceof Error && error.message === "LOCAL_USER_PASSWORD_INVALID") {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  if (error instanceof Error && error.message === "CLIENT_NOT_FOUND") {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  if (error instanceof Error && error.message === "CLIENT_VERSION_CONFLICT") {
    return NextResponse.json(
      {
        error:
          "This client was updated by someone else. Refresh the profile before saving again."
      },
      { status: 409 }
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: "Unexpected server error." },
    { status: 500 }
  );
}
