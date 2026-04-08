-- ============================================================
--  b1n0 Pricing Engine — tables + RPC functions
--  All financial values: NUMERIC(14,4)  (no floating point)
-- ============================================================

-- ── Tables ─────────────────────────────────────────────────

create table if not exists public.event_markets (
  event_id        text        primary key references public.events(id) on delete cascade,
  pool_total      numeric(14,4) not null default 0,
  pool_committed  numeric(14,4) not null default 0,
  yes_shares      numeric(14,4) not null default 500,
  no_shares       numeric(14,4) not null default 500,
  spread_enabled  boolean     not null default true,
  status          text        not null default 'open'
                    check (status in ('open', 'settled', 'voided')),
  result          text        check (result in ('yes', 'no')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.positions (
  id                uuid        primary key default gen_random_uuid(),
  event_id          text        not null references public.events(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  side              text        not null check (side in ('yes', 'no')),
  contracts         numeric(14,4) not null,
  price_at_purchase numeric(14,4) not null,
  payout_if_win     numeric(14,4) not null,
  fee_paid          numeric(14,4) not null,
  gross_amount      numeric(14,4) not null,
  status            text        not null default 'active'
                      check (status in ('active', 'won', 'lost', 'voided')),
  created_at        timestamptz not null default now()
);

create table if not exists public.market_transactions (
  id              uuid        primary key default gen_random_uuid(),
  position_id     uuid        references public.positions(id),
  event_id        text        not null references public.events(id) on delete cascade,
  user_id         uuid        not null references auth.users(id),
  gross_amount    numeric(14,4) not null,
  fee_deducted    numeric(14,4) not null,
  net_to_pool     numeric(14,4) not null,
  tx_type         text        not null check (tx_type in ('purchase', 'payout', 'refund')),
  success         boolean     not null default true,
  failure_reason  text,
  created_at      timestamptz not null default now()
);

-- Indexes
create index if not exists positions_event_id_idx on public.positions(event_id);
create index if not exists positions_user_id_idx  on public.positions(user_id);
create index if not exists market_tx_event_id_idx on public.market_transactions(event_id);

-- ── RLS ────────────────────────────────────────────────────

alter table public.event_markets      enable row level security;
alter table public.positions          enable row level security;
alter table public.market_transactions enable row level security;

-- event_markets: public read, admin write
create policy "Public read event_markets"
  on public.event_markets for select using (true);

create policy "Admins manage event_markets"
  on public.event_markets for all
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ));

-- positions: users see own, admins see all
create policy "Users read own positions"
  on public.positions for select
  using (user_id = auth.uid());

create policy "Admins read all positions"
  on public.positions for select
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ));

-- market_transactions: users see own, admins see all
create policy "Users read own market_transactions"
  on public.market_transactions for select
  using (user_id = auth.uid());

create policy "Admins read all market_transactions"
  on public.market_transactions for select
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ));

-- ── RPC: initialize_market ─────────────────────────────────

create or replace function public.initialize_market(
  p_event_id          text,
  p_pool_total        numeric,
  p_initial_yes_pct   integer  default 50,
  p_spread_enabled    boolean  default true,
  p_synthetic_shares  integer  default 1000
)
returns public.event_markets
language plpgsql security definer
as $$
declare
  v_yes  numeric(14,4);
  v_no   numeric(14,4);
  v_row  public.event_markets;
begin
  -- admin only
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Unauthorized';
  end if;

  v_yes := round((p_initial_yes_pct::numeric / 100) * p_synthetic_shares, 4);
  v_no  := round(p_synthetic_shares - v_yes, 4);

  insert into public.event_markets
    (event_id, pool_total, pool_committed, yes_shares, no_shares, spread_enabled, status)
  values
    (p_event_id, round(p_pool_total, 4), 0, v_yes, v_no, p_spread_enabled, 'open')
  on conflict (event_id) do update
    set pool_total     = excluded.pool_total,
        yes_shares     = excluded.yes_shares,
        no_shares      = excluded.no_shares,
        spread_enabled = excluded.spread_enabled,
        updated_at     = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ── RPC: get_pool_status ───────────────────────────────────

create or replace function public.get_pool_status(p_event_id text)
returns table (
  total      numeric,
  committed  numeric,
  remaining  numeric,
  pct_used   numeric
)
language sql security definer
as $$
  select
    pool_total,
    pool_committed,
    round(pool_total - pool_committed, 4),
    case when pool_total > 0
         then round(pool_committed / pool_total, 4)
         else 0
    end
  from public.event_markets
  where event_id = p_event_id;
$$;

-- ── RPC: get_current_prices ────────────────────────────────

create or replace function public.get_current_prices(p_event_id text)
returns table (yes numeric, no numeric)
language sql security definer
as $$
  select
    round(yes_shares / (yes_shares + no_shares), 4),
    round(no_shares  / (yes_shares + no_shares), 4)
  from public.event_markets
  where event_id = p_event_id;
$$;

-- ── RPC: get_quoted_prices ─────────────────────────────────

create or replace function public.get_quoted_prices(p_event_id text)
returns table (yes numeric, no numeric)
language sql security definer
as $$
  select
    case when spread_enabled
         then round(least(yes_shares / (yes_shares + no_shares) + 0.02, 0.99), 4)
         else round(yes_shares / (yes_shares + no_shares), 4)
    end,
    case when spread_enabled
         then round(least(no_shares / (yes_shares + no_shares) + 0.02, 0.99), 4)
         else round(no_shares / (yes_shares + no_shares), 4)
    end
  from public.event_markets
  where event_id = p_event_id;
$$;

-- ── RPC: execute_purchase ──────────────────────────────────

create or replace function public.execute_purchase(
  p_event_id    text,
  p_user_id     uuid,
  p_side        text,
  p_gross       numeric
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_market       public.event_markets%rowtype;
  v_price        numeric(14,4);
  v_fee          numeric(14,4);
  v_net          numeric(14,4);
  v_contracts    numeric(14,4);
  v_payout       numeric(14,4);
  v_committed    numeric(14,4);
  v_position_id  uuid;
begin
  -- Lock the market row
  select * into v_market
  from public.event_markets
  where event_id = p_event_id
  for update;

  if not found then
    return jsonb_build_object('error', 'Market not found');
  end if;

  if v_market.status <> 'open' then
    return jsonb_build_object('error', 'Market is ' || v_market.status);
  end if;

  -- Quoted price (with optional spread)
  if p_side = 'yes' then
    v_price := case when v_market.spread_enabled
                    then least(round(v_market.yes_shares / (v_market.yes_shares + v_market.no_shares) + 0.02, 4), 0.99)
                    else round(v_market.yes_shares / (v_market.yes_shares + v_market.no_shares), 4)
               end;
  else
    v_price := case when v_market.spread_enabled
                    then least(round(v_market.no_shares / (v_market.yes_shares + v_market.no_shares) + 0.02, 4), 0.99)
                    else round(v_market.no_shares / (v_market.yes_shares + v_market.no_shares), 4)
               end;
  end if;

  -- Fee + net
  v_fee       := round(p_gross * 0.025, 4);
  v_net       := round(p_gross - v_fee, 4);
  v_contracts := round(v_net / v_price, 4);
  v_payout    := v_contracts;

  -- Pool cap safety
  v_committed := v_market.pool_committed + v_payout;
  if v_committed > v_market.pool_total then
    return jsonb_build_object('error', 'Pool cap reached');
  end if;

  -- Insert position
  insert into public.positions
    (event_id, user_id, side, contracts, price_at_purchase, payout_if_win, fee_paid, gross_amount)
  values
    (p_event_id, p_user_id, p_side, v_contracts, v_price, v_payout, v_fee, round(p_gross, 4))
  returning id into v_position_id;

  -- Log transaction
  insert into public.market_transactions
    (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, tx_type)
  values
    (v_position_id, p_event_id, p_user_id, round(p_gross, 4), v_fee, v_net, 'purchase');

  -- Update market state
  update public.event_markets set
    pool_committed = round(pool_committed + v_payout, 4),
    yes_shares     = case when p_side = 'yes'
                          then round(yes_shares + v_contracts, 4)
                          else yes_shares
                     end,
    no_shares      = case when p_side = 'no'
                          then round(no_shares + v_contracts, 4)
                          else no_shares
                     end,
    updated_at     = now()
  where event_id = p_event_id;

  return jsonb_build_object(
    'position_id',       v_position_id,
    'contracts',         v_contracts,
    'price_at_purchase', v_price,
    'payout_if_win',     v_payout,
    'fee_paid',          v_fee,
    'gross_amount',      p_gross
  );
end;
$$;

-- ── RPC: settle_event ──────────────────────────────────────

create or replace function public.settle_event(
  p_event_id text,
  p_result   text   -- 'yes' or 'no'
)
returns jsonb
language plpgsql security definer
as $$
declare
  v_payouts jsonb := '[]'::jsonb;
  v_row     record;
begin
  -- admin only
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Unauthorized';
  end if;

  -- Mark market settled
  update public.event_markets
  set status = 'settled', result = p_result, updated_at = now()
  where event_id = p_event_id and status = 'open';

  if not found then
    return jsonb_build_object('error', 'Market not open or not found');
  end if;

  -- Settle positions + build payout list
  for v_row in
    select id, user_id, side, payout_if_win
    from public.positions
    where event_id = p_event_id and status = 'active'
  loop
    if v_row.side = p_result then
      update public.positions set status = 'won' where id = v_row.id;

      insert into public.market_transactions
        (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, tx_type)
      values
        (v_row.id, p_event_id, v_row.user_id, v_row.payout_if_win, 0, 0, 'payout');

      v_payouts := v_payouts || jsonb_build_object(
        'user_id',    v_row.user_id,
        'position_id', v_row.id,
        'payout',     v_row.payout_if_win,
        'outcome',    'won'
      );
    else
      update public.positions set status = 'lost' where id = v_row.id;

      v_payouts := v_payouts || jsonb_build_object(
        'user_id',    v_row.user_id,
        'position_id', v_row.id,
        'payout',     0,
        'outcome',    'lost'
      );
    end if;
  end loop;

  return jsonb_build_object('result', p_result, 'payouts', v_payouts);
end;
$$;

