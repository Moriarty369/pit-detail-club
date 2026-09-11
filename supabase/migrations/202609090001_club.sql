-- Authoritative ledger. All writes happen inside transactions via these functions.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(name) between 2 and 70),
  marketing boolean not null default false, created_at timestamptz not null default now()
);
create table private.roles (user_id uuid primary key references public.profiles(id) on delete cascade, role text not null check (role in ('customer','admin')));
create table public.vehicles (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('car','motorcycle','boat')), label text not null check(length(label) between 2 and 100),
  created_at timestamptz not null default now()
);
create table public.club_rules (id boolean primary key default true check(id), threshold_cents integer not null check(threshold_cents between 100 and 1000000), rappel_percent integer not null check(rappel_percent between 1 and 30));
insert into public.club_rules values(true,25000,5);
create table public.services (
  id uuid primary key, customer_id uuid not null references public.profiles(id), vehicle_id uuid references public.vehicles(id),
  service text not null check(service in ('Detailing exterior','Detailing interior','Detailing integral','Cambio de aceite','Mecánica básica','Lavado de moto','Detailing de embarcación')),
  cents integer not null check(cents between 500 and 25000), mode text not null check(mode in ('En local','A domicilio')),
  actor_id uuid not null references public.profiles(id), created_at timestamptz not null default now(), voided_at timestamptz
);
create table public.redemptions (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.profiles(id),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  offer_id text not null check(offer_id in ('wash','oil','detail','rappel')), cost integer not null check(cost>=0), percent integer,
  period text not null, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '5 minutes',
  used_at timestamptz, used_by uuid references public.profiles(id)
);
create table public.points_ledger (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.profiles(id), delta integer not null,
  kind text not null check(kind in ('service','redemption','reversal')), reference_id uuid not null,
  created_at timestamptz not null default now(), unique(kind,reference_id)
);
create table public.audit_events (id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles(id), customer_id uuid references public.profiles(id), action text not null, details jsonb not null default '{}', created_at timestamptz not null default now());
create index on public.vehicles(owner_id);
create index on public.services(customer_id,created_at);
create index on public.redemptions(customer_id,created_at);
create index on public.points_ledger(customer_id);

create function private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,name,marketing) values(new.id,case when length(trim(new.raw_user_meta_data->>'full_name'))>=2 then left(trim(new.raw_user_meta_data->>'full_name'),70) else 'Cliente PIT' end,coalesce(new.raw_user_meta_data->'marketing'='true'::jsonb,false));
  insert into private.roles values(new.id,'customer');
  return new;
end $$;
create trigger pit_signup after insert on auth.users for each row execute function private.on_signup();
create function private.is_assured() returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id') and ((auth.jwt()->>'aal')='aal2' or (not exists(select 1 from auth.mfa_factors f where f.user_id=auth.uid() and f.status='verified') and not exists(select 1 from private.roles r where r.user_id=auth.uid() and r.role='admin')))
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select private.is_assured() and (auth.jwt()->>'aal')='aal2' and exists(select 1 from private.roles where user_id=auth.uid() and role='admin')
$$;
create function private.require_admin() returns void language plpgsql security definer set search_path='' as $$
begin if not coalesce(private.is_admin(),false) then raise sqlstate 'PT403' using message='Acceso exclusivo de administración con segundo factor.'; end if; end $$;
create function private.require_customer() returns uuid language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(private.is_assured(),false) or not exists(select 1 from private.roles where user_id=auth.uid() and role='customer') then raise sqlstate 'PT403' using message='Completa el acceso a tu cuenta.'; end if;
  return auth.uid();
end $$;
create function public.pit_session_role() returns text language sql stable security definer set search_path='' as $$ select role from private.roles where user_id=auth.uid() $$;
create function private.period() returns text language sql stable set search_path='' as $$ select to_char(now() at time zone 'America/Caracas','YYYY')||'-T'||extract(quarter from now() at time zone 'America/Caracas')::text $$;
create function private.balance(customer uuid) returns bigint language sql stable security definer set search_path='' as $$ select coalesce(sum(delta),0) from public.points_ledger where customer_id=customer $$;
create function private.quarter_spend(customer uuid) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce(sum(cents),0) from public.services where customer_id=customer and voided_at is null and created_at >= (date_trunc('quarter',now() at time zone 'America/Caracas') at time zone 'America/Caracas')
$$;
create function private.member(customer uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'customer',jsonb_build_object('id',p.id,'name',p.name,'email',u.email,'marketing',p.marketing),
  'vehicles',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'kind',v.kind,'label',v.label) order by v.created_at) from public.vehicles v where v.owner_id=p.id),'[]'::jsonb),
  'rules',(select jsonb_build_object('pointsPerDollar',1000,'thresholdCents',threshold_cents,'rappelPercent',rappel_percent) from public.club_rules),
  'entries',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'service',s.service,'cents',s.cents,'points',s.cents*10,'mode',s.mode,'date',s.created_at,'vehicleId',s.vehicle_id,'voided',s.voided_at is not null) order by s.created_at) from public.services s where s.customer_id=p.id),'[]'::jsonb),
  'redemptions',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'code',r.code,'offerId',r.offer_id,'cost',r.cost,'percent',r.percent,'period',r.period,'date',r.created_at,'expiresAt',r.expires_at,'status',case when r.used_at is null then 'pending' else 'used' end) order by r.created_at) from public.redemptions r where r.customer_id=p.id),'[]'::jsonb),
  'points',private.balance(p.id),'quarterSpend',private.quarter_spend(p.id),'period',private.period())
 from public.profiles p join auth.users u on u.id=p.id where p.id=customer
$$;
create function public.pit_my_member() returns jsonb language plpgsql security definer set search_path='' as $$ begin return private.member(private.require_customer()); end $$;
create function public.pit_update_profile(p_name text,p_marketing boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare customer uuid:=private.require_customer(); begin
 if p_name is null or length(trim(p_name)) not between 2 and 70 or p_marketing is null then raise sqlstate 'PT400' using message='Perfil no válido.'; end if;
 update public.profiles set name=trim(p_name),marketing=p_marketing where id=customer;
 insert into public.audit_events(actor_id,customer_id,action) values(customer,customer,'profile.update');
 return private.member(customer);
end $$;
create function public.pit_add_vehicle(p_kind text,p_label text) returns jsonb language plpgsql security definer set search_path='' as $$
declare customer uuid:=private.require_customer(); begin
 perform 1 from public.profiles where id=customer for update;
 if (select count(*) from public.vehicles where owner_id=customer)>=100 then raise sqlstate 'PT422' using message='Contacta con el negocio para ampliar tu flota.'; end if;
 insert into public.vehicles(owner_id,kind,label) values(customer,p_kind,trim(p_label));
 insert into public.audit_events(actor_id,customer_id,action) values(customer,customer,'vehicle.create');
 return private.member(customer);
end $$;
create function public.pit_admin_member(p_customer uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.require_admin(); if not exists(select 1 from private.roles where user_id=p_customer and role='customer') then raise sqlstate 'PT404' using message='Cliente no encontrado.'; end if; return private.member(p_customer); end $$;
create function public.pit_admin_customers(p_search text default '') returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.require_admin(); return (select coalesce(jsonb_agg(row),'[]'::jsonb) from (select p.id,p.name,u.email,private.balance(p.id) as points from public.profiles p join private.roles r on r.user_id=p.id join auth.users u on u.id=p.id where r.role='customer' and (p.name ilike '%'||left(p_search,120)||'%' or u.email ilike '%'||left(p_search,120)||'%' or p.id::text=p_search) order by p.created_at desc limit 100) row); end $$;
create function public.pit_add_service(p_id uuid,p_customer uuid,p_vehicle uuid,p_service text,p_cents integer,p_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.services; begin
 perform private.require_admin();
 perform 1 from public.profiles p join private.roles r on r.user_id=p.id where p.id=p_customer and r.role='customer' for update of p;
 if not found then raise sqlstate 'PT404' using message='Cliente no encontrado.'; end if;
 select * into previous from public.services where id=p_id;
 if found then
  if previous.customer_id is distinct from p_customer or previous.vehicle_id is distinct from p_vehicle or previous.service is distinct from p_service or previous.cents is distinct from p_cents or previous.mode is distinct from p_mode then raise sqlstate 'PT409' using message='Esta referencia corresponde a otro servicio.'; end if;
  return private.member(p_customer);
 end if;
 if p_vehicle is not null and not exists(select 1 from public.vehicles where id=p_vehicle and owner_id=p_customer) then raise sqlstate 'PT400' using message='El vehículo no pertenece al cliente.'; end if;
 insert into public.services(id,customer_id,vehicle_id,service,cents,mode,actor_id) values(p_id,p_customer,p_vehicle,p_service,p_cents,p_mode,auth.uid());
 insert into public.points_ledger(customer_id,delta,kind,reference_id) values(p_customer,p_cents*10,'service',p_id);
 insert into public.audit_events(actor_id,customer_id,action,details) values(auth.uid(),p_customer,'service.create',jsonb_build_object('serviceId',p_id,'cents',p_cents));
 return private.member(p_customer);
end $$;
create function public.pit_void_service(p_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.services; begin
 perform private.require_admin();
 if p_reason is null or length(trim(p_reason)) not between 5 and 500 then raise sqlstate 'PT400' using message='Indica el motivo de la anulación.'; end if;
 select * into item from public.services where id=p_id;
 if not found then raise sqlstate 'PT404' using message='Servicio no encontrado.'; end if;
 perform 1 from public.profiles where id=item.customer_id for update;
 select * into item from public.services where id=p_id for update;
 if item.voided_at is not null then return private.member(item.customer_id); end if;
 if private.balance(item.customer_id)<item.cents*10 then raise sqlstate 'PT422' using message='Los puntos ya se han utilizado. Revisa primero los canjes con el negocio.'; end if;
 update public.services set voided_at=now() where id=p_id;
 insert into public.points_ledger(customer_id,delta,kind,reference_id) values(item.customer_id,-item.cents*10,'reversal',p_id);
 insert into public.audit_events(actor_id,customer_id,action,details) values(auth.uid(),item.customer_id,'service.void',jsonb_build_object('serviceId',p_id,'reason',trim(p_reason)));
 return private.member(item.customer_id);
end $$;
create function public.pit_request_reward(p_offer text) returns jsonb language plpgsql security definer set search_path='' as $$
declare customer uuid:=private.require_customer(); reward public.redemptions; price integer; rules public.club_rules; begin
 -- Rules lock first, consistently in request/redeem/rules update.
 select * into rules from public.club_rules for share;
 perform 1 from public.profiles where id=customer for update;
 price:=case p_offer when 'wash' then 150000 when 'oil' then 100000 when 'detail' then 250000 when 'rappel' then 0 else null end;
 if price is null then raise sqlstate 'PT400' using message='Beneficio no válido.'; end if;
 if private.balance(customer)<price then raise sqlstate 'PT422' using message='Todavía no tienes puntos suficientes.'; end if;
 if p_offer='rappel' and (private.quarter_spend(customer)<rules.threshold_cents or exists(select 1 from public.redemptions where customer_id=customer and offer_id='rappel' and period=private.period() and used_at is not null)) then raise sqlstate 'PT422' using message='El rappel todavía no está disponible.'; end if;
 select * into reward from public.redemptions where customer_id=customer and offer_id=p_offer and used_at is null and expires_at>now() and period=private.period() limit 1;
 if not found then
  insert into public.redemptions(customer_id,offer_id,cost,percent,period) values(customer,p_offer,price,case when p_offer='rappel' then rules.rappel_percent end,private.period()) returning * into reward;
  insert into public.audit_events(actor_id,customer_id,action,details) values(customer,customer,'reward.request',jsonb_build_object('rewardId',reward.id));
 end if;
 return jsonb_build_object('member',private.member(customer),'rewardId',reward.id);
end $$;
create function public.pit_redeem(p_customer uuid,p_code text,p_conditions boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare reward public.redemptions; rules public.club_rules; begin
 perform private.require_admin();
 if p_conditions is distinct from true then raise sqlstate 'PT400' using message='Comprueba las condiciones del beneficio.'; end if;
 select * into rules from public.club_rules for share;
 perform 1 from public.profiles where id=p_customer for update;
 select * into reward from public.redemptions where customer_id=p_customer and code=upper(trim(p_code)) for update;
 if not found then raise sqlstate 'PT404' using message='Código no encontrado.'; end if;
 if reward.used_at is not null then raise sqlstate 'PT409' using message='Este código ya fue utilizado.'; end if;
 if reward.expires_at<=now() then raise sqlstate 'PT422' using message='El código ha caducado.'; end if;
 if private.balance(p_customer)<reward.cost then raise sqlstate 'PT422' using message='Saldo insuficiente.'; end if;
 if reward.offer_id='rappel' and (reward.period<>private.period() or private.quarter_spend(p_customer)<rules.threshold_cents or exists(select 1 from public.redemptions where customer_id=p_customer and offer_id='rappel' and period=private.period() and used_at is not null)) then raise sqlstate 'PT422' using message='El cliente no cumple las condiciones del rappel.'; end if;
 update public.redemptions set used_at=now(),used_by=auth.uid() where id=reward.id;
 if reward.cost>0 then insert into public.points_ledger(customer_id,delta,kind,reference_id) values(p_customer,-reward.cost,'redemption',reward.id); end if;
 insert into public.audit_events(actor_id,customer_id,action,details) values(auth.uid(),p_customer,'reward.redeem',jsonb_build_object('rewardId',reward.id));
 return private.member(p_customer);
end $$;
create function public.pit_update_rules(p_threshold integer,p_percent integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.require_admin(); perform 1 from public.club_rules for update;
 if exists(select 1 from public.redemptions where used_at is null and expires_at>now()) then raise sqlstate 'PT422' using message='Espera a que se validen o caduquen los códigos activos.'; end if;
 update public.club_rules set threshold_cents=p_threshold,rappel_percent=p_percent;
 insert into public.audit_events(actor_id,action,details) values(auth.uid(),'rules.update',jsonb_build_object('thresholdCents',p_threshold,'rappelPercent',p_percent));
 return jsonb_build_object('thresholdCents',p_threshold,'rappelPercent',p_percent,'pointsPerDollar',1000);
end $$;

-- Every table has RLS; no client has direct INSERT/UPDATE/DELETE privileges.
alter table public.profiles enable row level security;
alter table private.roles enable row level security;
alter table public.vehicles enable row level security;
alter table public.club_rules enable row level security;
alter table public.services enable row level security;
alter table public.redemptions enable row level security;
alter table public.points_ledger enable row level security;
alter table public.audit_events enable row level security;
create policy own_profile on public.profiles for select to authenticated using ((id=auth.uid() and private.is_assured()) or private.is_admin());
create policy own_vehicles on public.vehicles for select to authenticated using ((owner_id=auth.uid() and private.is_assured()) or private.is_admin());
create policy read_rules on public.club_rules for select to authenticated using (private.is_assured());
create policy own_services on public.services for select to authenticated using ((customer_id=auth.uid() and private.is_assured()) or private.is_admin());
create policy own_rewards on public.redemptions for select to authenticated using ((customer_id=auth.uid() and private.is_assured()) or private.is_admin());
create policy own_points on public.points_ledger for select to authenticated using ((customer_id=auth.uid() and private.is_assured()) or private.is_admin());
create policy admin_audit on public.audit_events for select to authenticated using (private.is_admin());
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles,public.vehicles,public.club_rules,public.services,public.redemptions,public.points_ledger,public.audit_events to authenticated;
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
-- Policy helpers require usage but private is not an exposed PostgREST schema.
grant usage on schema private to authenticated;
grant execute on function private.is_assured(),private.is_admin() to authenticated;
grant execute on function public.pit_session_role(),public.pit_my_member(),public.pit_update_profile(text,boolean),public.pit_add_vehicle(text,text),public.pit_admin_member(uuid),public.pit_admin_customers(text),public.pit_add_service(uuid,uuid,uuid,text,integer,text),public.pit_void_service(uuid,text),public.pit_request_reward(text),public.pit_redeem(uuid,text,boolean),public.pit_update_rules(integer,integer) to authenticated;
