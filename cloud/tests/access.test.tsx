// @vitest-environment jsdom
import { afterEach, test, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { Login } from "../shared/access";
import { Heading } from "../shared/ui";
afterEach(() => {
  cleanup();
  location.hash = "";
  document.querySelector("#turnstile-sdk")?.remove();
  delete (window as any).turnstile;
  vi.unstubAllGlobals();
});
test("API failures keep the login form usable and never enter the account", async () => {
  const onSession = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Servidor no disponible." }),
    }),
  );
  render(
    <Login
      config={{
        portal: "customer",
        emailEnabled: true,
        googleEnabled: false,
        captchaSiteKey: null,
      }}
      onSession={onSession}
    />,
  );
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "client@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "long-password-2026" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Continuar" }).closest("form")!,
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Servidor no disponible",
    ),
  );
  expect(onSession).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
test("customer names are escaped as text, never interpreted as markup", () => {
  const { container } = render(
    <Heading eyebrow="CLUB" title={"<img src=x onerror=alert(1)>"} />,
  );
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByRole("heading").textContent).toContain("<img");
});
test("Google-only access remains usable when the provider cannot start", async () => {
  const onSession = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "No se pudo iniciar Google." }),
    }),
  );
  render(
    <Login
      config={{
        portal: "customer",
        emailEnabled: false,
        googleEnabled: true,
        captchaSiteKey: null,
      }}
      onSession={onSession}
    />,
  );
  expect(screen.queryByLabelText("Contraseña")).toBeNull();
  const button = screen.getByRole("button", { name: /Continuar con Google/ });
  fireEvent.click(button);
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "No se pudo iniciar Google",
    ),
  );
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(onSession).not.toHaveBeenCalled();
});
test.each(["client@icloud.com", "client@outlook.com"])(
  "email registration accepts %s alongside Google and waits for confirmation",
  async (email) => {
    const onSession = vi.fn();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        message: "Revisa tu correo para confirmar el registro.",
      }),
    });
    vi.stubGlobal("fetch", fetch);
    render(
      <Login
        config={{
          portal: "customer",
          emailEnabled: true,
          googleEnabled: true,
          captchaSiteKey: null,
        }}
        onSession={onSession}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Continuar con Google/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Registrarse" }));
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Cliente PIT" },
    });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: email },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "Long-test-password-2026!" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Crear cuenta" }).closest("form")!,
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("confirmar"),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email,
          password: "Long-test-password-2026!",
          name: "Cliente PIT",
          marketing: false,
        }),
      }),
    );
    expect(onSession).not.toHaveBeenCalled();
  },
);

test("CAPTCHA blocks submissions until solved and renews after a failed login", async () => {
  let challenge: any;
  (window as any).turnstile = {
    render: vi.fn((_el, options) => {
      challenge = options;
      return "widget";
    }),
    remove: vi.fn(),
  };
  const fetch = vi
    .fn()
    .mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Revisa tus datos." }),
    });
  vi.stubGlobal("fetch", fetch);
  render(
    <Login
      config={{
        portal: "customer",
        emailEnabled: true,
        googleEnabled: false,
        captchaSiteKey: "test-key",
      }}
      onSession={vi.fn()}
    />,
  );
  const button = screen.getByRole("button", {
    name: "Continuar",
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.submit(button.closest("form")!);
  expect(fetch).not.toHaveBeenCalled();
  await import("@testing-library/react").then(({ act }) =>
    act(() => challenge.callback("first-token")),
  );
  expect(button.disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "client@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "test-password-long" },
  });
  fireEvent.submit(button.closest("form")!);
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Revisa tus datos"),
  );
  expect(button.disabled).toBe(true);
  expect((window as any).turnstile.render).toHaveBeenCalledTimes(2);
  await import("@testing-library/react").then(({ act }) =>
    act(() => challenge.callback("renewed-token")),
  );
  fireEvent.click(screen.getByRole("button", { name: "Registrarse" }));
  expect(
    (screen.getByRole("button", { name: "Crear cuenta" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test.each(["email", "recovery"])(
  "a code opened in another browser verifies its %s purpose before entering",
  async (purpose) => {
    location.hash = purpose === "recovery" ? "#recover-code" : "#confirm-email";
    const session = {
      user: { id: "test" },
      role: "customer",
      mfa: { required: false },
    };
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => session });
    const onSession = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(
      <Login
        config={{
          portal: "customer",
          emailEnabled: true,
          googleEnabled: true,
          captchaSiteKey: "test-key",
        }}
        onSession={onSession}
      />,
    );
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "client@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Código recibido por correo"), {
      target: { value: "123456" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Confirmar código" }).closest("form")!,
    );
    await waitFor(() => expect(onSession).toHaveBeenCalledWith(session));
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/verify-email",
      expect.objectContaining({
        body: JSON.stringify({
          email: "client@example.test",
          token: "123456",
          purpose,
        }),
      }),
    );
    expect(location.hash).toBe(
      purpose === "recovery" ? "#new-password" : "#home",
    );
  },
);
