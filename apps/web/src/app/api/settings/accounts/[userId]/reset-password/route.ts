import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";
import { resetLocalUserPassword } from "@/lib/services/localUserService";
import { resetLocalUserPasswordSchema } from "@/lib/validations/localUser";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireUser("users:manage");
    const { userId } = await params;
    const payload = resetLocalUserPasswordSchema.parse(await request.json());
    const account = await resetLocalUserPassword(userId, payload, user);
    return NextResponse.json({ user: account });
  } catch (error) {
    return apiError(error);
  }
}
