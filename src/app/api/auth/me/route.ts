import { handleApiError, ok } from "@/lib/api";
import { getCurrentAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const admin = await getCurrentAdmin();
    return ok({ admin });
  } catch (error) {
    return handleApiError(error);
  }
}
