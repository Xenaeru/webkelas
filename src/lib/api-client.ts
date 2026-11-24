export interface ApiError {
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export class RequestError extends Error {
  fieldErrors?: Record<string, string[]>;

  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "RequestError";
    this.fieldErrors = fieldErrors;
  }
}

export async function apiRequest<T>(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  let payload: { data?: T; error?: string; fieldErrors?: Record<string, string[]> } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // Non-JSON response (e.g. network proxy error).
  }

  if (!response.ok) {
    const firstField = payload.fieldErrors ? Object.values(payload.fieldErrors).flat()[0] : undefined;
    throw new RequestError(firstField ?? payload.error ?? "Permintaan gagal", payload.fieldErrors);
  }

  return payload.data as T;
}
