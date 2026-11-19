-- =====================================================================
--  Autokosten – Datenbank-Schema für Supabase
--  Komplett in den SQL-Editor von Supabase kopieren und "Run" drücken.
--  Kann gefahrlos mehrfach ausgeführt werden.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
--  Tabellen
-- ---------------------------------------------------------------------

create table if not exists public.cars (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  purchase_date   date not null default current_date,
  purchase_price  numeric(12,2) not null default 0,
  start_km        integer not null default 0,
  residual_value  numeric(12,2),          -- geschätzter Restwert (optional)
  sale_date       date,                   -- Verkaufsdatum (am Ende)
  sale_price      numeric(12,2),          -- Verkaufserlös (am Ende)
  fuel_unit       text not null default 'l' check (fuel_unit in ('l','kWh')),
  invite_code     text unique,            -- Einladungscode (nur während einer Einladung gesetzt)
  invite_expires_at timestamptz,          -- Code gilt bis (24 h, einmal verwendbar)
  created_by      uuid not null default auth.uid(),
  created_at      timestamptz not null default now()
);

-- Update ältere Installationen: dauerhafte Codes abschaffen
alter table public.cars add column if not exists invite_expires_at timestamptz;
alter table public.cars alter column invite_code drop not null;
alter table public.cars alter column invite_code drop default;
update public.cars set invite_code = null where invite_expires_at is null and invite_code is not null;

create table if not exists public.car_members (
  car_id     uuid not null references public.cars(id) on delete cascade,
  user_id    uuid not null,
  email      text,
  joined_at  timestamptz not null default now(),
  primary key (car_id, user_id)
);

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  car_id     uuid not null references public.cars(id) on delete cascade,
  name       text not null,
  kind       text not null default 'variabel' check (kind in ('fix','variabel','einnahme')),
  is_fuel    boolean not null default false,
  icon       text not null default 'tag',
  sort       integer not null default 100,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Update ältere Installationen: Kategorie-Art "einnahme" erlauben
alter table public.categories drop constraint if exists categories_kind_check;
alter table public.categories add constraint categories_kind_check check (kind in ('fix','variabel','einnahme'));

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  car_id        uuid not null references public.cars(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete restrict,
  date          date not null default current_date,
  amount        numeric(12,2) not null,
  km            integer,
  liters        numeric(10,2),
  comment       text,
  kind_override text check (kind_override in ('fix','variabel')),
  receipt_path  text,
  created_by    uuid not null default auth.uid(),
  created_at    timestamptz not null default now()
);

create table if not exists public.odometer (
  id          uuid primary key default gen_random_uuid(),
  car_id      uuid not null references public.cars(id) on delete cascade,
  date        date not null default current_date,
  km          integer not null,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now()
);

-- Wiederkehrende Kosten (Versicherung, Steuer, Leasing, ADAC …)
create table if not exists public.contracts (
  id               uuid primary key default gen_random_uuid(),
  car_id           uuid not null references public.cars(id) on delete cascade,
  category_id      uuid not null references public.categories(id) on delete restrict,
  name             text not null,
  amount           numeric(12,2) not null,      -- Betrag pro Zahlung
  interval_months  integer not null default 12 check (interval_months in (1,3,6,12)),
  start_date       date not null,               -- erste Zahlung
  end_date         date,                        -- letzte gültige Zahlung (leer = läuft)
  created_by       uuid not null default auth.uid(),
  created_at       timestamptz not null default now()
);

-- Erlebnisse / Fotoalbum
create table if not exists public.moments (
  id          uuid primary key default gen_random_uuid(),
  car_id      uuid not null references public.cars(id) on delete cascade,
  date        date not null default current_date,
  title       text not null,
  text        text,
  km          integer,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.moment_photos (
  id          uuid primary key default gen_random_uuid(),
  moment_id   uuid not null references public.moments(id) on delete cascade,
  car_id      uuid not null references public.cars(id) on delete cascade,
  path        text not null,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now()
);

-- Erinnerungen (TÜV, Ölwechsel, Reifenwechsel …) – nach Datum und/oder km
create table if not exists public.reminders (
  id             uuid primary key default gen_random_uuid(),
  car_id         uuid not null references public.cars(id) on delete cascade,
  title          text not null,
  icon           text not null default 'bell',
  category_id    uuid references public.categories(id) on delete set null,
  due_date       date,                -- fällig am (optional)
  due_km         integer,             -- fällig bei km-Stand (optional)
  repeat_months  integer,             -- wiederholen alle x Monate (optional)
  repeat_km      integer,             -- wiederholen alle x km (optional)
  note           text,
  done_at        date,                -- erledigt (dann ausgeblendet)
  created_by     uuid not null default auth.uid(),
  created_at     timestamptz not null default now(),
  check (due_date is not null or due_km is not null)
);

create index if not exists reminders_car_idx on public.reminders(car_id);
create index if not exists expenses_car_date_idx on public.expenses(car_id, date);
create index if not exists odometer_car_date_idx on public.odometer(car_id, date);
create index if not exists contracts_car_idx     on public.contracts(car_id);
create index if not exists moments_car_date_idx  on public.moments(car_id, date);
create index if not exists categories_car_idx    on public.categories(car_id);
create index if not exists moment_photos_m_idx   on public.moment_photos(moment_id);
create index if not exists car_members_user_idx  on public.car_members(user_id);

-- ---------------------------------------------------------------------
--  Hilfsfunktion: Ist der angemeldete Nutzer Mitglied dieses Autos?
-- ---------------------------------------------------------------------
create or replace function public.is_member(p_car uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.car_members
    where car_id = p_car and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
--  Auto anlegen (legt Mitgliedschaft + Standardkategorien an)
-- ---------------------------------------------------------------------
create or replace function public.create_car(
  p_name text, p_purchase_date date, p_purchase_price numeric,
  p_start_km integer, p_fuel_unit text default 'l'
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;

  insert into cars (name, purchase_date, purchase_price, start_km, fuel_unit, created_by)
  values (p_name, coalesce(p_purchase_date, current_date), coalesce(p_purchase_price,0),
          coalesce(p_start_km,0), coalesce(p_fuel_unit,'l'), auth.uid())
  returning id into v_id;

  insert into car_members (car_id, user_id, email)
  values (v_id, auth.uid(), auth.jwt() ->> 'email');

  insert into categories (car_id, name, kind, is_fuel, icon, sort) values
    (v_id, case when p_fuel_unit = 'kWh' then 'Laden' else 'Tanken' end, 'variabel', true, case when p_fuel_unit = 'kWh' then 'plug-zap' else 'fuel' end, 10),
    (v_id, 'Öl',                 'variabel', false, 'droplet', 20),
    (v_id, 'Wartung/Inspektion', 'variabel', false, 'wrench', 30),
    (v_id, 'Reparatur',          'variabel', false, 'hammer', 40),
    (v_id, 'Reifen',             'variabel', false, 'disc', 50),
    (v_id, 'Wäsche/Pflege',      'variabel', false, 'spray-can', 60),
    (v_id, 'Parken/Maut',        'variabel', false, 'square-parking', 70),
    (v_id, 'TÜV/HU',             'fix',      false, 'clipboard-check', 80),
    (v_id, 'Versicherung',       'fix',      false, 'shield', 90),
    (v_id, 'Kfz-Steuer',         'fix',      false, 'landmark', 100),
    (v_id, 'Spritgeld (Mitfahrer)', 'einnahme', false, 'hand-coins', 300);

  -- Start-km-Stand als erster Eintrag
  insert into odometer (car_id, date, km, created_by)
  values (v_id, coalesce(p_purchase_date, current_date), coalesce(p_start_km,0), auth.uid());

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
--  Einem Auto per Einladungscode beitreten
-- ---------------------------------------------------------------------
create or replace function public.join_car(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  -- Nur gültige (≤ 24 h alte) Codes; wird beim Beitritt sofort verbraucht
  select id into v_id from cars
   where invite_code = upper(trim(p_code)) and invite_expires_at > now()
   for update;
  if v_id is null then raise exception 'Code ungültig oder abgelaufen'; end if;
  if not exists (select 1 from car_members where car_id = v_id and user_id = auth.uid()) then
    insert into car_members (car_id, user_id, email) values (v_id, auth.uid(), auth.jwt() ->> 'email');
    update cars set invite_code = null, invite_expires_at = null where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Einladung erzeugen: neuer Code, 24 Stunden gültig, ersetzt einen offenen Code
create or replace function public.new_invite_code(p_car uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_code text;
begin
  if not is_member(p_car) then raise exception 'Kein Zugriff'; end if;
  v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
  update cars set invite_code = v_code, invite_expires_at = now() + interval '24 hours' where id = p_car;
  return v_code;
end;
$$;

-- Offene Einladung zurückziehen
create or replace function public.cancel_invite(p_car uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_member(p_car) then raise exception 'Kein Zugriff'; end if;
  update cars set invite_code = null, invite_expires_at = null where id = p_car;
end;
$$;

revoke all on function public.create_car(text,date,numeric,integer,text) from public, anon;
revoke all on function public.join_car(text)       from public, anon;
revoke all on function public.new_invite_code(uuid) from public, anon;
revoke all on function public.cancel_invite(uuid)   from public, anon;
grant execute on function public.create_car(text,date,numeric,integer,text) to authenticated;
grant execute on function public.join_car(text)       to authenticated;
grant execute on function public.new_invite_code(uuid) to authenticated;
grant execute on function public.cancel_invite(uuid)   to authenticated;
grant execute on function public.is_member(uuid)       to authenticated;

-- ---------------------------------------------------------------------
--  Zugriffsregeln (Row Level Security): Jeder sieht nur seine Autos
-- ---------------------------------------------------------------------
alter table public.cars          enable row level security;
alter table public.car_members   enable row level security;
alter table public.categories    enable row level security;
alter table public.expenses      enable row level security;
alter table public.odometer      enable row level security;
alter table public.contracts     enable row level security;
alter table public.moments       enable row level security;
alter table public.moment_photos enable row level security;
alter table public.reminders     enable row level security;

drop policy if exists cars_select on public.cars;
drop policy if exists cars_update on public.cars;
drop policy if exists cars_delete on public.cars;
create policy cars_select on public.cars for select to authenticated using (public.is_member(id));
create policy cars_update on public.cars for update to authenticated using (public.is_member(id)) with check (public.is_member(id));
create policy cars_delete on public.cars for delete to authenticated using (created_by = auth.uid());
-- Insert läuft nur über create_car()

drop policy if exists members_select on public.car_members;
drop policy if exists members_delete on public.car_members;
create policy members_select on public.car_members for select to authenticated using (public.is_member(car_id));
create policy members_delete on public.car_members for delete to authenticated using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['categories','expenses','odometer','contracts','moments','moment_photos','reminders'] loop
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_member(car_id)) with check (public.is_member(car_id))',
      t || '_all', t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.cars, public.car_members, public.categories, public.expenses,
  public.odometer, public.contracts, public.moments, public.moment_photos, public.reminders
to authenticated;

-- Einladungscodes nur über die Funktionen oben änderbar, nicht direkt
revoke update on public.cars from authenticated;
grant update (name, purchase_date, purchase_price, start_km, residual_value, sale_date, sale_price, fuel_unit)
  on public.cars to authenticated;

-- ---------------------------------------------------------------------
--  Foto-Speicher (privat). Pfad: <car_id>/<datei>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create or replace function public.car_from_path(p_name text)
returns uuid
language plpgsql immutable
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists photos_select on storage.objects;
drop policy if exists photos_insert on storage.objects;
drop policy if exists photos_update on storage.objects;
drop policy if exists photos_delete on storage.objects;
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_member(public.car_from_path(name)));
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_member(public.car_from_path(name)));
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_member(public.car_from_path(name)));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_member(public.car_from_path(name)));

-- Fertig.
