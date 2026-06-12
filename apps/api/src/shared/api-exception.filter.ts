import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import { Prisma } from "@/generated/prisma/client";
import type { Response } from "express";
import { ZodError } from "zod";
import { AuthError } from "@/shared/auth.service";

type ErrorPayload = {
  status: number;
  body: Record<string, unknown>;
};

const errorMap: Record<string, ErrorPayload> = {
  REQUEST_NOT_FOUND: { status: 404, body: { error: "Request not found." } },
  REQUEST_ASSIGNEE_INVALID: {
    status: 400,
    body: { error: "Assigned person must be an active Pulse operations user." }
  },
  REQUEST_NOT_READY_FOR_QUOTE: {
    status: 400,
    body: { error: "Complete required intake checklist items before creating a quote workspace." }
  },
  REQUEST_CHECKLIST_TEMPLATE_NOT_FOUND: {
    status: 404,
    body: { error: "Request checklist template not found." }
  },
  REQUEST_CHECKLIST_TEMPLATE_FALLBACK_REQUIRED: {
    status: 400,
    body: { error: "The general request checklist template must remain active." }
  },
  REQUEST_CHECKLIST_TEMPLATE_DUPLICATE_MAPPING: {
    status: 400,
    body: { error: "Only one active checklist template can use the same request type or service category." }
  },
  REQUEST_CHECKLIST_TEMPLATE_EMPTY: {
    status: 400,
    body: { error: "An active checklist template must include at least one active item." }
  },
  REQUEST_CHECKLIST_TEMPLATE_ITEM_INVALID: {
    status: 400,
    body: { error: "Checklist template items must belong to the selected template." }
  },
  LOCAL_USER_NOT_FOUND: { status: 404, body: { error: "Pulse user not found." } },
  LOCAL_USER_EMAIL_EXISTS: {
    status: 400,
    body: { error: "A Pulse user with this email already exists." }
  },
  LOCAL_USER_LAST_ADMIN: {
    status: 400,
    body: { error: "At least one active Admin account must remain available." }
  },
  LOCAL_USER_PASSWORD_UNAVAILABLE: {
    status: 400,
    body: { error: "Password changes are only available for local Pulse accounts." }
  },
  LOCAL_USER_PASSWORD_INVALID: { status: 400, body: { error: "Current password is incorrect." } },
  CLIENT_NOT_FOUND: { status: 404, body: { error: "Client not found." } },
  CONTACT_NOT_FOUND: { status: 404, body: { error: "Contact not found." } }
};

function zodFieldErrors(error: ZodError) {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "form";
    fields[path] ??= issue.message;
  }

  return fields;
}

export function apiErrorPayload(error: unknown): ErrorPayload | null {
  if (error instanceof AuthError) {
    return {
      status: error.status,
      body: { error: error.message }
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: "Validation failed.",
        fields: zodFieldErrors(error),
        issues: error.issues
      }
    };
  }

  if (error instanceof Error && errorMap[error.message]) {
    return errorMap[error.message];
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return {
        status: 503,
        body: {
          error: "Pulse database schema is not ready.",
          detail: "Run the Pulse Prisma schema push after reviewing any data-loss warnings."
        }
      };
    }
  }

  return null;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = apiErrorPayload(error);

    if (mapped) {
      response.status(mapped.status).json(mapped.body);
      return;
    }

    if (error instanceof HttpException) {
      const status = error.getStatus();
      const exceptionResponse = error.getResponse();
      response.status(status).json(
        typeof exceptionResponse === "string"
          ? { error: exceptionResponse }
          : exceptionResponse
      );
      return;
    }

    console.error(error);
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: "Unexpected server error." });
  }
}
