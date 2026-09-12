import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/style.css";
import "./styles/branding.css";
import "./styles/cards.css";
import "./styles/auth.css";
import "./cloud.css";
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="cloud-fallback">
        <h1>No se pudo abrir el club.</h1>
        <p>Recarga la página para volver a intentarlo.</p>
        <a href="/" className="button primary">
          Volver a intentar
        </a>
      </main>
    ) : (
      this.props.children
    );
  }
}
document.body.classList.add("connected");
createRoot(document.getElementById("app")!).render(
  <Boundary>
    <App />
  </Boundary>,
);
