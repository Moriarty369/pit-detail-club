// @vitest-environment jsdom
import { afterEach, test, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { Login } from "../client/access";
import { Heading } from "../client/ui";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test("API failures keep the login form usable and never enter the account", async () => {
  const onSession = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
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
