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

  if (error instanceof Error && error.message === "CLIENT_NOT_FOUND") {
    return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }

  console.error(error);
  return NextResponse.json(
    { error: "Unexpected server error." },
    { status: 500 }
  );
}
