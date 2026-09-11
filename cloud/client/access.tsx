import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SessionInfo } from "../shared/contracts";
import { api, type Config } from "./api";
import { Brand, ErrorText, QR } from "./ui";
import { Icon } from "./icons";
export function AccessLayout({
  children,
  admin = false,
}: {
  children: React.ReactNode;
  admin?: boolean;
}) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand-panel">
        <Brand />
        <div>
          <h2>
            {admin ? "El cuidado empieza aquí." : "Tu primer servicio."}
            <br />
            {admin ? "PIT DETAIL Negocio." : "El comienzo de algo bueno."}
          </h2>
          <p>
            {admin
              ? "Acceso exclusivo del equipo de administración."
              : "Autos, motos y embarcaciones. Entra al club para descubrir tus puntos y beneficios."}
          </p>
          <span className="racing-stripes">
            <i />
            <i />
            <i />
          </span>
        </div>
      </aside>
      <main className="auth-form-panel">
        <div className="auth-content">{children}</div>
      </main>
    </div>
  );
}
function Captcha({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | undefined,
      disposed = false;
    const render = () => {
      const sdk = (window as any).turnstile;
      if (disposed || !sdk || !ref.current) return;
      id = sdk.render(ref.current, {
        sitekey: siteKey,
        callback: onToken,
        "expired-callback": () => onToken(""),
      });
    };
    let script = document.querySelector<HTMLScriptElement>("#turnstile-sdk");
    if (!script) {
      script = document.createElement("script");
      script.id = "turnstile-sdk";
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      document.head.append(script);
    }
    if ((window as any).turnstile) render();
    else script.addEventListener("load", render);
    return () => {
      disposed = true;
      script?.removeEventListener("load", render);
      if (id) (window as any).turnstile?.remove(id);
    };
  }, [siteKey, onToken]);
  return <div ref={ref} className="captcha" />;
}
export function Login({
  config,
  onSession,
}: {
  config: Config;
  onSession: (s: SessionInfo) => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      new URLSearchParams(location.search).has("auth")
        ? "No se pudo completar el acceso. Reintenta desde este navegador."
        : "",
    ),
    [notice, setNotice] = useState(""),
    [captchaToken, setCaptchaToken] = useState("");
  const admin = config.portal === "admin";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "login") {
        onSession(
          await api<SessionInfo>("/auth/login", "POST", {
            email: data.get("email"),
            password: data.get("password"),
            ...(captchaToken ? { captchaToken } : {}),
          }),
        );
      } else {
        const body =
          mode === "register"
            ? {
                email: data.get("email"),
                password: data.get("password"),
                name: data.get("name"),
                marketing: data.has("marketing"),
                ...(captchaToken ? { captchaToken } : {}),
              }
            : {
                email: data.get("email"),
                ...(captchaToken ? { captchaToken } : {}),
              };
        const result = await api<{ message: string }>(
          `/auth/${mode === "register" ? "register" : "forgot"}`,
          "POST",
          body,
        );
        setNotice(result.message);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    try {
      const { url } = await api<{ url: string }>("/auth/google", "POST", {});
      const target = new URL(url);
      if (
        target.protocol !== "https:" &&
        !["localhost", "127.0.0.1"].includes(target.hostname)
      )
        throw new Error("Enlace de acceso no válido.");
      location.assign(target.href);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <AccessLayout admin={admin}>
      <div className="eyebrow">
        PIT DETAIL · {admin ? "ADMINISTRACIÓN" : "CLUB"}
      </div>
      <h1>
        {mode === "forgot"
          ? "Recupera tu acceso."
          : mode === "register"
            ? "Bienvenido al club."
            : "Tu próxima parada."}
      </h1>
      <p className="auth-subtitle">
        {admin
          ? "Inicia sesión con tu cuenta de administrador."
          : "Inicia sesión o regístrate para ver tu tarjeta y tus beneficios."}
      </p>
      {config.googleEnabled && mode === "login" && (
        <button
          className="button secondary full google-login"
          disabled={busy}
          onClick={google}
        >
          Continuar con Google <Icon name="arrow" />
        </button>
      )}
      {config.emailEnabled ? (
        <>
          {!admin && (
            <div className="auth-tabs">
              <button
                className={`auth-tab ${mode === "login" ? "selected" : ""}`}
                onClick={() => {
                  setMode("login");
                  setError("");
                  setNotice("");
                }}
              >
                Iniciar sesión
              </button>
              <button
                className={`auth-tab ${mode === "register" ? "selected" : ""}`}
                onClick={() => {
                  setMode("register");
                  setError("");
                  setNotice("");
                }}
              >
                Registrarse
              </button>
            </div>
          )}
          <form onSubmit={submit}>
            {mode === "register" && (
              <label>
                Nombre
                <input
                  name="name"
                  minLength={2}
                  maxLength={70}
                  required
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Correo electrónico
              <input
                name="email"
                type="email"
                required
                maxLength={120}
                autoComplete="username"
              />
            </label>
            {mode !== "forgot" && (
              <label>
                Contraseña
                <input
                  name="password"
                  type="password"
                  minLength={mode === "register" ? 12 : undefined}
                  maxLength={128}
                  required
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                />
              </label>
            )}
            {mode === "register" && (
              <label className="checkbox-label">
                <input name="marketing" type="checkbox" />
                <span>
                  Quiero recibir novedades y ofertas del club (opcional).
                </span>
              </label>
            )}
            {config.captchaSiteKey && (
              <Captcha
                siteKey={config.captchaSiteKey}
                onToken={setCaptchaToken}
              />
            )}
            <button
              className="button primary full"
              type="submit"
              disabled={busy}
            >
              {busy
                ? "Un momento…"
                : mode === "register"
                  ? "Crear cuenta"
                  : mode === "forgot"
                    ? "Enviar enlace"
                    : "Continuar"}{" "}
              <Icon name="arrow" />
            </button>
          </form>
          <button
            className="text-button auth-back"
            onClick={() => {
              setMode(mode === "forgot" ? "login" : "forgot");
              setError("");
              setNotice("");
            }}
          >
            {mode === "forgot"
              ? "Volver al acceso"
              : "He olvidado mi contraseña"}
          </button>
        </>
      ) : (
        !config.googleEnabled && (
          <p className="auth-message">
            Estamos preparando el acceso al club. Vuelve a intentarlo más tarde.
          </p>
        )
      )}
      {notice && (
        <p role="status" className="auth-message">
          {notice}
        </p>
      )}
      <ErrorText error={error} />
      <p className="auth-note">
        {!admin && (
          <>
            Recibe 2.000 puntos de bienvenida al crear tu cuenta, una sola
            vez.{" "}
          </>
        )}
        Cada $1 en servicios elegibles suma 1.000 puntos. El negocio registra
        tus servicios y confirma los canjes.
      </p>
    </AccessLayout>
  );
}
export function MFA({
  session,
  onSession,
  onCancel,
}: {
  session: SessionInfo;
  onSession: (s: SessionInfo) => void;
  onCancel?: () => void;
}) {
  const [factorId, setFactorId] = useState(session.mfa.factors[0]?.id || ""),
    [enrollment, setEnrollment] = useState<{
      factorId: string;
      secret: string;
      uri: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function enroll() {
    setBusy(true);
    setError("");
    try {
      const e = await api<{ factorId: string; secret: string; uri: string }>(
        "/mfa/enroll",
        "POST",
        {},
      );
      setEnrollment(e);
      setFactorId(e.factorId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const code = new FormData(e.currentTarget).get("code");
    setBusy(true);
    setError("");
    try {
      onSession(
        await api<SessionInfo>("/mfa/verify", "POST", { factorId, code }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mfa-panel">
      <div className="eyebrow">VERIFICACIÓN EN DOS PASOS</div>
      <h1>
        {session.mfa.enrolled && !enrollment
          ? "Confirma que eres tú."
          : "Protege tu cuenta."}
      </h1>
      <p className="auth-subtitle">
        Usa el código de tu aplicación autenticadora.
      </p>
      {enrollment && (
        <>
          <div className="qr-frame">
            <QR value={enrollment.uri} />
          </div>
          <p className="small-note">
            Si usas un único móvil, añade esta clave manualmente en tu
            autenticador. Guárdala en un lugar seguro.
          </p>
          <label>
            Clave del autenticador
            <input
              value={enrollment.secret}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              autoComplete="off"
            />
          </label>
        </>
      )}
      {!factorId ? (
        <button
          className="button primary full"
          onClick={enroll}
          disabled={busy}
        >
          Configurar autenticador
        </button>
      ) : (
        <form onSubmit={verify}>
          {session.mfa.factors.length > 1 && !enrollment && (
            <label>
              Autenticador
              <select
                value={factorId}
                onChange={(e) => setFactorId(e.target.value)}
              >
                {session.mfa.factors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.friendly_name || "Autenticador"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Código del autenticador
            <input
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
          </label>
          <button className="button primary full" disabled={busy}>
            {busy ? "Verificando…" : "Verificar código"}
          </button>
        </form>
      )}
      <ErrorText error={error} />
      <p className="small-note">
        Si pierdes tu autenticador, contacta con el negocio para recuperar el
        acceso mediante una comprobación de identidad.
      </p>
      {onCancel && (
        <button className="text-button auth-back" onClick={onCancel}>
          Volver
        </button>
      )}
    </section>
  );
}
export function PasswordForm({
  onDone,
  recovery = false,
}: {
  onDone: () => void;
  recovery?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    if (data.get("password") !== data.get("confirm")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/auth/password", "POST", {
        password: data.get("password"),
        ...(!recovery ? { currentPassword: data.get("currentPassword") } : {}),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form-card">
      <h2>{recovery ? "Elige una nueva contraseña" : "Cambiar contraseña"}</h2>
      <form onSubmit={submit}>
        {!recovery && (
          <label>
            Contraseña actual
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
        )}
        <label>
          Nueva contraseña
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <label>
          Repite la nueva contraseña
          <input
            name="confirm"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <button className="button primary" disabled={busy}>
          Guardar y cerrar sesiones
        </button>
      </form>
      <ErrorText error={error} />
    </section>
  );
}
