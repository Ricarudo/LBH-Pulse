import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/session";

export function apiError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed.",
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

  if (error instanceof Error && error.message === "CLIENT_NOT_FOUND") {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  console.error(error);
  return NextResponse.json(
    { error: "Unexpected server error." },
    { status: 500 }
  );
}
