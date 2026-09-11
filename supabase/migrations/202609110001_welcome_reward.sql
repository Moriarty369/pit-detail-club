-- Welcome credit applies only to profiles created after this migration.
-- It is independent of services and never contributes to quarterly spending.
alter table public.points_ledger drop constraint points_ledger_kind_check;
alter table public.points_ledger add constraint points_ledger_kind_check
  check (kind in ('service', 'redemption', 'reversal', 'welcome'));
alter table public.points_ledger add constraint points_ledger_welcome_check
  check (kind <> 'welcome' or (delta = 2000 and reference_id = customer_id));

create function private.on_welcome() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- The existing unique(kind, reference_id) constraint permits one credit per user.
  insert into public.points_ledger(customer_id, delta, kind, reference_id)
    values(new.id, 2000, 'welcome', new.id)
    on conflict(kind, reference_id) do nothing;
  if found then
    insert into public.audit_events(actor_id, customer_id, action, details)
      values(new.id, new.id, 'welcome.granted', jsonb_build_object('points', 2000));
  end if;
  return new;
end $$;
revoke execute on function private.on_welcome() from public, anon, authenticated;
create trigger pit_welcome after insert on public.profiles
  for each row execute function private.on_welcome();

create or replace function private.member(customer uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
  'customer',jsonb_build_object('id',p.id,'name',p.name,'email',u.email,'marketing',p.marketing),
  'vehicles',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'kind',v.kind,'label',v.label) order by v.created_at) from public.vehicles v where v.owner_id=p.id),'[]'::jsonb),
  'rules',(select jsonb_build_object('pointsPerDollar',1000,'thresholdCents',threshold_cents,'rappelPercent',rappel_percent) from public.club_rules),
  'entries',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'service',s.service,'cents',s.cents,'points',s.cents*10,'mode',s.mode,'date',s.created_at,'vehicleId',s.vehicle_id,'voided',s.voided_at is not null) order by s.created_at) from public.services s where s.customer_id=p.id),'[]'::jsonb),
  'redemptions',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'code',r.code,'offerId',r.offer_id,'cost',r.cost,'percent',r.percent,'period',r.period,'date',r.created_at,'expiresAt',r.expires_at,'status',case when r.used_at is null then 'pending' else 'used' end) order by r.created_at) from public.redemptions r where r.customer_id=p.id),'[]'::jsonb),
  'welcomeReward',(select jsonb_build_object('points',l.delta,'date',l.created_at) from public.points_ledger l where l.customer_id=p.id and l.kind='welcome'),
  'points',private.balance(p.id),'quarterSpend',private.quarter_spend(p.id),'period',private.period())
 from public.profiles p join auth.users u on u.id=p.id where p.id=customer
$$;
