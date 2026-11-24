import { fail, handleApiError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import {
  deleteScheduleItem,
  getScheduleForDay,
  getScheduleLocationOfItem,
  updateScheduleItem,
} from "@/lib/repository";
import { idParamSchema, scheduleItemUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const itemId = idParamSchema.parse(id);
    const body = scheduleItemUpdateSchema.parse(await readJson(request));

    const location = await getScheduleLocationOfItem(itemId);
    if (!location) return fail("Pelajaran tidak ditemukan", 404);

    const updated = await updateScheduleItem(itemId, body);
    if (!updated) return fail("Pelajaran tidak ditemukan", 404);

    const schedule = await getScheduleForDay(location.dayOfWeek, location.version);
    return ok({ item: updated, schedule });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const itemId = idParamSchema.parse(id);

    const location = await deleteScheduleItem(itemId);
    if (!location) return fail("Pelajaran tidak ditemukan", 404);

    const schedule = await getScheduleForDay(location.dayOfWeek, location.version);
    return ok({ deleted: true, schedule });
  } catch (error) {
    return handleApiError(error);
  }
}
