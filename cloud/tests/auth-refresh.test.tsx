// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { AuthRoot } from "../shared/AuthRoot";
import type { SessionInfo } from "../shared/contracts";

const mocks = vi.hoisted(() => ({ api: vi.fn(), getSession: vi.fn() }));
vi.mock("../shared/api", async (original) => ({
  ...(await original<typeof import("../shared/api")>()),
  ...mocks,
}));
const session = (name: string): SessionInfo => ({
  user: { id: "customer-fixture", name, email: "client@example.test" },
  role: "customer",
  mfa: { required: false, enrolled: false, currentLevel: "aal1", factors: [] },
  member: null,
});
function deferred() {
  let resolve!: (s: SessionInfo | null) => void;
  const promise = new Promise<SessionInfo | null>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  location.hash = "";
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  mocks.api.mockResolvedValue({
    portal: "customer",
    emailEnabled: true,
    googleEnabled: true,
    captchaSiteKey: null,
  });
  mocks.getSession.mockResolvedValue(session("Anterior"));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function open() {
  render(
    <AuthRoot portal="customer">
      {(s, update, logout) => (
        <>
          <output>{s.user.name}</output>
          <button onClick={() => update(session("Actualizado"))}>
            Guardar cambio
          </button>
          <button onClick={logout}>Salir</button>
        </>
      )}
    </AuthRoot>,
  );
  await screen.findByText("Anterior");
}
test("a slow background response cannot overwrite a completed customer update", async () => {
  await open();
  const slow = deferred();
  mocks.getSession.mockReturnValueOnce(slow.promise);
  fireEvent.focus(window);
  fireEvent.click(screen.getByText("Guardar cambio"));
  await act(async () => slow.resolve(session("Anterior")));
  expect(screen.getByRole("status").textContent).toBe("Actualizado");
});
test("a pending refresh cannot reopen the customer UI after logout", async () => {
  await open();
  const slow = deferred();
  mocks.getSession.mockReturnValueOnce(slow.promise);
  fireEvent.focus(window);
  fireEvent.click(screen.getByText("Salir"));
  await screen.findByLabelText("Correo electrónico");
  await act(async () => slow.resolve(session("Anterior")));
  expect(screen.queryByText("Anterior")).toBeNull();
  expect(screen.getByLabelText("Correo electrónico")).toBeTruthy();
});
test("overlapping background responses preserve the newest request", async () => {
  await open();
  const older = deferred(),
    newer = deferred();
  mocks.getSession
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise);
  fireEvent.focus(window);
  fireEvent.focus(window);
  await act(async () => newer.resolve(session("Actualizado")));
  await act(async () => older.resolve(session("Anterior")));
  expect(screen.getByRole("status").textContent).toBe("Actualizado");
});
test("an expired background session returns to login", async () => {
  await open();
  mocks.getSession.mockResolvedValueOnce(null);
  fireEvent.focus(window);
  await screen.findByLabelText("Correo electrónico");
  expect(screen.queryByText("Anterior")).toBeNull();
});

test("a failed refresh warns about stale balances until a subsequent read succeeds", async () => {
  await open();
  mocks.getSession.mockRejectedValueOnce(new Error("offline"));
  fireEvent.focus(window);
  await screen.findByText(/saldo mostrado puede estar desactualizado/);
  expect(screen.getByText("Anterior")).toBeTruthy();
  mocks.getSession.mockResolvedValueOnce(session("Actualizado"));
  fireEvent(window, new Event("online"));
  await screen.findByText("Actualizado");
  expect(
    screen.queryByText(/saldo mostrado puede estar desactualizado/),
  ).toBeNull();
});
