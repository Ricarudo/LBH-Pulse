import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { archiveProject, getProjectById, updateProject } from "@/lib/services/workService";
import { updateProjectSchema } from "@/lib/validations/work";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try { await requireUser("crm:read"); return NextResponse.json({ project: await getProjectById((await params).id) }); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requireUser("crm:write");
    return NextResponse.json({ project: await updateProject((await params).id, updateProjectSchema.parse(await request.json()), user) });
  } catch (error) { return apiError(error); }
}
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await requireUser("crm:write");
    return NextResponse.json({ project: await archiveProject((await params).id, user) });
  } catch (error) { return apiError(error); }
}

