import { json, type RequestHandler } from "express";

// Whole-document working saves can exceed Express's 100 KB default on large estimates.
// Keep the increased limit scoped to Builder endpoints and below the web proxy's 10 MB cap.
const parse = json({ limit: "8mb" });
export const builderBodyParser: RequestHandler = (request, response, next) => {
  parse(request, response, error => {
    if (error) {
      response.status(error.type === "entity.too.large" ? 413 : 400).json({
        error: error.type === "entity.too.large" ? "Builder working data exceeds the 8 MB save limit. Local edits are retained." : "Builder request must contain valid JSON."
      });
      return;
    }
    next();
  });
};
