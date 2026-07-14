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
import { DocumentRangeError } from "@/lib/services/documentService";

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
  REQUEST_CONVERTED_LOCKED: {
    status: 409,
    body: { error: "Converted requests cannot be reopened or closed again." }
  },
  REQUEST_CONVERSION_REQUIRED: {
    status: 400,
    body: { error: "Use the quote handoff to convert this request." }
  },
  REQUEST_CLOSE_REASON_REQUIRED: {
    status: 400,
    body: { error: "Add a reason before closing this request." }
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
  REQUEST_CHECKLIST_TEMPLATE_MAPPING_REQUIRED: {
    status: 400,
    body: { error: "Choose one trade or request type for this template." }
  },
  REQUEST_STEP_CLOSED: {
    status: 409,
    body: { error: "Closed or converted requests can receive comments, but cannot start a new current step." }
  },
  REQUEST_UPDATE_ASSIGNEE_REQUIRED: {
    status: 400,
    body: { error: "Choose a responsible assignee for the current step." }
  },
  REQUEST_UPDATE_ASSIGNEE_INVALID: {
    status: 400,
    body: { error: "The current-step assignee must be an active Pulse user." }
  },
  REQUEST_MENTION_USER_INVALID: {
    status: 400,
    body: { error: "One or more mentioned users are not active Pulse users." }
  },
  REQUEST_UPDATE_NOT_FOUND: { status: 404, body: { error: "Request update not found." } },
  REQUEST_UPDATE_NOT_OPEN: { status: 409, body: { error: "Only an open current step can be completed." } },
  REQUEST_UPDATE_NOT_UNDOABLE: { status: 409, body: { error: "This update is no longer undoable." } },
  REQUEST_UPDATE_UNDO_CONFLICT: { status: 409, body: { error: "The request changed before this update could be undone." } },
  REQUEST_COLLABORATOR_INVALID: {
    status: 400,
    body: { error: "The collaborator must be an active Pulse user." }
  },
  REQUEST_COLLABORATOR_NOT_FOUND: { status: 404, body: { error: "Request collaborator not found." } },
  REQUEST_CURRENT_ASSIGNEE_REQUIRED: {
    status: 409,
    body: { error: "Reassign or complete the current step before removing its assignee." }
  },
  REQUEST_CHECKLIST_TEMPLATE_ARCHIVED: {
    status: 409,
    body: { error: "Restore this template before editing it." }
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
  LOCAL_USER_SELF_ACCESS: {
    status: 400,
    body: { error: "Ask another administrator to change your role or account status." }
  },
  LOCAL_USER_PASSWORD_UNAVAILABLE: {
    status: 400,
    body: { error: "Password changes are only available for local Pulse accounts." }
  },
  LOCAL_USER_PASSWORD_INVALID: { status: 400, body: { error: "Current password is incorrect." } },
  LOCAL_USER_ADMIN_PROTECTED: {
    status: 403,
    body: { error: "Only an Administrator can manage Administrator accounts." }
  },
  ACCESS_ROLE_ADMIN_REQUIRED: {
    status: 403,
    body: { error: "Administrator access is required to manage roles." }
  },
  ACCESS_ROLE_NOT_FOUND: { status: 404, body: { error: "Role not found." } },
  ACCESS_ROLE_NAME_EXISTS: {
    status: 409,
    body: { error: "A role with that name already exists." }
  },
  ACCESS_ROLE_MATRIX_STALE: {
    status: 409,
    body: { error: "Roles changed in another session. Reload the matrix and try again." }
  },
  ACCESS_ROLE_PROTECTED: {
    status: 400,
    body: { error: "The Administrator role cannot be renamed or archived." }
  },
  ACCESS_ROLE_COPY_SOURCE_INVALID: {
    status: 400,
    body: { error: "Choose an active role to copy." }
  },
  ACCESS_ROLE_REPLACEMENT_REQUIRED: {
    status: 400,
    body: { error: "Choose a replacement role for assigned users." }
  },
  ACCESS_ROLE_REPLACEMENT_INVALID: {
    status: 400,
    body: { error: "Choose a different active replacement role." }
  },
  ACCESS_ROLE_ASSIGNMENT_INVALID: {
    status: 400,
    body: { error: "Choose an active role." }
  },
  CLIENT_NOT_FOUND: { status: 404, body: { error: "Client not found." } },
  CONTACT_NOT_FOUND: { status: 404, body: { error: "Contact not found." } },
  CLIENT_VERSION_CONFLICT: {
    status: 409,
    body: {
      error:
        "This client was updated by someone else. Refresh the profile before saving again."
    }
  },
  CLIENT_BULK_FILE_REQUIRED: {
    status: 400,
    body: { error: "Select a CSV file to upload." }
  },
  CLIENT_BULK_FILE_TYPE: {
    status: 400,
    body: { error: "Only files with the .csv extension are supported." }
  },
  CLIENT_BULK_FILE_TOO_LARGE: {
    status: 413,
    body: { error: "Client CSV files may be up to 5 MB." }
  },
  CLIENT_BULK_INVALID_ENCODING: {
    status: 400,
    body: { error: "Save the CSV using UTF-8 encoding and upload it again." }
  },
  CLIENT_BULK_INVALID_CSV: {
    status: 400,
    body: { error: "The file is not valid CSV." }
  },
  CLIENT_BULK_INVALID_HEADERS: {
    status: 400,
    body: { error: "The CSV headers do not match the client import template." }
  },
  CLIENT_BULK_ROW_LIMIT: {
    status: 413,
    body: { error: "Client CSV files may contain up to 2,000 data rows." }
  },
  CLIENT_BULK_EMPTY_SELECTION: {
    status: 400,
    body: { error: "Select at least one new or changed row." }
  },
  CLIENT_BULK_INVALID_SELECTION: {
    status: 400,
    body: { error: "The selected import rows are invalid." }
  },
  CLIENT_BULK_PREVIEW_STALE: {
    status: 409,
    body: {
      error:
        "The file or an existing client changed after preview. Review the CSV again before importing."
    }
  },
  QUOTE_NOT_FOUND: { status: 404, body: { error: "Quote not found." } },
  QUOTE_REVISION_NOT_FOUND: { status: 404, body: { error: "Quote revision not found." } },
  QUOTE_REVISION_IS_CURRENT: { status: 409, body: { error: "This is the current editable quote version." } },
  QUOTE_REVISION_STATUS_INVALID: {
    status: 409,
    body: { error: "Create a revision only from a sent, approved, rejected, or cancelled quote." }
  },
  QUOTE_REVISION_PROJECT_EXISTS: {
    status: 409,
    body: { error: "Quotes already converted to projects cannot be returned for revision." }
  },
  QUOTE_UPDATE_ASSIGNEE_REQUIRED: {
    status: 400,
    body: { error: "Choose a responsible assignee for the current step." }
  },
  QUOTE_UPDATE_ASSIGNEE_INVALID: {
    status: 400,
    body: { error: "The current-step assignee must be an active Pulse user with quote access." }
  },
  QUOTE_MENTION_USER_INVALID: {
    status: 400,
    body: { error: "One or more mentioned users do not have access to quotes." }
  },
  QUOTE_UPDATE_NOT_FOUND: { status: 404, body: { error: "Quote update not found." } },
  QUOTE_UPDATE_NOT_OPEN: { status: 409, body: { error: "Only an open current step can be completed." } },
  QUOTE_UPDATE_NOT_UNDOABLE: { status: 409, body: { error: "This update is no longer undoable." } },
  QUOTE_UPDATE_UNDO_CONFLICT: { status: 409, body: { error: "The quote changed before this update could be undone." } },
  QUOTE_ITEM_NOT_FOUND: { status: 404, body: { error: "Quote item not found." } },
  QUOTE_ITEM_REORDER_STALE: {
    status: 409,
    body: { error: "The quote changed while lines were being reordered. Refresh and try again." }
  },
  ITEM_NOT_FOUND: { status: 404, body: { error: "Item not found." } },
  ITEM_RELATION_SELF: {
    status: 400,
    body: { error: "An item cannot be related to itself." }
  },
  ITEM_RELATION_CHILD_NOT_FOUND: {
    status: 400,
    body: { error: "One or more related items were not found." }
  },
  ITEM_DEFAULT_LABOR_SELF: {
    status: 400,
    body: { error: "An item cannot use itself as default labor." }
  },
  ITEM_DEFAULT_LABOR_NOT_FOUND: {
    status: 400,
    body: { error: "The selected default labor item was not found." }
  },
  ITEM_DEFAULT_LABOR_INVALID: {
    status: 400,
    body: { error: "Default labor must be an active labor item." }
  },
  ITEM_DEFAULT_LABOR_REQUIRED: {
    status: 400,
    body: { error: "Choose a default labor item when labor hours are greater than zero." }
  },
  ITEM_SUGGESTION_INVALID: {
    status: 400,
    body: { error: "One or more selected suggestions are not related to this item." }
  },
  ITEM_BOM_DEPENDENCY_INACTIVE: {
    status: 409,
    body: { error: "A required kit, relation, or labor item is inactive." }
  },
  ITEM_BOM_QUANTITY_INVALID: {
    status: 400,
    body: { error: "The expanded BOM quantity is outside the supported range." }
  },
  ITEM_KIT_EMPTY: {
    status: 400,
    body: { error: "This item does not have any kit components." }
  },
  DOCUMENT_ACCESS_DENIED: {
    status: 403,
    body: { error: "You do not have permission to access this document." }
  },
  ITEM_RELATION_CYCLE: {
    status: 409,
    body: { error: "Required item relations contain a cycle." }
  },
  PROJECT_NOT_FOUND: { status: 404, body: { error: "Project not found." } },
  INVOICE_NOT_FOUND: { status: 404, body: { error: "Invoice not found." } },
  QUOTE_ALREADY_CONVERTED: { status: 409, body: { error: "This quote already has a project." } },
  QUOTE_NOT_APPROVED: { status: 400, body: { error: "Approve the quote before creating a project." } },
  QUOTE_CLIENT_REQUIRED: { status: 400, body: { error: "Select a client before creating a project from this quote." } },
  WORK_CLIENT_MISMATCH: { status: 400, body: { error: "The selected records must belong to the same client." } },
  PROJECT_CANCELLED: { status: 400, body: { error: "Cancelled projects cannot create invoices." } },
  DOCUMENT_NOT_FOUND: { status: 404, body: { error: "Document not found." } },
  DOCUMENT_NOT_AVAILABLE: { status: 409, body: { error: "This unverified document is not available for download." } },
  DOCUMENT_FILE_REQUIRED: { status: 400, body: { error: "Select a file to upload." } },
  DOCUMENT_FILENAME_INVALID: { status: 400, body: { error: "The filename contains unsupported or unsafe characters." } },
  DOCUMENT_TYPE_INVALID: { status: 400, body: { error: "Only PDF, JPEG, PNG, and WebP files are supported." } },
  DOCUMENT_SIGNATURE_INVALID: { status: 400, body: { error: "The file contents do not match the selected file type." } },
  DOCUMENT_TOO_LARGE: { status: 413, body: { error: "PDF files may be up to 100 MB; images may be up to 10 MB." } },
  DOCUMENT_LINEAGE_LIMIT: { status: 413, body: { error: "This Request–Quote–Project lifecycle has reached its 500 MB document limit." } },
  DOCUMENT_CATEGORY_INVALID: { status: 400, body: { error: "Select a valid document category for this lifecycle stage." } },
  DOCUMENT_TAGS_INVALID: { status: 400, body: { error: "Add up to 8 purpose tags, using no more than 32 characters per tag." } },
  DOCUMENT_MALWARE_DETECTED: { status: 422, body: { error: "The file failed malware inspection and was rejected." } },
  DOCUMENT_SCANNER_UNAVAILABLE: { status: 503, body: { error: "Document malware inspection is temporarily unavailable. Nothing was stored." } },
  DOCUMENT_STORAGE_UNAVAILABLE: { status: 503, body: { error: "Private document storage is unavailable. Nothing was stored." } },
  DOCUMENT_RANGE_INVALID: { status: 416, body: { error: "The requested document byte range is invalid." } }
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
    if (error instanceof DocumentRangeError) {
      response
        .status(416)
        .setHeader("Content-Range", `bytes */${error.byteSize}`)
        .json({ error: "The requested document byte range is invalid." });
      return;
    }
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
