import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, getSession, type Config } from "./api";
import { AccessLayout, Login, MFA, PasswordForm } from "./access";
import { ErrorText } from "./ui";
import type { SessionInfo } from "./contracts";
export function AuthRoot({
  children,
  portal,
}: {
  portal: "customer" | "admin";
  children: (
    s: SessionInfo,
    update: (s: SessionInfo) => void,
    logout: () => Promise<void>,
    config: Config,
  ) => ReactNode;
}) {
  // A delayed read must never replace a newer update or a completed logout.
  const revision = useRef(0);
  const [session, setSession] = useState<SessionInfo | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [hash, setHash] = useState(location.hash),
    [stale, setStale] = useState(false);
  const update = (s: SessionInfo) => {
    revision.current++;
    setSession(s);
    setStale(false);
    setError("");
  };
  async function load() {
    const requestRevision = ++revision.current;
    setLoading(true);
    setError("");
    try {
      const [c, s] = await Promise.all([api<Config>("/config"), getSession()]);
      if (requestRevision !== revision.current) return;
      if (c.portal !== portal || (s && s.role !== portal))
        throw new Error("La sesión no corresponde a este portal.");
      setStale(false);
      setConfig(c);
      setSession(s);
    } catch (e) {
      if (requestRevision === revision.current) setError((e as Error).message);
    } finally {
      if (requestRevision === revision.current) setLoading(false);
    }
  }
  async function logout() {
    revision.current++;
    await api("/auth/logout", "POST", {});
    revision.current++;
    setSession(null);
    location.hash = "login";
  }
  useEffect(() => {
    load();
    const changed = () => setHash(location.hash);
    window.addEventListener("hashchange", changed);
    return () => {
      revision.current++;
      window.removeEventListener("hashchange", changed);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const refresh = async () => {
      if (
        document.hidden ||
        document.querySelector("dialog[open]") ||
        document.activeElement?.matches("input,textarea,select")
      )
        return;
      const requestRevision = ++revision.current;
      try {
        const next = await getSession();
        if (!active || requestRevision !== revision.current) return;
        if (next && next.role !== portal) return;
        setStale(false);
        setSession((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
      } catch {
        if (active && requestRevision === revision.current) setStale(true);
      }
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [session?.user.id]);
  useEffect(() => {
    document.body.classList.toggle(
      "auth-locked",
      !session || session.mfa.required,
    );
  }, [session]);
  if (loading)
    return (
      <AccessLayout admin={portal === "admin"}>
        <h1>
          {portal === "admin"
            ? "Abriendo administración…"
            : "Abriendo tu club…"}
        </h1>
        <p role="status">Conectando con tu cuenta.</p>
      </AccessLayout>
    );
  if (error)
    return (
      <AccessLayout admin={portal === "admin"}>
        <h1>No se pudo abrir el club.</h1>
        <ErrorText error={error} />
        <button className="button primary" onClick={load}>
          Volver a intentar
        </button>
      </AccessLayout>
    );
  if (!session) return <Login config={config!} onSession={update} />;
  if (session.mfa.required)
    return (
      <AccessLayout admin={config?.portal === "admin"}>
        <MFA session={session} onSession={update} />
        <button
          className="text-button auth-back"
          onClick={() => logout().catch((e) => setError(e.message))}
        >
          Cerrar sesión
        </button>
      </AccessLayout>
    );
  if (hash === "#new-password")
    return (
      <AccessLayout admin={portal === "admin"}>
        <PasswordForm
          recovery
          captchaSiteKey={config?.captchaSiteKey}
          onDone={() => {
            revision.current++;
            setSession(null);
            location.hash = "login";
          }}
        />
      </AccessLayout>
    );
  return (
    <>
      {stale && (
        <p className="refresh-warning" role="status">
          No se pudo actualizar. El saldo mostrado puede estar desactualizado.
        </p>
      )}
      {children(session, update, logout, config!)}
    </>
  );
}
