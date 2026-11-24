import { handleApiError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getClassSettings, saveClassSettings } from "@/lib/repository";
import { classSettingsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ settings: await getClassSettings() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    const body = classSettingsSchema.parse(await readJson(request));
    const settings = await saveClassSettings(body);
    return ok({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}
