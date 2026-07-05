import { z } from "zod";

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(2, "Enter at least 2 characters.").max(100)
});
