import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createProject, listProjects } from "@/lib/services/workService";
import { createProjectSchema } from "@/lib/validations/work";

export const dynamic = "force-dynamic";
export async function GET() {
  try { await requireUser("crm:read"); return NextResponse.json({ projects: await listProjects() }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser("crm:write");
    const project = await createProject(createProjectSchema.parse(await request.json()), user);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) { return apiError(error); }
}

