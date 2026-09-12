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
  updateUser: vi.fn(),
  unenroll: vi.fn(),
  verifyPassword: vi.fn(),
  verifierSignOut: vi.fn(),
  otp: vi.fn(),
  resend: vi.fn(),
  listFactors: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mock.factory }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mock.verifyPassword,
      signOut: mock.verifierSignOut,
    },
  }),
}));
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
  mock.updateUser.mockReset().mockResolvedValue({ error: null });
  mock.unenroll.mockReset().mockResolvedValue({ error: null });
  mock.verifyPassword.mockReset().mockResolvedValue({ error: null });
  mock.verifierSignOut.mockReset().mockResolvedValue({ error: null });
  mock.otp.mockReset().mockResolvedValue({
    data: { user: mock.user, session: { access_token: "opaque-test-token" } },
    error: null,
  });
  mock.resend.mockReset().mockResolvedValue({ error: null });
  mock.listFactors.mockReset().mockImplementation(async () => ({
    data: { totp: mock.factors, all: mock.factors },
    error: null,
  }));
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
      updateUser: mock.updateUser,
      verifyOtp: mock.otp,
      resend: mock.resend,
      getUser: async () => {
        options.cookies.setAll([
          {
            name: options.cookieOptions.name,
            value: "opaque-test-token",
            options: {},
          },
        ]);
        return {
          data: {
            user: {
              ...mock.user,
              factors: mock.factors.map((f) => ({ ...f, factor_type: "totp" })),
            },
          },
          error: null,
        };
      },
      mfa: {
        unenroll: mock.unenroll,
        listFactors: mock.listFactors,
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: mock.aal },
          error: null,
        }),
      },
    },
  }));
});

test("session reuses provider-validated factors without a duplicate lookup", async () => {
  mock.factors = [{ id: crypto.randomUUID(), status: "verified" }];
  const r = await request("/session");
  expect((await r.json()).mfa.required).toBe(true);
  expect(mock.listFactors).not.toHaveBeenCalled();
});
test("email OTP is validated by Auth and creates HttpOnly cookies without trusting a supplied role", async () => {
  const body = {
    email: "client@example.test",
    token: "123456",
    purpose: "email",
  };
  expect(
    (await request("/auth/verify-email", "POST", { ...body, role: "admin" }))
      .status,
  ).toBe(400);
  const r = await request("/auth/verify-email", "POST", body);
  expect(r.status).toBe(200);
  expect(mock.otp).toHaveBeenCalledWith({
    email: body.email,
    token: body.token,
    type: "email",
  });
  expect(await r.text()).not.toContain("opaque-test-token");
  expect(r.headers.get("set-cookie") || "").not.toContain(
    "pit-client-recovery=",
  );
});
test("a wrong email OTP cannot grant recovery permission", async () => {
  mock.otp.mockResolvedValue({
    data: { user: null, session: null },
    error: { status: 400 },
  });
  const r = await request("/auth/verify-email", "POST", {
    email: "client@example.test",
    token: "000000",
    purpose: "recovery",
  });
  expect(r.status).toBe(401);
  expect(r.headers.get("set-cookie") || "").not.toContain("recovery=");
});
test("recovery OTP requests the recovery type and grants only a short-lived signed permission", async () => {
  const r = await request("/auth/verify-email", "POST", {
    email: "client@example.test",
    token: "123456",
    purpose: "recovery",
  });
  expect(r.status).toBe(200);
  expect(mock.otp).toHaveBeenCalledWith(
    expect.objectContaining({ type: "recovery" }),
  );
  expect(r.headers.get("set-cookie")).toContain("pit-client-recovery=");
  expect(r.headers.get("set-cookie")).toContain("Max-Age=600");
});
test("resend requires CAPTCHA when configured and conceals account existence", async () => {
  const changes = { TURNSTILE_SITE_KEY: "configured-sitekey" };
  expect(
    (
      await request(
        "/auth/resend",
        "POST",
        { email: "client@example.test" },
        changes,
      )
    ).status,
  ).toBe(400);
  expect(mock.resend).not.toHaveBeenCalled();
  const r = await request(
    "/auth/resend",
    "POST",
    { email: "client@example.test", captchaToken: "valid-token" },
    changes,
  );
  expect(r.status).toBe(202);
  expect(mock.resend).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "signup",
      options: {
        emailRedirectTo: env.APP_ORIGIN + "/api/auth/callback",
        captchaToken: "valid-token",
      },
    }),
  );
});

test("password changes reject absent reauthentication and a forged recovery cookie", async () => {
  for (const Cookie of [
    "",
    "pit-client-recovery=forged",
    "pit-admin-recovery=forged",
  ]) {
    expect(
      (
        await request(
          "/auth/password",
          "POST",
          { password: "new-strong-test-password" },
          {},
          { Cookie },
        )
      ).status,
    ).toBe(400);
  }
  expect(mock.updateUser).not.toHaveBeenCalled();
});
test("an incorrect current password cannot change credentials or invalidate other sessions", async () => {
  mock.verifyPassword.mockResolvedValue({ error: { status: 400 } });
  const r = await request("/auth/password", "POST", {
    password: "new-strong-test-password",
    currentPassword: "wrong-password",
  });
  expect(r.status).toBe(401);
  expect(mock.updateUser).not.toHaveBeenCalled();
  expect(mock.signOut).not.toHaveBeenCalled();
});
test("a verified password change invalidates all previous sessions", async () => {
  const r = await request("/auth/password", "POST", {
    password: "new-strong-test-password",
    currentPassword: "old-strong-test-password",
  });
  expect(r.status).toBe(200);
  expect(mock.updateUser).toHaveBeenCalledWith({
    password: "new-strong-test-password",
  });
  expect(mock.verifierSignOut).toHaveBeenCalledWith({ scope: "local" });
  expect(mock.signOut).toHaveBeenCalledWith({ scope: "global" });
});
test("recovery signed by this portal permits a reset and clears its temporary permission", async () => {
  const callback = await request("/auth/recovery?code=verified-test-code");
  const Cookie = callback.headers
    .getSetCookie()
    .find((c) => c.startsWith("pit-client-recovery="))!
    .split(";")[0];
  const r = await request(
    "/auth/password",
    "POST",
    { password: "new-strong-test-password" },
    {},
    { Cookie },
  );
  expect(r.status).toBe(200);
  expect(mock.verifyPassword).not.toHaveBeenCalled();
  expect(mock.signOut).toHaveBeenCalledWith({ scope: "global" });
  expect(
    r.headers
      .getSetCookie()
      .some(
        (c) => c.startsWith("pit-client-recovery=") && c.includes("Max-Age=0"),
      ),
  ).toBe(true);
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
  expect(mock.factory).not.toHaveBeenCalled();
});

test("the customer entry point cannot become an admin API through environment configuration", async () => {
  mock.role = "admin";
  mock.aal = "aal2";
  expect(
    (await request("/admin/customers", "GET", undefined, { PORTAL: "admin" }))
      .status,
  ).toBe(503);
  expect(mock.factory).not.toHaveBeenCalled();
  expect(mock.rpc).not.toHaveBeenCalled();
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
