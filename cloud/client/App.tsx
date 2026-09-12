import { useEffect, useState, type FormEvent } from "react";
import { api, getSession, ApiError, type Config } from "../shared/api";
import { AccessLayout, MFA, PasswordForm } from "../shared/access";
import {
  Brand,
  Stripes,
  Heading,
  Modal,
  QR,
  ErrorText,
  number,
  money,
  date,
} from "../shared/ui";
import { Icon } from "../shared/icons";
import {
  offers,
  canRequest,
  type Member,
  type SessionInfo,
} from "../shared/contracts";
import { AuthRoot } from "../shared/AuthRoot";
import {
  memberActivity,
  WelcomeActivity,
  type MemberActivity,
} from "../shared/activity";
import { usePointsFeedback } from "./points-feedback";
import { PointsReceipt } from "./PointsReceipt";
const views = [
  ["home", "Mi club", "home"],
  ["rewards", "Beneficios", "gift"],
  ["history", "Mi actividad", "clock"],
  ["profile", "Mi perfil", "user"],
] as const;
type View = (typeof views)[number][0];
export default function App() {
  return (
    <AuthRoot portal="customer">
      {(session, update, logout, config) =>
        session.member ? (
          <Customer
            session={session}
            update={update}
            logout={logout}
            config={config}
          />
        ) : (
          <AccessLayout>
            <h1>Tu cuenta necesita atención.</h1>
            <p>Vuelve a entrar para cargar tus datos.</p>
            <button
              className="button primary"
              onClick={() => logout().catch(() => location.reload())}
            >
              Cerrar sesión
            </button>
          </AccessLayout>
        )
      }
    </AuthRoot>
  );
}
function Customer({
  session,
  update,
  logout,
  config,
}: {
  session: SessionInfo;
  update: (s: SessionInfo) => void;
  logout: () => Promise<void>;
  config: Config;
}) {
  const [view, setView] = useState<View>("home"),
    [dialog, setDialog] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const member = session.member!;
  const pointsFeedback = usePointsFeedback(member);
  useEffect(() => {
    const change = () => {
      const next = location.hash.slice(1);
      setView(views.some((v) => v[0] === next) ? (next as View) : "home");
    };
    change();
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  function navigate(next: View) {
    setView(next);
    location.hash = next;
    setError("");
    window.scrollTo(0, 0);
  }
  function save(next: Member) {
    update({ ...session, member: next });
  }
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 401) {
        await logout().catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }
  async function request(offerId: string) {
    await action(async () => {
      const r = await api<{ member: Member; rewardId: string }>(
        "/me/rewards",
        "POST",
        { offerId },
      );
      save(r.member);
      setDialog("code:" + r.rewardId);
    });
  }
  return (
    <>
      <aside className="sidebar">
        <a className="brand-home" href="#home" aria-label="PIT DETAIL inicio">
          <Brand />
          <span className="brand-club">CLUB DE BENEFICIOS</span>
        </a>
        <div className="sidebar-label">CUIDAMOS LO QUE TE MUEVE</div>
        <nav aria-label="Navegación principal">
          {views.map(([id, label, glyph]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon name={glyph} />
              <span>{label}</span>
              {view === id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-brand">
            <span className="racing-stripes">
              <i />
              <i />
              <i />
            </span>
            <p>
              Más cuidado.
              <br />
              <strong>Más caminos juntos.</strong>
            </p>
          </div>
          <div className="demo-label">
            <span />
            Tu cuenta personal
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <a
            className="mobile-brand"
            href="#home"
            aria-label="PIT DETAIL inicio"
          >
            <Brand />
            <span>CLUB</span>
          </a>
          <div className="breadcrumb">
            PIT DETAIL <span>/</span> Tu espacio
          </div>
          <div className="topbar-right">
            <span className="location">
              <Icon name="pin" /> Venezuela
            </span>
            <button
              className="avatar-button"
              onClick={() => navigate("profile")}
              aria-label="Ver mi perfil"
            >
              <span className="avatar">
                {member.customer.name
                  .split(" ")
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>{member.customer.name.split(" ")[0]}</span>
            </button>
          </div>
        </header>
        <main id="main">
          <ErrorText error={dialog ? "" : error} />
          <p
            className="points-announcement"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {pointsFeedback.receipt &&
              `Has recibido ${number(pointsFeedback.receipt.points)} puntos ${pointsFeedback.receipt.kind === "welcome" ? "de bienvenida" : "por tus servicios"}. Saldo actual: ${number(member.points)} puntos.`}
          </p>
          {pointsFeedback.receipt && (
            <PointsReceipt
              receipt={pointsFeedback.receipt}
              name={member.customer.name.split(" ")[0]}
              dismiss={pointsFeedback.dismiss}
              showActivity={() => navigate("history")}
            />
          )}
          {view === "home" ? (
            <Home
              member={member}
              navigate={navigate}
              show={setDialog}
              displayedPoints={pointsFeedback.displayed}
              refreshing={busy}
              refresh={() => action(async () => save(await api<Member>("/me")))}
            />
          ) : view === "rewards" ? (
            <Rewards member={member} show={setDialog} />
          ) : view === "history" ? (
            <History member={member} />
          ) : (
            <Profile
              member={member}
              save={save}
              onSecurity={() => setDialog("security")}
              onLogout={() => action(logout)}
              onPassword={() => setDialog("password")}
              emailEnabled={config.emailEnabled}
              notify={setNotice}
            />
          )}
        </main>
        <footer>
          <span>
            © {new Date().getFullYear()} PIT DETAIL · Hecho para cuidar lo que
            te mueve.
          </span>
        </footer>
      </div>
      {notice && (
        <div className="cloud-toast" role="status">
          {notice}
        </div>
      )}
      {dialog && (
        <Modal
          onClose={() => {
            setDialog(null);
            setError("");
          }}
        >
          {dialog === "card" ? (
            <>
              <Brand className="modal-brand" />
              <h2 id="modal-title">Tu tarjeta, siempre contigo.</h2>
              <p>Muestra tu identificador al registrar un servicio.</p>
              <div className="qr-frame">
                <QR value={"PIT-CUSTOMER:" + member.customer.id} />
              </div>
              <strong className="card-name">{member.customer.name}</strong>
              <span className="member-id">{member.customer.id}</span>
              <p className="small-note">
                Este QR identifica tu cuenta. No permite iniciar sesión ni
                autorizar canjes.
              </p>
            </>
          ) : dialog === "security" ? (
            <>
              <h2 id="modal-title">Seguridad de tu cuenta</h2>
              {session.mfa.enrolled ? (
                <>
                  <p>Tu verificación en dos pasos está activa.</p>
                  <button
                    className="button secondary full"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await api("/mfa/remove", "POST", {
                          factorId: session.mfa.factors[0].id,
                        });
                        const s = await getSession();
                        if (s) update(s);
                        setDialog(null);
                        setNotice("Autenticador retirado.");
                      })
                    }
                  >
                    Desactivar autenticador
                  </button>
                </>
              ) : (
                <MFA
                  session={session}
                  onSession={(s) => {
                    update(s);
                    setDialog(null);
                    setNotice("Verificación en dos pasos activada.");
                  }}
                />
              )}
            </>
          ) : dialog === "password" ? (
            <>
              <h2 id="modal-title">Seguridad de acceso</h2>
              <PasswordForm
                captchaSiteKey={config.captchaSiteKey}
                onDone={() => {
                  setDialog(null);
                  logout().catch(() => location.reload());
                }}
              />
            </>
          ) : dialog === "rappel" ? (
            <RappelDetail
              member={member}
              busy={busy}
              request={() => request("rappel")}
            />
          ) : dialog.startsWith("code:") ? (
            <RewardCode
              member={member}
              id={dialog.slice(5)}
              busy={busy}
              refresh={() => action(async () => save(await api<Member>("/me")))}
            />
          ) : (
            <OfferDetail
              member={member}
              id={dialog}
              busy={busy}
              request={() => request(dialog)}
            />
          )}
          <ErrorText error={error} />
        </Modal>
      )}
    </>
  );
}
function FleetTypes() {
  return (
    <div className="vehicle-types">
      <span>
        <Icon name="car" />
        Autos
      </span>
      <span>
        <Icon name="moto" />
        Motos
      </span>
      <span>
        <Icon name="boat" />
        Embarcaciones
      </span>
    </div>
  );
}
function Home({
  member: m,
  navigate,
  show,
  displayedPoints,
  refresh,
  refreshing,
}: {
  member: Member;
  navigate: (v: View) => void;
  show: (id: string) => void;
  displayedPoints: number;
  refresh: () => void;
  refreshing: boolean;
}) {
  const wash = offers[0];
  const recent = memberActivity(m).slice(0, 3);
  return (
    <>
      <Heading
        eyebrow="BIENVENIDO A PIT DETAIL CLUB"
        title={
          <>
            Hola, {m.customer.name.split(" ")[0]}
            <span className="greeting-dot">.</span>
          </>
        }
        subtitle="Tu vehículo en buenas manos. Tu fidelidad, recompensada."
        action={
          <button className="button secondary" onClick={() => show("card")}>
            <Icon name="qr" /> Mi tarjeta
          </button>
        }
      />
      <section className="overview">
        <div className="loyalty-card">
          <div className="card-top">
            <div className="card-brand">
              <Stripes />
              <span>
                CLUB
                <br />
                DE BENEFICIOS
              </span>
            </div>
            <span className="member-pill">MIEMBRO</span>
          </div>
          <div className="points-heading">
            <div className="points-label">TU SALDO DE PUNTOS</div>
            <button
              className="points-refresh"
              disabled={refreshing}
              onClick={refresh}
              aria-label="Actualizar saldo"
            >
              <Icon name="clock" />{" "}
              {refreshing ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
          <div
            className="points-value"
            aria-label={`Saldo: ${number(m.points)} puntos`}
          >
            <span className="points-digits" aria-hidden="true">
              {number(displayedPoints)}
            </span>
            <span aria-hidden="true">pts</span>
          </div>
          <div className="card-progress">
            <div className="progress light">
              <span
                style={{
                  width:
                    Math.min(100, (displayedPoints / wash.cost) * 100) + "%",
                }}
              />
            </div>
            <p>
              {m.points >= wash.cost
                ? "Tu próximo lavado exterior ya está a tu alcance."
                : `A ${number(wash.cost - m.points)} puntos de un lavado exterior de cortesía.`}
            </p>
          </div>
          <div className="card-bottom">
            <div>
              <strong>{m.customer.name}</strong>
              <span>MIEMBRO PIT DETAIL</span>
            </div>
            <button
              className="qr-button"
              aria-label="Ampliar QR de mi tarjeta"
              onClick={() => show("card")}
            >
              <QR value={"PIT-CUSTOMER:" + m.customer.id} size={66} />
            </button>
          </div>
          <span className="card-watermark" aria-hidden="true">
            P
          </span>
        </div>
        <div className="overview-right">
          <div className="stat-grid">
            <article className="stat-card">
              <span className="small-icon">
                <Icon name="car" />
              </span>
              <span className="stat-number">
                {m.entries
                  .filter((s) => !s.voided)
                  .length.toString()
                  .padStart(2, "0")}
              </span>
              <h2>Servicios contigo</h2>
              <p>Cada visita suma.</p>
            </article>
            <article className="stat-card">
              <span className="small-icon red">
                <Icon name="gift" />
              </span>
              <span className="stat-number">
                {offers
                  .filter((o) => canRequest(m, o.id))
                  .length.toString()
                  .padStart(2, "0")}
              </span>
              <h2>Beneficios disponibles</h2>
              <button
                className="text-button"
                onClick={() => navigate("rewards")}
              >
                Descubrir <Icon name="arrow" />
              </button>
            </article>
          </div>
          <article className="rappel-card">
            <div className="rappel-eyebrow">
              <Icon name="fleet" />
              PARA TI Y TU FLOTA
            </div>
            <div className="rappel-title">
              <div>
                <h2>
                  Más vehículos.
                  <br />
                  Más motivos para volver.
                </h2>
                <p>Rappel · {m.period}</p>
              </div>
              <div className="rappel-rate">
                <strong>
                  {m.rules.rappelPercent}
                  <span>%</span>
                </strong>
                <span>en mano de obra</span>
              </div>
            </div>
            <div className="progress">
              <span
                style={{
                  width:
                    Math.min(
                      100,
                      (m.quarterSpend / m.rules.thresholdCents) * 100,
                    ) + "%",
                }}
              />
            </div>
            <div className="rappel-bottom">
              <span>
                {money(m.quarterSpend)}{" "}
                <span>de {money(m.rules.thresholdCents)}</span>
              </span>
              <button
                className="button rappel-cta"
                onClick={() => show("rappel")}
              >
                Descubrir rappel <Icon name="arrow" />
              </button>
            </div>
          </article>
        </div>
      </section>
      <section className="benefits-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MERECES ESE EXTRA</span>
            <h2>Más que un buen servicio</h2>
          </div>
          <button className="text-button" onClick={() => navigate("rewards")}>
            Todos los beneficios <Icon name="arrow" />
          </button>
        </div>
        <OfferCards member={m} show={show} />
      </section>
      <section className="bottom-grid">
        <div className="recent-panel">
          <div className="section-heading">
            <h2>Tu actividad reciente</h2>
            <button className="text-button" onClick={() => navigate("history")}>
              Ver historial <Icon name="arrow" />
            </button>
          </div>
          {recent.length ? (
            recent.map((item) => <ActivityRow key={item.id} item={item} />)
          ) : (
            <p className="empty-text">
              Tu primer servicio será el comienzo de algo bueno.
            </p>
          )}
        </div>
        <div className="care-note vehicle-note">
          <div>
            <strong>Cuidamos lo que te mueve.</strong>
            <FleetTypes />
            <p>Un mismo club. Distintas formas de moverte.</p>
          </div>
        </div>
      </section>
    </>
  );
}
function OfferCards({
  member,
  show,
}: {
  member: Member;
  show: (id: string) => void;
}) {
  return (
    <div className="offer-grid">
      {offers.map((o) => (
        <article className="offer-card" key={o.id}>
          <div className={`offer-art ${o.id}`}>
            <span className="offer-tag">{o.tag}</span>
            <div className="art-symbol">
              <Icon name={o.icon} />
            </div>
            <span className="art-line" aria-hidden="true" />
            <span className="art-label">{o.value}</span>
          </div>
          <div className="offer-body">
            <h3>{o.title}</h3>
            <p>{o.description}</p>
            <div className="offer-bottom">
              <span className="point-price">
                {number(o.cost)} <small>pts</small>
              </span>
              <button
                className={`button ${canRequest(member, o.id) ? "primary" : "secondary"} small`}
                onClick={() => show(o.id)}
              >
                {canRequest(member, o.id) ? "Canjear" : "Ver beneficio"}{" "}
                <Icon name="arrow" />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
function Rewards({
  member: m,
  show,
}: {
  member: Member;
  show: (id: string) => void;
}) {
  return (
    <>
      <Heading
        eyebrow="CADA VISITA CUENTA"
        title="Beneficios a tu medida."
        subtitle={`Tienes ${number(m.points)} puntos para seguir cuidando tu vehículo.`}
      />
      <div className="notice">
        <Icon name="sparkles" />
        <span>
          Cada $1 en servicios elegibles suma 1.000 puntos. Importes en USD.
        </span>
      </div>
      <OfferCards member={m} show={show} />
      <article className="rappel-wide">
        <div>
          <span className="rappel-eyebrow">
            <Icon name="fleet" />
            PARA TI Y TU FLOTA
          </span>
          <h2>El cuidado de tu flota tiene recompensa.</h2>
          <p>
            Acumula {money(m.rules.thresholdCents)} en servicios en esta cuenta
            durante el trimestre y desbloquea {m.rules.rappelPercent}% en mano
            de obra para tu próximo servicio.
          </p>
        </div>
        <button className="button rappel-cta" onClick={() => show("rappel")}>
          Ver mi progreso <Icon name="arrow" />
        </button>
      </article>
      {m.redemptions.length > 0 && (
        <section className="recent-panel">
          <h2>Mis canjes</h2>
          {[...m.redemptions].reverse().map((r) => (
            <div className="service-row" key={r.id}>
              <span className="service-icon">
                <Icon name="gift" />
              </span>
              <div className="service-info">
                <strong>
                  {offers.find((o) => o.id === r.offerId)?.title ||
                    "Rappel trimestral"}
                </strong>
                <span>
                  {date(r.date)} ·{" "}
                  {r.status === "used"
                    ? "Canje utilizado"
                    : new Date(r.expiresAt) <= new Date()
                      ? "Código caducado"
                      : "Pendiente de validar"}
                </span>
              </div>
              {r.status === "pending" && new Date(r.expiresAt) > new Date() && (
                <button
                  className="text-button"
                  onClick={() => show("code:" + r.id)}
                >
                  Ver código
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
function ServiceRow({ entry: e }: { entry: Member["entries"][number] }) {
  return (
    <div className={`service-row ${e.voided ? "service-voided" : ""}`}>
      <span className="service-icon">
        <Icon
          name={
            /moto/i.test(e.service)
              ? "moto"
              : /embarcaci/i.test(e.service)
                ? "boat"
                : e.service === "Cambio de aceite"
                  ? "oil"
                  : "car"
          }
        />
      </span>
      <div className="service-info">
        <strong>{e.service}</strong>
        <span>
          <time dateTime={e.date}>{date(e.date)}</time> · {e.mode}
          {e.voided ? " · Anulado" : ""}
        </span>
      </div>
      <div className="service-amount">
        <strong>
          {e.voided ? "Anulado" : "+" + number(e.points) + " pts"}
        </strong>
        <span>{money(e.cents)}</span>
      </div>
    </div>
  );
}
function ActivityRow({ item }: { item: MemberActivity }) {
  return item.kind === "welcome" ? (
    <WelcomeActivity points={item.points} date={item.date} />
  ) : (
    <ServiceRow entry={item.entry} />
  );
}
function History({ member }: { member: Member }) {
  const [filter, setFilter] = useState("Todos");
  const entries = memberActivity(member).filter(
    (item) =>
      filter === "Todos" ||
      (filter === "Bienvenida"
        ? item.kind === "welcome"
        : item.kind === "service" && item.entry.mode === filter),
  );
  return (
    <>
      <Heading
        eyebrow="EL CAMINO RECORRIDO"
        title="Tu actividad."
        subtitle="Tu bienvenida y cada servicio, con sus puntos y su fecha."
      />
      <div className="filter-row">
        {["Todos", "En local", "A domicilio", "Bienvenida"].map((f) => (
          <button
            key={f}
            className={`filter ${filter === f ? "selected" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <section className="recent-panel history-list">
        {entries.length ? (
          entries.map((item) => <ActivityRow key={item.id} item={item} />)
        ) : (
          <p className="empty-state">
            Todavía no hay movimientos en esta categoría.
          </p>
        )}
      </section>
    </>
  );
}
function Profile({
  member,
  save,
  onSecurity,
  onLogout,
  onPassword,
  emailEnabled,
  notify,
}: {
  member: Member;
  save: (m: Member) => void;
  onSecurity: () => void;
  onLogout: () => void;
  onPassword: () => void;
  emailEnabled: boolean;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>, vehicle = false) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      save(
        await api<Member>(
          vehicle ? "/me/vehicles" : "/me",
          vehicle ? "POST" : "PATCH",
          vehicle
            ? { kind: data.get("kind"), label: data.get("label") }
            : { name: data.get("name"), marketing: data.has("marketing") },
        ),
      );
      if (vehicle) form.reset();
      notify(vehicle ? "Vehículo añadido." : "Perfil actualizado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="TU ESPACIO PERSONAL"
        title="Vamos contigo."
        subtitle="Mantén tu perfil listo para tu próxima visita."
      />
      <div className="profile-grid">
        <div>
          <section className="form-card">
            <h2>Mi información</h2>
            <form onSubmit={(e) => submit(e)}>
              <label>
                Nombre
                <input
                  name="name"
                  defaultValue={member.customer.name}
                  minLength={2}
                  maxLength={70}
                  required
                />
              </label>
              <label>
                Correo electrónico
                <input type="email" value={member.customer.email} readOnly />
              </label>
              <label className="checkbox-label">
                <input
                  name="marketing"
                  type="checkbox"
                  defaultChecked={member.customer.marketing}
                />
                <span>Quiero recibir novedades y ofertas del club.</span>
              </label>
              <button className="button primary" disabled={busy}>
                Guardar cambios <Icon name="check" />
              </button>
            </form>
          </section>
          <section className="form-card cloud-vehicles">
            <h2>Mis vehículos</h2>
            <p className="muted">
              Autos, motos y embarcaciones en una misma cuenta.
            </p>
            {member.vehicles.map((v) => (
              <div className="service-row" key={v.id}>
                <Icon
                  name={
                    v.kind === "motorcycle"
                      ? "moto"
                      : v.kind === "boat"
                        ? "boat"
                        : "car"
                  }
                />
                <strong>{v.label}</strong>
              </div>
            ))}
            <form onSubmit={(e) => submit(e, true)}>
              <label>
                Tipo
                <select name="kind" aria-label="Tipo de vehículo">
                  <option value="car">Auto</option>
                  <option value="motorcycle">Moto</option>
                  <option value="boat">Embarcación</option>
                </select>
              </label>
              <label>
                Marca y modelo
                <input
                  name="label"
                  placeholder="Ej. Yamaha MT-03"
                  minLength={2}
                  maxLength={100}
                  required
                />
              </label>
              <button className="button secondary" disabled={busy}>
                Añadir vehículo
              </button>
            </form>
          </section>
          <ErrorText error={error} />
        </div>
        <aside className="profile-side">
          <img src="/pit-detail.jpg" alt="Logo PIT DETAIL" />
          <h2>
            Tu próxima parada
            <br />
            empieza aquí.
          </h2>
          <p>
            El negocio registra tus servicios. Tú decides cómo proteger tu
            acceso.
          </p>
          <button className="button primary" onClick={onSecurity}>
            Verificación en dos pasos
          </button>
          {emailEnabled && (
            <button className="button secondary" onClick={onPassword}>
              Cambiar contraseña
            </button>
          )}
          <button className="button secondary" onClick={onLogout}>
            Cerrar sesión <Icon name="arrow" />
          </button>
        </aside>
      </div>
    </>
  );
}
function OfferDetail({
  member,
  id,
  busy,
  request,
}: {
  member: Member;
  id: string;
  busy: boolean;
  request: () => void;
}) {
  const o = offers.find((o) => o.id === id);
  if (!o) return <h2 id="modal-title">Beneficio no encontrado.</h2>;
  return (
    <>
      <span className="modal-symbol">
        <Icon name={o.icon} />
      </span>
      <div className="modal-eyebrow">TU PRÓXIMO BENEFICIO</div>
      <h2 id="modal-title">{o.title}</h2>
      <p>{o.description}</p>
      <div className="reward-price">
        {number(o.cost)} <span>puntos</span>
      </div>
      <div className="terms">
        <strong>Así funciona</strong>
        <p>{o.terms}</p>
        <p>Los puntos se descuentan cuando el personal confirma el canje.</p>
      </div>
      <button
        className="button primary full"
        disabled={busy || !canRequest(member, id)}
        onClick={request}
      >
        {busy
          ? "Generando…"
          : canRequest(member, id)
            ? "Generar código de canje"
            : `Te faltan ${number(o.cost - member.points)} puntos`}
      </button>
    </>
  );
}
function RappelDetail({
  member: m,
  busy,
  request,
}: {
  member: Member;
  busy: boolean;
  request: () => void;
}) {
  const used = m.redemptions.some(
    (r) =>
      r.offerId === "rappel" && r.period === m.period && r.status === "used",
  );
  return (
    <>
      <div className="modal-eyebrow">RAPPEL TRIMESTRAL</div>
      <h2 id="modal-title">Tu constancia mueve más.</h2>
      <div className="reward-price">
        {m.rules.rappelPercent}% <span>en mano de obra</span>
      </div>
      <p>
        Acumula {money(m.rules.thresholdCents)} en servicios elegibles este
        trimestre.
      </p>
      <div className="progress">
        <span
          style={{
            width:
              Math.min(100, (m.quarterSpend / m.rules.thresholdCents) * 100) +
              "%",
          }}
        />
      </div>
      <p>
        {money(m.quarterSpend)} acumulados · {m.period}
      </p>
      <div className="terms">
        <strong>Para ti y los vehículos de tu negocio</strong>
        <p>
          El avance corresponde a esta cuenta. Los saldos de cuentas distintas
          no se combinan.
        </p>
        <p>
          Un canje por trimestre, válido dentro del mismo trimestre. Solo mano
          de obra, sin repuestos ni desplazamiento. No acumulable con puntos u
          otras promociones.
        </p>
      </div>
      <button
        className="button primary full"
        disabled={busy || !canRequest(m, "rappel")}
        onClick={request}
      >
        {used
          ? "Ya utilizaste tu rappel"
          : canRequest(m, "rappel")
            ? "Generar código de rappel"
            : `Te faltan ${money(Math.max(0, m.rules.thresholdCents - m.quarterSpend))}`}
      </button>
    </>
  );
}
function RewardCode({
  member,
  id,
  busy,
  refresh,
}: {
  member: Member;
  id: string;
  busy: boolean;
  refresh: () => Promise<void>;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const r = member.redemptions.find((r) => r.id === id);
  if (!r) return <h2 id="modal-title">Código no encontrado.</h2>;
  const seconds = Math.max(
    0,
    Math.ceil((new Date(r.expiresAt).getTime() - now) / 1000),
  );
  return (
    <>
      <h2 id="modal-title">Tu próximo extra está listo.</h2>
      <p>
        {r.status === "used"
          ? "Tu beneficio ya ha sido validado."
          : "Comparte este código con el personal de PIT DETAIL."}
      </p>
      <div className="redemption-code">{r.code}</div>
      <p role="status">
        {r.status === "used"
          ? "Código utilizado."
          : seconds
            ? `Válido durante ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
            : "Código caducado. Solicita uno nuevo."}
      </p>
      <p className="small-note">
        {r.cost
          ? `${number(r.cost)} puntos ${r.status === "used" ? "descontados." : "se descontarán al validar."}`
          : `${r.percent}% de descuento ${r.status === "used" ? "aplicado." : "al validar."}`}
      </p>
      {r.status === "pending" && (
        <button
          className="button primary full"
          disabled={busy}
          onClick={refresh}
        >
          {busy ? "Comprobando…" : "Comprobar canje"}
        </button>
      )}
    </>
  );
}
