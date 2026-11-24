import { handleApiError, ok, readJson, fail } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import {
  createScheduleItem,
  getScheduleForDay,
  listSchedules,
  reorderScheduleItems,
  updateDayDescription,
} from "@/lib/repository";
import {
  dayParamSchema,
  dayDescriptionSchema,
  scheduleItemSchema,
  scheduleVersionSchema,
} from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readVersion(url: URL) {
  const raw = url.searchParams.get("version");
  if (!raw) return "A" as const;
  return scheduleVersionSchema.parse(raw);
}

export async function GET(request: Request) {
  try {
    const version = readVersion(new URL(request.url));
    return ok({ version, schedules: await listSchedules(version) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const version = readVersion(url);
    const action = url.searchParams.get("action") ?? "item";

    if (action === "description") {
      const day = dayParamSchema.parse(url.searchParams.get("day"));
      const body = dayDescriptionSchema.parse(await readJson(request));
      const schedule = await updateDayDescription(day, body.description, version);
      return ok({ schedule });
    }

    if (action === "reorder") {
      const day = dayParamSchema.parse(url.searchParams.get("day"));
      const body = (await readJson(request)) as { orderedIds?: unknown };
      const orderedIds = Array.isArray(body.orderedIds)
        ? body.orderedIds.map((id) => Number(id))
        : [];
      if (orderedIds.length === 0 || orderedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
        return fail("Daftar urutan tidak valid", 422);
      }
      const items = await reorderScheduleItems(day, orderedIds, version);
      return ok({ items });
    }

    const day = dayParamSchema.parse(url.searchParams.get("day"));
    const body = scheduleItemSchema.parse(await readJson(request));
    const item = await createScheduleItem(day, body, version);
    const schedule = await getScheduleForDay(day, version);
    return ok({ item, schedule }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
