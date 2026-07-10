import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { updateQuoteProposal } from "@/lib/services/workService";
import { updateQuoteProposalSchema } from "@/lib/validations/item";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("crm:write");
    const { id } = await params;
    const quote = await updateQuoteProposal(
      id,
      updateQuoteProposalSchema.parse(await request.json()),
      user
    );
    return NextResponse.json({ quote });
  } catch (error) {
    return apiError(error);
  }
}
