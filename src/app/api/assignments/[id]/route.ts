import { fail, handleApiError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { deleteAssignment, updateAssignment } from "@/lib/repository";
import { assignmentUpdateSchema, idParamSchema } from "@/lib/validation";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const assignmentId = idParamSchema.parse(id);
    const body = assignmentUpdateSchema.parse(await readJson(request));

    const assignment = await updateAssignment(assignmentId, body);
    if (!assignment) return fail("Tugas tidak ditemukan", 404);
    return ok({ assignment });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const assignmentId = idParamSchema.parse(id);
    const deleted = await deleteAssignment(assignmentId);
    if (!deleted) return fail("Tugas tidak ditemukan", 404);
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
