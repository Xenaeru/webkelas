import { handleApiError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { createAssignment, listAssignments } from "@/lib/repository";
import { assignmentSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ assignments: await listAssignments() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = assignmentSchema.parse(await readJson(request));
    const assignment = await createAssignment(body);
    return ok({ assignment }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
