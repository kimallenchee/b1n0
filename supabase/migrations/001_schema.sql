-- b1n0 schema
-- Run this in your Supabase SQL editor (Dashboard > SQL Editor)

-- ─── PROFILES ────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text not null default 'Usuario',
  balance      integer not null default 1250,
  tier         smallint not null default 1 check (tier in (1, 2, 3)),
  currency     text not null default 'Q',
  total_predictions  integer not null default 0,
  correct_predictions integer not null default 0,
  total_cobrado integer not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', 'Usuario')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── EVENTS ──────────────────────────────────────────────────────────────────

create table if not exists public.events (
  id             text primary key,
  question       text not null,
  category       text not null,
  subtype        text,
  sponsor_name   text,
  yes_percent    integer not null default 50,
  no_percent     integer not null default 50,
  pool_size      integer not null default 0,
  currency       text not null default 'Q',
  time_remaining text not null default '',
  is_live        boolean not null default false,
  min_entry      integer not null default 25,
  max_entry      integer not null default 500,
  tier_required  smallint not null default 1,
  status         text not null default 'open',
  result         text,
  ends_at        timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "Anyone can read events"
  on public.events for select
  using (true);

-- ─── SEED EVENTS ─────────────────────────────────────────────────────────────

insert into public.events
  (id, question, category, subtype, sponsor_name, yes_percent, no_percent, pool_size, currency, time_remaining, is_live, min_entry, max_entry, tier_required, status, ends_at, created_at)
values
  ('1',  '¿Gana Comunicaciones el torneo de clausura?',                                                          'deportes',    null,          'Tigo',              68, 32, 85000, 'Q', '3 días',            true,  25,  500, 1, 'open', '2026-03-07T23:59:00Z', '2026-03-03T00:00:00Z'),
  ('2',  '¿Habrá un Juego 7 en las Finales de la NBA?',                                                          'deportes',    null,          'Claro',             41, 59, 42000, 'Q', 'Hoy a las 9pm',     true,  25,  500, 1, 'open', '2026-03-04T21:00:00Z', '2026-03-03T00:00:00Z'),
  ('5',  '¿Clasifica Guatemala al Mundial 2026?',                                                                 'deportes',    null,          'Tigo',              82, 18, 56000, 'Q', '5 días',            false, 25,  500, 1, 'open', '2026-03-09T23:59:00Z', '2026-02-28T00:00:00Z'),
  ('6',  '¿Aprobará el Congreso la reforma a la Ley de Minería en 2026?',                                        'politica',    null,          'Prensa Libre',      38, 62, 22000, 'Q', '8 días',            true,  25,  500, 1, 'open', '2026-03-12T23:59:00Z', '2026-03-01T00:00:00Z'),
  ('7',  '¿Ganará la oposición las elecciones municipales de 2027?',                                             'politica',    null,          'Nómada',            44, 56, 14000, 'Q', '30 días',           false, 25,  500, 1, 'open', null,                  '2026-02-15T00:00:00Z'),
  ('4',  '¿Sube el precio del café este mes?',                                                                   'economia',    null,          'Banrural',          55, 45, 31000, 'Q', '12 días',           false, 25,  500, 1, 'open', null,                  '2026-02-20T00:00:00Z'),
  ('8',  '¿Bajará la inflación en Guatemala por debajo del 3% en Q2 2026?',                                     'economia',    null,          'Banrural',          60, 40, 19500, 'Q', '18 días',           true,  25, 2000, 2, 'open', null,                  '2026-03-02T00:00:00Z'),
  ('9',  '¿Firmará Guatemala un nuevo TLC con la Unión Europea antes de diciembre?',                             'geopolitica', null,          'Cámara de Comercio',29, 71, 11000, 'Q', '45 días',           false, 25,  500, 1, 'open', null,                  '2026-02-10T00:00:00Z'),
  ('10', '¿Habrá cambio de gobierno en Venezuela antes de 2027?',                                                'geopolitica', null,          'El Periódico',      35, 65, 27000, 'Q', '60 días',           true,  25,  500, 1, 'open', null,                  '2026-03-03T00:00:00Z'),
  ('11', '¿Superará "Ixcanul 2" el millón de espectadores en Centroamérica?',                                   'cultura',     null,          'Cinépolis',         53, 47,  8400, 'Q', '20 días',           false, 25,  500, 1, 'open', null,                  '2026-02-05T00:00:00Z'),
  ('12', '¿Ganará un artista guatemalteco en los Latin Grammy 2026?',                                            'cultura',     null,          'Tigo',              47, 53, 16200, 'Q', '90 días',           false, 25,  500, 1, 'open', null,                  '2026-01-20T00:00:00Z'),
  ('13', '¿Llegará Starlink a cobertura rural en Guatemala antes de julio 2026?',                                'tecnologia',  null,          'Claro',             61, 39, 13700, 'Q', '14 días',           true,  25,  500, 1, 'open', null,                  '2026-03-01T00:00:00Z'),
  ('14', '¿Lanzará una fintech centroamericana su propio stablecoin en 2026?',                                   'tecnologia',  null,          'BAC Credomatic',    33, 67,  9800, 'Q', '60 días',           false, 25,  500, 1, 'open', null,                  '2026-02-18T00:00:00Z'),
  ('15', '¿Superará el tipo de cambio Q/$ los Q8.20 en marzo 2026?',                                            'finanzas',    null,          'BAC Credomatic',    48, 52, 38000, 'Q', '6 días',            true,  25, 2000, 2, 'open', '2026-03-10T23:59:00Z', '2026-03-03T00:00:00Z'),
  ('16', '¿Superará el índice bursátil guatemalteco su máximo histórico en 2026?',                               'finanzas',    null,          'Banrural',          42, 58, 24500, 'Q', '90 días',           false, 25, 2000, 2, 'open', null,                  '2026-02-01T00:00:00Z'),
  ('3',  '¿Superará la lluvia acumulada en Izabal los 200mm en abril 2026?',                                    'otro',        'parametrico', 'INSIVUMEH',         73, 27, 18500, 'Q', '¡Cierra en 1 hora!',true,  25, 2000, 2, 'open', '2026-03-04T15:00:00Z', '2026-03-04T00:00:00Z'),
  ('17', '¿Cumplirá el Alcalde de Guatemala su promesa de 500 nuevas cámaras de seguridad?',                    'otro',        'reputacion',  'Nómada',            31, 69,  9200, 'Q', '120 días',          false, 25,  500, 1, 'open', null,                  '2026-02-12T00:00:00Z'),
  ('18', '¿Caerá la tasa de deserción escolar en Alta Verapaz más de 10% en 2026?',                             'otro',        'bono',        'Min. de Educación', 44, 56, 15000, 'Q', '180 días',          false, 25,  500, 1, 'open', null,                  '2026-01-15T00:00:00Z'),
  ('19', '¿Registrará el CONRED alerta volcánica nivel 4 en Santiaguito antes de junio?',                       'otro',        'parametrico', 'CONRED',            58, 42,  7800, 'Q', '40 días',           true,  25,  500, 1, 'open', null,                  '2026-03-02T00:00:00Z')
on conflict (id) do nothing;

-- ─── PREDICTIONS ─────────────────────────────────────────────────────────────

create table if not exists public.predictions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  event_id        text not null references public.events(id),
  side            text not null check (side in ('yes', 'no')),
  amount          integer not null check (amount > 0),
  potential_cobro numeric(10,2) not null,
  status          text not null default 'active' check (status in ('active', 'won', 'lost')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  unique (user_id, event_id)
);

alter table public.predictions enable row level security;

create policy "Users can read own predictions"
  on public.predictions for select
  using (auth.uid() = user_id);

create policy "Users can insert own predictions"
  on public.predictions for insert
  with check (auth.uid() = user_id);

-- ─── cast_vote RPC ────────────────────────────────────────────────────────────
-- Atomic: checks balance, inserts prediction, decrements balance

create or replace function public.cast_vote(
  p_event_id      text,
  p_side          text,
  p_amount        integer,
  p_potential_cobro numeric
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_balance integer;
  v_pred_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Check balance
  select balance into v_balance from profiles where id = v_user_id for update;
  if v_balance < p_amount then
    raise exception 'Saldo insuficiente';
  end if;

  -- Insert prediction
  insert into predictions (user_id, event_id, side, amount, potential_cobro)
  values (v_user_id, p_event_id, p_side, p_amount, p_potential_cobro)
  returning id into v_pred_id;

  -- Deduct balance + increment total_predictions
  update profiles
  set balance = balance - p_amount,
      total_predictions = total_predictions + 1
  where id = v_user_id;

  return v_pred_id;
end;
$$;
