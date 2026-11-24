import { handleApiError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getScheduleSettings, saveScheduleSettings } from "@/lib/repository";
import { scheduleSettingsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ settings: await getScheduleSettings() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    const body = scheduleSettingsSchema.parse(await readJson(request));
    const settings = await saveScheduleSettings(body);
    return ok({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}
