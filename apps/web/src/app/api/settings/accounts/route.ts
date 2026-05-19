import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { createLocalUser, listLocalUsers } from "@/lib/services/localUserService";
import { createLocalUserSchema } from "@/lib/validations/localUser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser("users:manage");
    const users = await listLocalUsers();
    return NextResponse.json({ users });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser("users:manage");
    const payload = createLocalUserSchema.parse(await request.json());
    const account = await createLocalUser(payload, user);
    return NextResponse.json({ user: account }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
