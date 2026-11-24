import { fail, handleApiError, ok, readJson } from "@/lib/api";
import { countAdmins, createAdmin, createSession } from "@/lib/auth";
import { setupSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ needsSetup: (await countAdmins()) === 0 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    if ((await countAdmins()) > 0) {
      return fail("Akun admin sudah tersedia. Silakan login.", 409);
    }

    const body = setupSchema.parse(await readJson(request));
    const user = await createAdmin(body.username, body.password);
    await createSession(user.id);
    return ok({ username: user.username }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
