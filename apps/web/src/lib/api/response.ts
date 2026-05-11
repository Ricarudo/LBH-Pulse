import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        issues: error.issues
      },
      { status: 400 }
    );
  }

  if (error instanceof Error && error.message === "LEAD_NOT_FOUND") {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
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
