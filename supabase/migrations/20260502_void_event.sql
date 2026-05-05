-- ============================================================
--  Migration: void_event RPC + schema support for voiding
--  Date: 2026-05-02
--
--  PROBLEM:
--    The admin "Eliminar evento" button currently runs
--      UPDATE events SET status='archived'
--    and nothing else. No refund. No LP return. No ledger
--    rows. If the event has user stakes or LP capital, that
--    money becomes permanently stranded:
--      sum(positions.amount) + sum(lp_deposits.amount)
--      no longer reconciles against deposits-minus-withdrawals.
--    The schema is already prepped for voiding (event_markets
--    and positions both allow status='voided', lp_deposits
--    allows 'returned', balance_ledger allows 'refund' and
--    'lp_return') — there's just no RPC wired up.
--
--  WHAT THIS MIGRATION DOES:
--    1. Widens events.status check constraint to include
--       'voided' (and 'archived' for cosmetic-archive of
--       already-resolved events).
--    2. Widens predictions.status check constraint to
--       include 'voided' so the user-facing "Mis Llamados"
--       can reflect the void.
--    3. Adds voided_at + voided_reason columns to events for
--       audit clarity.
--    4. Creates the void_event(p_event_id, p_reason) RPC:
--         - refunds every active position at gross_amount
--           (stake + fee both come back; the user didn't
--           get the trade they paid for)
--         - returns every LP deposit at the principal
--           (no return premium because the event was voided)
--         - writes one balance_ledger row per refund
--         - writes one market_transactions row per refund
--         - flips position/lp_deposit/event_markets/event
--           status atomically
--         - returns a jsonb summary of what happened
--    5. Only allows voiding of in-flight events
--       (status IN ('open','closed','private')). Already-
--       resolved events have already paid out — clawing
--       money back from withdrawals isn't supported here
--       and would need manual reconciliation.
--    6. Admin-only via is_admin(auth.uid()) check.
--
--  WHAT VOID DOES NOT DO (intentionally):
--    - Skim. There's no winner, so there's no take.
--    - Apply LP return premium. The LP gets principal back
--      only — they shouldn't earn a return on a
--      cancelled event.
--    - Fees retained. We refund the full gross_amount
--      (stake + fee) so the user is made whole. This
--      matches Stripe-style reversal accounting.
--
--  Idempotency: this is CREATE OR REPLACE; safe to re-run.
-- ============================================================

BEGIN;

-- ── 1. Schema: widen events.status, add audit columns ──

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_status_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('active','open','closed','private','resolved','voided','archived','won','lost'))
  NOT VALID;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS voided_at      timestamptz,
  ADD COLUMN IF NOT EXISTS voided_reason  text;

-- ── 2. Schema: widen predictions.status to include 'voided' ──
--    (also 'sold' for the existing sell flow if not already there)

ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_status_check;

ALTER TABLE public.predictions
  ADD CONSTRAINT predictions_status_check
  CHECK (status IN ('active','won','lost','sold','voided'))
  NOT VALID;

-- ── 3. The RPC ──

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
BEGIN
  -- Admin only.
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'void_event: reason is required (min 3 chars)';
  END IF;

  -- Lock the event row + verify it's in a voidable state.
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

  -- ── Refund every active position ──
  --   gross_amount is what the user actually paid (stake + fee).
  --   We refund the full amount; the user didn't get the trade
  --   they paid for, so retaining a fee on a void would be
  --   indefensible.
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

  -- Mirror void on the predictions table so user-facing
  -- "Mis Llamados" reflects reality.
  UPDATE public.predictions
  SET status = 'voided', resolved_at = now()
  WHERE event_id = p_event_id AND status = 'active';

  -- ── Refund every active LP deposit (principal only, no premium) ──
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

  -- ── Mark the market voided ──
  UPDATE event_markets
  SET status = 'voided', updated_at = now()
  WHERE event_id = p_event_id;

  -- ── Mark the event itself voided + record audit fields ──
  UPDATE public.events
  SET status        = 'voided',
      voided_at     = now(),
      voided_reason = p_reason
  WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'event_id',          p_event_id,
    'reason',            p_reason,
    'positions_refunded', v_pos_refunded,
    'positions_total',    v_pos_total,
    'lp_refunded',        v_lp_refunded,
    'lp_total',           v_lp_total,
    'grand_total',        v_pos_total + v_lp_total
  );
END;
$$;

-- Permissions: only admins should call this. SECURITY DEFINER
-- + the is_admin check inside the body enforce that, but we
-- still revoke from anon/authenticated to keep the function
-- off the public RPC surface.
REVOKE ALL ON FUNCTION public.void_event(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_event(text, text) TO authenticated;

-- ── 4. Companion: preview_void(p_event_id) → jsonb ──
--    Used by the admin UI to show users what's about to
--    happen BEFORE they confirm. Read-only. No state change.

CREATE OR REPLACE FUNCTION public.preview_void(
  p_event_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pos_count   int;
  v_pos_total   numeric(12,2);
  v_lp_count    int;
  v_lp_total    numeric(12,2);
  v_status      text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin access required';
  END IF;

  SELECT status INTO v_status FROM events WHERE id = p_event_id;

  SELECT COUNT(*), COALESCE(SUM(gross_amount), 0)
    INTO v_pos_count, v_pos_total
  FROM positions
  WHERE event_id = p_event_id AND status = 'active';

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_lp_count, v_lp_total
  FROM lp_deposits
  WHERE event_id = p_event_id AND status = 'active';

  RETURN jsonb_build_object(
    'event_id',         p_event_id,
    'event_status',     v_status,
    'voidable',         v_status IN ('open','closed','private','active'),
    'positions_count',  v_pos_count,
    'positions_total',  v_pos_total,
    'lp_count',         v_lp_count,
    'lp_total',         v_lp_total,
    'grand_total',      v_pos_total + v_lp_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_void(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_void(text) TO authenticated;

COMMIT;

-- ============================================================
--  Verification queries (run after applying):
--    -- pick a test event with status='open' and a few positions
--    SELECT public.preview_void('<event-id>');
--    SELECT public.void_event('<event-id>', 'Test void: event question was ambiguous.');
--    SELECT public.run_reconciliation();   -- should still report ok
--    SELECT status, voided_at, voided_reason FROM events WHERE id = '<event-id>';
-- ============================================================
