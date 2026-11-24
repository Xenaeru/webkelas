import { fail, handleApiError, ok, readJson } from "@/lib/api";
import { authenticate, countAdmins, createSession } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if ((await countAdmins()) === 0) {
      return fail("Belum ada akun admin. Jalankan setup terlebih dahulu.", 409);
    }

    const body = loginSchema.parse(await readJson(request));
    const user = await authenticate(body.username, body.password);
    if (!user) {
      return fail("Username atau password salah", 401);
    }

    await createSession(user.id);
    return ok({ username: user.username });
  } catch (error) {
    return handleApiError(error);
  }
}
