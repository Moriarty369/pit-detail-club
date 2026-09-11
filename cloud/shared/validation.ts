import { z } from "zod";
export const password = z
  .string()
  .min(12, "Usa al menos 12 caracteres.")
  .max(128);
export const email = z
  .string()
  .trim()
  .email("Escribe un correo válido.")
  .max(120)
  .transform((v) => v.toLowerCase());
export const loginInput = z
  .object({
    email,
    password: z.string().min(1).max(128),
    captchaToken: z.string().max(2048).optional(),
  })
  .strict();
export const registerInput = z
  .object({
    email,
    password,
    name: z.string().trim().min(2).max(70),
    marketing: z.boolean().default(false),
    captchaToken: z.string().max(2048).optional(),
  })
  .strict();
export const profileInput = z
  .object({ name: z.string().trim().min(2).max(70), marketing: z.boolean() })
  .strict();
export const vehicleInput = z
  .object({
    kind: z.enum(["car", "motorcycle", "boat"]),
    label: z.string().trim().min(2).max(100),
  })
  .strict();
export const serviceInput = z
  .object({
    id: z.string().uuid(),
    customerId: z.string().uuid(),
    vehicleId: z.string().uuid().nullable(),
    service: z.enum([
      "Detailing exterior",
      "Detailing interior",
      "Detailing integral",
      "Cambio de aceite",
      "Mecánica básica",
      "Lavado de moto",
      "Detailing de embarcación",
    ]),
    cents: z.number().int().min(500).max(25000),
    mode: z.enum(["En local", "A domicilio"]),
  })
  .strict();
export const rulesInput = z
  .object({
    thresholdCents: z.number().int().min(100).max(1000000),
    rappelPercent: z.number().int().min(1).max(30),
  })
  .strict();
export const factorInput = z
  .object({
    factorId: z.string().uuid(),
    code: z
      .string()
      .regex(/^\d{6}$/, "Escribe los seis dígitos del autenticador."),
  })
  .strict();
