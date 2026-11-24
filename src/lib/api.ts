import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "./auth";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function fail(message: string, status = 400, fieldErrors?: Record<string, string[]>): NextResponse {
  return NextResponse.json({ error: message, fieldErrors }, { status });
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return fail("Silakan login terlebih dahulu", 401);
  }
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_";
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return fail("Data tidak valid", 422, fieldErrors);
  }
  if (error instanceof Error && error.message) {
    return fail(error.message, 400);
  }
  console.error(error);
  return fail("Terjadi kesalahan pada server", 500);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Body request harus berupa JSON yang valid");
  }
}
