import { z } from "zod";
import { createBaseApp, finishApp, check, fail, input } from "./core";
import {
  registerInput,
  profileInput,
  vehicleInput,
  email,
} from "../shared/validation";
export type { Bindings } from "./core";

// Only the customer routes are imported into the public Worker.
export function createApp() {
  const app = createBaseApp("customer", (app) => {
    app.post("/api/auth/resend", async (c) => {
      if (c.env.EMAIL_ENABLED !== "true") fail(404, "Registro no disponible.");
      const data = await input(
        c,
        z
          .object({ email, captchaToken: z.string().max(2048).optional() })
          .strict(),
      );
      if (c.env.TURNSTILE_SITE_KEY && !data.captchaToken)
        fail(400, "Completa la comprobación de acceso.");
      const result = await c.get("sb").auth.resend({
        type: "signup",
        email: data.email,
        options: {
          emailRedirectTo: c.env.APP_ORIGIN + "/api/auth/callback",
          captchaToken: data.captchaToken,
        },
      });
      if (
        result.error &&
        (result.error.status === 429 || (result.error.status || 0) >= 500)
      )
        check(result);
      return c.json(
        {
          message:
            "Si tu cuenta necesita confirmación, recibirás un nuevo código. Revisa también la carpeta de spam.",
        },
        202,
      );
    });
    app.post("/api/auth/register", async (c) => {
      if (c.env.EMAIL_ENABLED !== "true") fail(404, "Registro no disponible.");
      const data = await input(c, registerInput);
      if (c.env.TURNSTILE_SITE_KEY && !data.captchaToken)
        fail(400, "Completa la comprobación de acceso.");
      const result = await c.get("sb").auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { full_name: data.name, marketing: data.marketing },
          captchaToken: data.captchaToken,
          emailRedirectTo: c.env.APP_ORIGIN + "/api/auth/callback",
        },
      });
      check(result);
      // A configured production project must require email confirmation.
      if (result.data.session) {
        await c.get("sb").auth.signOut({ scope: "local" });
        fail(
          503,
          "El registro requiere configurar la verificación del correo.",
        );
      }
      return c.json(
        {
          message:
            "Si el correo puede registrarse, recibirás un código de verificación. Revisa también la carpeta de spam.",
        },
        202,
      );
    });
  });
  app.get("/api/me", async (c) => {
    const result = await c.get("sb").rpc("pit_my_member");
    check(result);
    return c.json(result.data);
  });
  app.patch("/api/me", async (c) => {
    const data = await input(c, profileInput);
    const r = await c.get("sb").rpc("pit_update_profile", {
      p_name: data.name,
      p_marketing: data.marketing,
    });
    check(r);
    return c.json(r.data);
  });
  app.post("/api/me/vehicles", async (c) => {
    const data = await input(c, vehicleInput);
    const r = await c
      .get("sb")
      .rpc("pit_add_vehicle", { p_kind: data.kind, p_label: data.label });
    check(r);
    return c.json(r.data);
  });
  app.post("/api/me/rewards", async (c) => {
    const data = await input(
      c,
      z
        .object({ offerId: z.enum(["wash", "oil", "detail", "rappel"]) })
        .strict(),
    );
    const r = await c
      .get("sb")
      .rpc("pit_request_reward", { p_offer: data.offerId });
    check(r);
    return c.json(r.data);
  });
  return finishApp(app);
}
export default createApp();
