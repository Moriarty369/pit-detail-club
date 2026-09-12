import type { SessionInfo } from "./contracts";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "X-PIT-Client": "1",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value: any = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      value.error || "No se pudo conectar. Vuelve a intentarlo.",
      response.status,
    );
  return value;
}
export async function getSession() {
  try {
    return await api<SessionInfo>("/session");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
export type Config = {
  portal: "customer" | "admin";
  emailEnabled: boolean;
  googleEnabled: boolean;
  captchaSiteKey: string | null;
  dataMode?: "local" | "connected";
};
