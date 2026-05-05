-- ============================================================
--  Migration: admin_actions audit table
--  Date: 2026-05-04
--
--  PROBLEM:
--    Today, admin financial actions leave traces but no
--    consolidated audit trail:
--      - settle_event writes a 'win'/'loss'/'skim' row to
--        balance_ledger per affected user, but doesn't record
--        WHO settled or WHY.
--      - void_event records the reason on the events row
--        (events.voided_reason) but that's per-event and lives
--        on the target, not on a separate trail.
--      - admin_adjust_balance has no record of who adjusted
--        whose balance and for what reason.
--    Reconstructing "who did what to whom and why" months from
--    now is impossible without grepping migrations and joining
--    five tables.
--
--  WHAT THIS MIGRATION ADDS:
--    1. admin_actions table — append-only audit log.
--       One row per admin write action. Every row has actor_id,
--       action_type, target type/id, free-text reason, and a
--       jsonb payload for action-specific before/after data.
--    2. RLS so only admins can read it; inserts only via the
--       SECURITY DEFINER helper.
--    3. log_admin_action(...) helper function that admin RPCs
--       call to emit a row.
--    4. Patches void_event() to call log_admin_action with the
--       refund summary on every void.
--    5. Patches settle_event() the same way. The 200-line body
--       isn't rewritten — just appended to with one
--       log_admin_action call before the RETURN.
--
--  Idempotency: CREATE OR REPLACE throughout, idempotent
--  CREATE TABLE / CREATE POLICY. Safe to re-run.
-- ============================================================

BEGIN;

-- ── 1. The audit table ──

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid          NOT NULL REFERENCES auth.users(id),
  action_type   text          NOT NULL,
  target_type   text          NOT NULL,
  target_id     text,
  reason        text,
  payload       jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_actions IS
  'Append-only audit trail of admin write actions. One row per RPC call. '
  'payload holds action-specific before/after data (jsonb).';

COMMENT ON COLUMN public.admin_actions.action_type IS
  'Discriminator: ''void_event'' | ''settle_event'' | ''adjust_balance'' | ''update_config'' | ''create_event'' | ''edit_event'' | ''lp_deposit'' | ''bulk_archive''';

COMMENT ON COLUMN public.admin_actions.target_type IS
  '''event'' | ''user'' | ''config'' | ''lp_deposit''';

CREATE INDEX IF NOT EXISTS admin_actions_actor_idx
  ON public.admin_actions(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_actions_target_idx
  ON public.admin_actions(target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_actions_action_type_idx
  ON public.admin_actions(action_type, created_at DESC);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- Admins can read the full log. Nobody else can see it.
DROP POLICY IF EXISTS admin_read_admin_actions ON public.admin_actions;
CREATE POLICY admin_read_admin_actions ON public.admin_actions
  FOR SELECT
  USING (public.is_admin(auth.uid()));

-- No INSERT / UPDATE / DELETE policies — the table is append-only
-- via SECURITY DEFINER functions. Direct writes are blocked.

-- ── 2. log_admin_action helper ──
--    Wraps the INSERT so individual RPCs don't repeat the same
--    boilerplate. SECURITY DEFINER so it can bypass RLS for the
--    insert (the table has no INSERT policy).

CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action_type  text,
  p_target_type  text,
  p_target_id    text,
  p_reason       text,
  p_payload      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'log_admin_action: no authenticated user';
  END IF;

  INSERT INTO public.admin_actions
    (actor_id, action_type, target_type, target_id, reason, payload)
  VALUES
    (auth.uid(), p_action_type, p_target_type, p_target_id, p_reason, p_payload)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_admin_action(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, text, jsonb) TO authenticated;

-- ── 3. Patch void_event to write an audit row ──
--    Mirror of 20260502_void_event.sql but with a log_admin_action
--    call appended before the RETURN. Body is otherwise identical;
--    keeping them in sync is a manual obligation when either
--    file changes.

CREATE OR REPLACE FUNCTION public.void_event(
  p_event_id text,
  p_reason   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event_q          text;
  v_event_status     text;
  v_pos              record;
  v_lp               record;
  v_user_bal         numeric(12,2);
  v_pos_refunded     int := 0;
  v_pos_total        numeric(12,2) := 0;
  v_lp_refunded      int := 0;
  v_lp_total         numeric(12,2) := 0;
  v_refund_amount    numeric(12,2);
  v_summary          jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'void_event: reason is required (min 3 chars)';
  END IF;

  SELECT status, question
    INTO v_event_status, v_event_q
  FROM events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'void_event: event % not found', p_event_id;
  END IF;

  IF v_event_status NOT IN ('open','closed','private','active') THEN
    RAISE EXCEPTION 'void_event: cannot void event in status %', v_event_status;
  END IF;

  -- Refund every active position.
  FOR v_pos IN
    SELECT id, user_id, gross_amount
    FROM positions
    WHERE event_id = p_event_id AND status = 'active'
    FOR UPDATE
  LOOP
    v_refund_amount := ROUND(v_pos.gross_amount, 2);

    UPDATE positions SET status = 'voided' WHERE id = v_pos.id;

    UPDATE profiles
    SET balance = balance + v_refund_amount
    WHERE id = v_pos.user_id
    RETURNING balance INTO v_user_bal;

    INSERT INTO public.balance_ledger
      (user_id, type, amount, balance_after, label, reference_id)
    VALUES
      (v_pos.user_id, 'refund', v_refund_amount, v_user_bal,
       'Anulado: ' || COALESCE(v_event_q, p_event_id),
       v_pos.id::text);

    INSERT INTO market_transactions
      (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, tx_type, success)
    VALUES
      (v_pos.id, p_event_id, v_pos.user_id,
       v_refund_amount, 0, -v_refund_amount, 'refund', true);

    v_pos_refunded := v_pos_refunded + 1;
    v_pos_total    := v_pos_total + v_refund_amount;
  END LOOP;

  UPDATE public.predictions
  SET status = 'voided', resolved_at = now()
  WHERE event_id = p_event_id AND status = 'active';

  -- Refund every active LP deposit (principal only).
  FOR v_lp IN
    SELECT id, user_id, amount
    FROM lp_deposits
    WHERE event_id = p_event_id AND status = 'active'
    FOR UPDATE
  LOOP
    v_refund_amount := ROUND(v_lp.amount, 2);

    UPDATE lp_deposits
    SET status = 'returned', payout = v_refund_amount
    WHERE id = v_lp.id;

    UPDATE profiles
    SET balance = balance + v_refund_amount
    WHERE id = v_lp.user_id
    RETURNING balance INTO v_user_bal;

    INSERT INTO public.balance_ledger
      (user_id, type, amount, balance_after, label, reference_id)
    VALUES
      (v_lp.user_id, 'lp_return', v_refund_amount, v_user_bal,
       'LP devolución (anulado): ' || COALESCE(v_event_q, p_event_id),
       v_lp.id::text);

    v_lp_refunded := v_lp_refunded + 1;
    v_lp_total    := v_lp_total + v_refund_amount;
  END LOOP;

  UPDATE event_markets
  SET status = 'voided', updated_at = now()
  WHERE event_id = p_event_id;

  UPDATE public.events
  SET status        = 'voided',
      voided_at     = now(),
      voided_reason = p_reason
  WHERE id = p_event_id;

  -- Build the summary jsonb (also returned to the caller).
  v_summary := jsonb_build_object(
    'event_id',           p_event_id,
    'event_question',     v_event_q,
    'reason',             p_reason,
    'positions_refunded', v_pos_refunded,
    'positions_total',    v_pos_total,
    'lp_refunded',        v_lp_refunded,
    'lp_total',           v_lp_total,
    'grand_total',        v_pos_total + v_lp_total,
    'previous_status',    v_event_status
  );

  -- ▸ AUDIT LOG ROW
  PERFORM public.log_admin_action(
    'void_event',     -- action_type
    'event',          -- target_type
    p_event_id,       -- target_id
    p_reason,         -- reason
    v_summary         -- payload (full impact summary)
  );

  RETURN v_summary;
END;
$$;

REVOKE ALL ON FUNCTION public.void_event(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_event(text, text) TO authenticated;

-- ── 4. Patch settle_event to write an audit row ──
--    Mirror of 20260501_settle_event_ledger.sql plus a
--    log_admin_action call before RETURN.

CREATE OR REPLACE FUNCTION public.settle_event(
  p_event_id text,
  p_result   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_payouts        jsonb := '[]'::jsonb;
  v_row            record;
  v_skim_pct       numeric(6,4) := 0.05;
  v_gross_payout   numeric(12,2);
  v_skim_amount    numeric(12,2);
  v_net_payout     numeric(12,2);
  v_total_skimmed  numeric(12,2) := 0;
  v_treasury_id    uuid;
  v_treasury_bal   numeric(12,2);
  v_winner_bal     numeric(12,2);
  v_event_q        text;
  v_winners_count  int := 0;
  v_losers_count   int := 0;
  v_summary        jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;

  SELECT COALESCE(value, 5) / 100 INTO v_skim_pct
  FROM platform_config WHERE key = 'resolution_skim_pct';

  SELECT value_text::uuid INTO v_treasury_id
  FROM platform_config WHERE key = 'treasury_account_id';

  IF v_treasury_id IS NULL THEN
    RAISE EXCEPTION 'settle_event: treasury_account_id missing from platform_config';
  END IF;

  UPDATE event_markets
  SET status = 'settled', result = p_result, updated_at = now()
  WHERE event_id = p_event_id AND status = 'open';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Market not open or not found');
  END IF;

  SELECT question INTO v_event_q FROM events WHERE id = p_event_id;

  FOR v_row IN
    SELECT id, user_id, side, payout_if_win
    FROM positions
    WHERE event_id = p_event_id AND status = 'active'
  LOOP
    IF v_row.side = p_result THEN
      v_gross_payout := ROUND(v_row.payout_if_win, 2);
      v_skim_amount  := ROUND(v_gross_payout * v_skim_pct, 2);
      v_net_payout   := v_gross_payout - v_skim_amount;
      v_total_skimmed := v_total_skimmed + v_skim_amount;
      v_winners_count := v_winners_count + 1;

      UPDATE positions SET status = 'won' WHERE id = v_row.id;

      UPDATE profiles
      SET balance             = balance + v_net_payout,
          correct_predictions = correct_predictions + 1,
          total_cobrado       = total_cobrado + v_net_payout
      WHERE id = v_row.user_id
      RETURNING balance INTO v_winner_bal;

      INSERT INTO public.balance_ledger
        (user_id, type, amount, balance_after, label, reference_id)
      VALUES
        (v_row.user_id, 'win', v_net_payout, v_winner_bal,
         'Cobro: ' || COALESCE(v_event_q, p_event_id),
         v_row.id::text);

      UPDATE public.predictions
      SET status = 'won', resolved_at = now()
      WHERE event_id = p_event_id
        AND user_id = v_row.user_id
        AND status = 'active';

      INSERT INTO market_transactions
        (position_id, event_id, user_id, gross_amount, fee_deducted, net_to_pool, tx_type, success)
      VALUES
        (v_row.id, p_event_id, v_row.user_id,
         v_gross_payout, v_skim_amount, 0, 'payout', true);

      v_payouts := v_payouts || jsonb_build_object(
        'user_id',     v_row.user_id,
        'position_id', v_row.id,
        'gross',       v_gross_payout,
        'skim',        v_skim_amount,
        'net',         v_net_payout,
        'outcome',     'won'
      );

    ELSE
      v_losers_count := v_losers_count + 1;
      UPDATE positions SET status = 'lost' WHERE id = v_row.id;

      SELECT balance INTO v_winner_bal FROM profiles WHERE id = v_row.user_id;

      INSERT INTO public.balance_ledger
        (user_id, type, amount, balance_after, label, reference_id)
      VALUES
        (v_row.user_id, 'loss', 0, v_winner_bal,
         'Esta vez no: ' || COALESCE(v_event_q, p_event_id),
         v_row.id::text);

      UPDATE public.predictions
      SET status = 'lost', resolved_at = now()
      WHERE event_id = p_event_id
        AND user_id = v_row.user_id
        AND status = 'active';

      v_payouts := v_payouts || jsonb_build_object(
        'user_id',     v_row.user_id,
        'position_id', v_row.id,
        'payout',      0,
        'outcome',     'lost'
      );
    END IF;
  END LOOP;

  IF v_total_skimmed > 0 THEN
    UPDATE public.profiles
    SET balance = balance + v_total_skimmed
    WHERE id = v_treasury_id
    RETURNING balance INTO v_treasury_bal;

    INSERT INTO public.balance_ledger
      (user_id, type, amount, balance_after, label, reference_id)
    VALUES
      (v_treasury_id, 'skim', v_total_skimmed, v_treasury_bal,
       'Resolución: ' || COALESCE(v_event_q, p_event_id),
       p_event_id);
  END IF;

  UPDATE public.events
  SET status = 'resolved', result = p_result
  WHERE id = p_event_id;

  v_summary := jsonb_build_object(
    'result',          p_result,
    'event_question',  v_event_q,
    'payouts',         v_payouts,
    'winners_count',   v_winners_count,
    'losers_count',    v_losers_count,
    'total_skimmed',   v_total_skimmed,
    'skim_pct',        v_skim_pct
  );

  -- ▸ AUDIT LOG ROW
  PERFORM public.log_admin_action(
    'settle_event',
    'event',
    p_event_id,
    'Resolved as ' || p_result,
    v_summary
  );

  RETURN v_summary;
END;
$$;

COMMIT;

-- ============================================================
--  Verification (after applying):
--    -- Sanity: function + table exist
--    SELECT proname FROM pg_proc
--    WHERE proname IN ('log_admin_action');
--    SELECT tablename FROM pg_tables
--    WHERE schemaname='public' AND tablename='admin_actions';
--
--    -- Test: void a fresh test event, then check the audit row
--    SELECT public.void_event('<event-id>', 'Test audit row.');
--    SELECT id, actor_id, action_type, target_type, target_id, reason,
--           payload->>'grand_total' AS refunded
--    FROM public.admin_actions
--    ORDER BY created_at DESC LIMIT 5;
-- ============================================================
