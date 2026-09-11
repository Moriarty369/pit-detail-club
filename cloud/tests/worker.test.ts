import { beforeEach, test, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  role: "customer",
  aal: "aal1",
  factors: [] as any[],
  user: {
    id: "10000000-0000-4000-8000-000000000001",
    email: "test@example.test",
    user_metadata: { full_name: "Cliente" },
  },
  rpc: vi.fn(),
  factory: vi.fn(),
  oauth: vi.fn(),
  exchange: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mock.factory }));
import { createApp, type Bindings } from "../worker/app";
const env: Bindings = {
  SUPABASE_URL: "https://project.example.test",
  SUPABASE_ANON_KEY: "public-anon-test-key",
  COOKIE_SECRET: "test-secret-more-than-thirty-two-characters",
  APP_ORIGIN: "https://club.example.test",
  PORTAL: "customer",
  EMAIL_ENABLED: "true",
  AUTH_LIMITER: { limit: async () => ({ success: true }) },
};
const app = createApp();
function request(
  path: string,
  method = "GET",
  data?: unknown,
  changes: Partial<Bindings> = {},
  headers: Record<string, string> = {},
) {
  return app.request(
    "https://club.example.test/api" + path,
    {
      method,
      headers: {
        Origin: env.APP_ORIGIN,
        "X-PIT-Client": "1",
        "Content-Type": "application/json",
        ...headers,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    },
    { ...env, ...changes },
  );
}
beforeEach(() => {
  mock.role = "customer";
  mock.aal = "aal1";
  mock.factors = [];
  mock.oauth.mockReset().mockResolvedValue({
    data: {
      url: "https://project.example.test/auth/v1/authorize?provider=google",
    },
    error: null,
  });
  mock.exchange.mockReset().mockResolvedValue({
    data: { user: mock.user },
    error: null,
  });
  mock.signOut.mockReset().mockResolvedValue({ error: null });
  mock.rpc.mockReset().mockImplementation(async (name) => ({
    data: name === "pit_session_role" ? mock.role : { points: 0 },
    error: null,
  }));
  mock.factory.mockReset().mockImplementation((_url, _key, options) => ({
    rpc: mock.rpc,
    auth: {
      signInWithOAuth: mock.oauth,
      exchangeCodeForSession: mock.exchange,
      signOut: mock.signOut,
      getUser: async () => {
        options.cookies.setAll([
          { name: "pit-client", value: "opaque-test-token", options: {} },
        ]);
        return { data: { user: mock.user }, error: null };
      },
      mfa: {
        listFactors: async () => ({
          data: { totp: mock.factors, all: mock.factors },
          error: null,
        }),
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: mock.aal },
          error: null,
        }),
      },
    },
  }));
});
test("missing deployment configuration fails closed", async () => {
  const r = await request("/session", "GET", undefined, { SUPABASE_URL: "" });
  expect(r.status).toBe(503);
  expect(r.headers.get("cache-control")).toContain("no-store");
});
test("mutations reject cross origin, absent custom header and oversized bodies", async () => {
  expect(
    (
      await request(
        "/me",
        "PATCH",
        {},
        {},
        { Origin: "https://evil.example.test" },
      )
    ).status,
  ).toBe(403);
  expect(
    (await request("/me", "PATCH", {}, {}, { "X-PIT-Client": "" })).status,
  ).toBe(403);
  expect(
    (await request("/me", "PATCH", { name: "x".repeat(9000) })).status,
  ).toBe(413);
});
test("public worker never executes administrative RPCs", async () => {
  const r = await request("/admin/customers");
  expect(r.status).toBe(404);
  expect(mock.rpc).not.toHaveBeenCalledWith(
    "pit_admin_customers",
    expect.anything(),
  );
});
test("admin cannot use customer portal; enrolled customer at AAL1 can only complete MFA", async () => {
  mock.role = "admin";
  expect((await request("/session")).status).toBe(403);
  mock.role = "customer";
  mock.factors = [{ id: crypto.randomUUID(), status: "verified" }];
  const response = await request("/session");
  const state: any = await response.json();
  expect(state.mfa.required).toBe(true);
  expect(state.member).toBeNull();
  expect((await request("/me")).status).toBe(403);
  expect(mock.rpc).not.toHaveBeenCalledWith("pit_my_member");
});
test("strict profile schema prevents ledger injection even after sign in", async () => {
  expect(
    (
      await request("/me", "PATCH", {
        name: "Cliente",
        marketing: false,
        points: 999999,
      })
    ).status,
  ).toBe(400);
  expect(mock.rpc).not.toHaveBeenCalledWith(
    "pit_update_profile",
    expect.anything(),
  );
});
test("provider cookies are HttpOnly and Secure, and tokens never appear in the response body", async () => {
  const r = await request("/session");
  const cookie = r.headers.get("set-cookie");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Lax");
  expect(await r.text()).not.toContain("opaque-test-token");
});
test("rate limit rejection precedes password processing", async () => {
  const r = await request(
    "/auth/login",
    "POST",
    { email: "test@example.test", password: "long-test-password" },
    { AUTH_LIMITER: { limit: async () => ({ success: false }) } },
  );
  expect(r.status).toBe(429);
  expect(mock.factory).not.toHaveBeenCalled();
});
test("Google access requires an enabled provider and uses the configured callback", async () => {
  expect((await request("/auth/google", "POST", {})).status).toBe(404);
  expect(mock.oauth).not.toHaveBeenCalled();
  const r = await request(
    "/auth/google",
    "POST",
    {},
    { GOOGLE_ENABLED: "true" },
  );
  expect(r.status).toBe(200);
  expect(mock.oauth).toHaveBeenCalledWith({
    provider: "google",
    options: {
      redirectTo: env.APP_ORIGIN + "/api/auth/callback",
      skipBrowserRedirect: true,
    },
  });
  expect(r.headers.get("cache-control")).toContain("no-store");
});
test("Google login rejects a client-supplied redirect", async () => {
  const r = await request(
    "/auth/google",
    "POST",
    {
      redirectTo: "https://evil.example.test",
    },
    { GOOGLE_ENABLED: "true" },
  );
  expect(r.status).toBe(400);
  expect(mock.oauth).not.toHaveBeenCalled();
});
test("OAuth callback rejects missing and invalid codes without accessing member data", async () => {
  const missing = await request("/auth/callback?error=access_denied");
  expect(missing.headers.get("location")).toBe("/?auth=failed");
  expect(mock.exchange).not.toHaveBeenCalled();
  mock.exchange.mockResolvedValue({
    data: { user: null },
    error: { message: "Invalid code" },
  });
  const invalid = await request("/auth/callback?code=invalid-test-code");
  expect(invalid.headers.get("location")).toBe("/?auth=failed");
  expect(mock.rpc).not.toHaveBeenCalled();
});
test("OAuth callback rejects the wrong portal and ignores external destinations", async () => {
  mock.role = "admin";
  const rejected = await request("/auth/callback?code=test-code");
  expect(rejected.headers.get("location")).toBe("/?auth=wrong-portal");
  expect(mock.signOut).toHaveBeenCalledWith({ scope: "local" });
  mock.role = "customer";
  const accepted = await request(
    "/auth/callback?code=test-code&next=https://evil.example.test",
  );
  expect(accepted.status).toBe(302);
  expect(accepted.headers.get("location")).toBe("/#home");
});
