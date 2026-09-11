import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, test, expect } from "vitest";
const db = new PGlite();
const customer = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002",
  admin = "10000000-0000-4000-8000-000000000003";
const service = "20000000-0000-4000-8000-000000000001";
const existing = "10000000-0000-4000-8000-000000000004";
async function asUser(id: string, level = "aal1") {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${id}',false); select set_config('request.jwt.claims','{"sub":"${id}","aal":"${level}","session_id":"${id}"}',false); set role authenticated;`,
  );
}
async function rpc(name: string, args: unknown[] = []) {
  const result = await db.query<Record<string, any>>(
    `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as value`,
    args,
  );
  return result.rows[0].value;
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid);
 create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid,status text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`);
  const migrations = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  await db.exec(readFileSync("supabase/migrations/" + migrations[0], "utf8"));
  await db.query("insert into auth.users(id,email) values($1,$2)", [
    existing,
    "existing@example.test",
  ]);
  for (const file of migrations.slice(1))
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  for (const [id, email, name] of [
    [customer, "alice@example.test", "Alice"],
    [other, "bob@example.test", "Bob"],
    [admin, "admin@example.test", "Admin"],
  ])
    await db.query("insert into auth.users values($1,$2,$3)", [
      id,
      email,
      JSON.stringify({
        full_name: name,
        role: "admin",
        points: 999999,
        welcomeReward: 999999,
      }),
    ]);
  await db.exec("insert into auth.sessions select id,id from auth.users");
  await db.query("update private.roles set role='admin' where user_id=$1", [
    admin,
  ]);
});
afterAll(() => db.close());
test("signup metadata cannot choose admin or welcome amount and RLS isolates customers", async () => {
  await asUser(customer);
  expect(await rpc("pit_session_role")).toBe("customer");
  expect((await rpc("pit_my_member")).points).toBe(2000);
  expect((await db.query("select id from public.profiles")).rows).toEqual([
    { id: customer },
  ]);
  expect(
    (await db.query("select customer_id,delta,kind from public.points_ledger"))
      .rows,
  ).toEqual([{ customer_id: customer, delta: 2000, kind: "welcome" }]);
  await expect(
    db.query(
      "insert into public.points_ledger(customer_id,delta,kind,reference_id) values($1,2000,'welcome',$1)",
      [customer],
    ),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.query("update public.points_ledger set delta=999999"),
  ).rejects.toThrow(/permission denied/);
  await expect(db.query("delete from public.points_ledger")).rejects.toThrow(
    /permission denied/,
  );
  await expect(
    db.query("update public.profiles set name=$1 where id=$2", [
      "Forged",
      other,
    ]),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.query("insert into private.roles values($1,'admin')", [other]),
  ).rejects.toThrow(/permission denied/);
  await expect(rpc("pit_admin_customers")).rejects.toThrow(/segundo factor/);
});
test("welcome is audited once, survives new sessions, and never counts as spending or a service", async () => {
  await asUser(customer);
  const initial = await rpc("pit_my_member");
  expect(initial.welcomeReward).toEqual({
    points: 2000,
    date: expect.any(String),
  });
  expect(initial.entries).toEqual([]);
  expect(initial.quarterSpend).toBe(0);
  await db.exec("reset role");
  await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [
    JSON.stringify({ points: 999999 }),
    customer,
  ]);
  await db.query("delete from auth.sessions where user_id=$1", [customer]);
  await db.query("insert into auth.sessions values($1,$1)", [customer]);
  await asUser(customer);
  for (const member of await Promise.all([
    rpc("pit_my_member"),
    rpc("pit_my_member"),
  ])) {
    expect(member.points).toBe(2000);
    expect(member.welcomeReward).toEqual(initial.welcomeReward);
  }
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select details from public.audit_events where customer_id=$1 and action='welcome.granted'",
        [customer],
      )
    ).rows,
  ).toEqual([{ details: { points: 2000 } }]);
  await expect(
    db.query(
      "insert into public.points_ledger(customer_id,delta,kind,reference_id) values($1,2000,'welcome',$1)",
      [customer],
    ),
  ).rejects.toThrow(/unique constraint/);
  await expect(
    db.query(
      "insert into public.points_ledger(customer_id,delta,kind,reference_id) values($1,3000,'welcome',$1)",
      [existing],
    ),
  ).rejects.toThrow(/check constraint/);
  await expect(
    db.query(
      "insert into public.points_ledger(customer_id,delta,kind,reference_id) values($1,2000,'welcome',gen_random_uuid())",
      [existing],
    ),
  ).rejects.toThrow(/check constraint/);
  await asUser(existing);
  expect((await rpc("pit_my_member")).points).toBe(0);
  expect((await rpc("pit_my_member")).welcomeReward).toBeNull();
});
test("admin AAL1 is denied; AAL2 can record a service, never using points from the browser", async () => {
  await asUser(admin);
  await expect(rpc("pit_admin_customers")).rejects.toThrow(/segundo factor/);
  await asUser(admin, "aal2");
  const data = [service, customer, null, "Lavado de moto", 500, "En local"];
  expect((await rpc("pit_add_service", data)).points).toBe(7000);
  expect((await rpc("pit_add_service", data)).entries).toHaveLength(1);
  await expect(
    rpc("pit_add_service", [
      service,
      customer,
      null,
      "Lavado de moto",
      600,
      "En local",
    ]),
  ).rejects.toThrow(/referencia/);
  await expect(
    rpc("pit_add_service", [
      "20000000-0000-4000-8000-000000000099",
      customer,
      null,
      "Lavado de moto",
      499,
      "En local",
    ]),
  ).rejects.toThrow(/check constraint/);
});
test("boats/motorcycles belong to their customer; admin cannot attach someone else’s vehicle", async () => {
  await asUser(other);
  const member = await rpc("pit_add_vehicle", ["boat", "Lancha de prueba"]);
  expect(member.vehicles[0].kind).toBe("boat");
  await asUser(admin, "aal2");
  await expect(
    rpc("pit_add_service", [
      "20000000-0000-4000-8000-000000000003",
      customer,
      member.vehicles[0].id,
      "Detailing integral",
      25000,
      "En local",
    ]),
  ).rejects.toThrow(/no pertenece/);
  await asUser(customer);
  expect((await db.query("select * from public.vehicles")).rows).toHaveLength(
    0,
  );
});
test("MFA enrollment forces existing customer AAL1 sessions to challenge at database level", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into auth.mfa_factors(user_id,status) values($1,'verified')",
    [customer],
  );
  await asUser(customer);
  await expect(rpc("pit_my_member")).rejects.toThrow(/Completa el acceso/);
  expect((await db.query("select * from public.profiles")).rows).toHaveLength(
    0,
  );
  await asUser(customer, "aal2");
  expect((await rpc("pit_my_member")).points).toBe(7000);
});
test("server creates reward prices, reuses pending code and permits only admin to consume it once", async () => {
  await asUser(admin, "aal2");
  await rpc("pit_add_service", [
    "20000000-0000-4000-8000-000000000004",
    customer,
    null,
    "Detailing integral",
    25000,
    "En local",
  ]);
  await asUser(customer, "aal2");
  const requested = await rpc("pit_request_reward", ["oil"]);
  expect(requested.member.points).toBe(257000);
  expect((await rpc("pit_request_reward", ["oil"])).rewardId).toBe(
    requested.rewardId,
  );
  const reward = requested.member.redemptions.find(
    (r: any) => r.id === requested.rewardId,
  );
  await expect(
    rpc("pit_redeem", [customer, reward.code, true]),
  ).rejects.toThrow(/administración/);
  await asUser(admin, "aal2");
  await expect(rpc("pit_update_rules", [20000, 7])).rejects.toThrow(
    /códigos activos/,
  );
  expect((await rpc("pit_redeem", [customer, reward.code, true])).points).toBe(
    157000,
  );
  await expect(
    rpc("pit_redeem", [customer, reward.code, true]),
  ).rejects.toThrow(/ya fue utilizado/);
  expect((await rpc("pit_update_rules", [20000, 7])).rappelPercent).toBe(7);
});
test("reversals are audited and idempotent, reject spent points and revalidate rappel", async () => {
  await asUser(customer, "aal2");
  const requested = await rpc("pit_request_reward", ["rappel"]);
  const reward = requested.member.redemptions.find(
    (r: any) => r.id === requested.rewardId,
  );
  await asUser(admin, "aal2");
  expect((await rpc("pit_redeem", [customer, reward.code, true])).points).toBe(
    157000,
  );
  await expect(
    rpc("pit_void_service", [
      "20000000-0000-4000-8000-000000000004",
      "Servicio registrado por error",
    ]),
  ).rejects.toThrow(/ya se han utilizado/);
  expect(
    (await rpc("pit_void_service", [service, "Servicio registrado por error"]))
      .points,
  ).toBe(152000);
  expect(
    (await rpc("pit_void_service", [service, "Servicio registrado por error"]))
      .points,
  ).toBe(152000);
  expect(
    (
      await db.query(
        "select * from public.audit_events where action='service.void'",
      )
    ).rows,
  ).toHaveLength(1);
  await asUser(customer, "aal2");
  await expect(rpc("pit_request_reward", ["rappel"])).rejects.toThrow(
    /no está disponible/,
  );
});
test("expired codes are rejected and a revoked session cannot read its ledger", async () => {
  await asUser(customer, "aal2");
  const requested = await rpc("pit_request_reward", ["oil"]);
  const reward = requested.member.redemptions.find(
    (r: any) => r.id === requested.rewardId,
  );
  await db.exec("reset role");
  await db.query(
    "update public.redemptions set expires_at=now()-interval '1 minute' where id=$1",
    [reward.id],
  );
  await asUser(admin, "aal2");
  await expect(
    rpc("pit_redeem", [customer, reward.code, true]),
  ).rejects.toThrow(/caducado/);
  await db.exec("reset role");
  await db.query("delete from auth.sessions where user_id=$1", [customer]);
  await asUser(customer, "aal2");
  await expect(rpc("pit_my_member")).rejects.toThrow(/Completa el acceso/);
  expect(
    (await db.query("select * from public.points_ledger")).rows,
  ).toHaveLength(0);
});
test("anonymous direct reads and RPCs are denied", async () => {
  await db.exec("reset role; set role anon");
  await expect(rpc("pit_my_member")).rejects.toThrow(/permission denied/);
  await expect(db.query("select * from public.profiles")).rejects.toThrow(
    /permission denied/,
  );
});
