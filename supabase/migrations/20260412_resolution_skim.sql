-- ============================================================
--  Migration: resolution_skim — platform take at settlement
--
--  Adds a configurable "resolution skim" that takes a percentage
--  of each winner's payout at settlement time. Revenue goes to
--  the treasury account (00000000-0000-0000-0000-000000000001).
--
--  This is the parimutuel takeout model: pool shrinks by X%
--  before distributing to winners. Losers are unaffected.
--
--  Default: 5% (configurable in admin → Tarifas de plataforma)
-- ============================================================

-- 1. Add the config key
INSERT INTO public.platform_config (key, value, label)
VALUES ('resolution_skim_pct', 5, 'Comisión de resolución (%)')
ON CONFLICT (key) DO NOTHING;

-- 2. Add 'skim' to balance_ledger types
--    Using NOT VALID so existing rows are not re-validated (they may have
--    types from before the constraint existed). New inserts will be checked.
ALTER TABLE public.balance_ledger
  DROP CONSTRAINT IF EXISTS balance_ledger_type_check;

ALTER TABLE public.balance_ledger
  ADD CONSTRAINT balance_ledger_type_check
  CHECK (type IN ('deposit','withdraw','vote','win','loss','refund','sell','lp_deposit','lp_return','fee_revenue','sweep','skim'))
  NOT VALID;


-- 3. Replace settle_predictions with skim-aware version
DROP FUNCTION IF EXISTS public.settle_predictions(text, text);

CREATE OR REPLACE FUNCTION public.settle_predictions(
  p_event_id text,
  p_result   text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count           integer := 0;
  v_row             record;
  v_new_balance     numeric(12,2);
  v_event_q         text;
  v_skim_pct        numeric(6,4) := 0.05;   -- default 5%
  v_gross_payout    numeric(12,2);
  v_skim_amount     numeric(12,2);
  v_net_payout      numeric(12,2);
  v_total_skimmed   numeric(12,2) := 0;
  v_treasury_id     uuid := '00000000-0000-0000-0000-000000000001';
  v_treasury_bal    numeric(12,2);
BEGIN
  -- Admin only
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Load resolution skim rate from platform_config
  SELECT COALESCE(value, 5) / 100 INTO v_skim_pct
  FROM platform_config WHERE key = 'resolution_skim_pct';

  -- Fetch event question for ledger labels
  SELECT question INTO v_event_q FROM public.events WHERE id = p_event_id;

  -- Process each active prediction for this event
  FOR v_row IN
    SELECT id, user_id, side, potential_cobro
    FROM public.predictions
    WHERE event_id = p_event_id AND status = 'active'
  LOOP
    IF v_row.side = p_result OR v_row.side = (p_result || '::yes') THEN
      -- Winner: apply resolution skim
      v_gross_payout := FLOOR(v_row.potential_cobro)::numeric(12,2);
      v_skim_amount  := ROUND(v_gross_payout * v_skim_pct, 2);
      v_net_payout   := v_gross_payout - v_skim_amount;
      v_total_skimmed := v_total_skimmed + v_skim_amount;

      UPDATE public.predictions
      SET status = 'won', resolved_at = now()
      WHERE id = v_row.id;

      -- Credit NET payout (after skim) to winner
      UPDATE public.profiles
      SET balance             = balance + v_net_payout,
          correct_predictions = correct_predictions + 1,
          total_cobrado       = total_cobrado + v_net_payout
      WHERE id = v_row.user_id
      RETURNING balance INTO v_new_balance;

      -- Ledger entry for win (shows net amount)
      INSERT INTO public.balance_ledger (user_id, type, amount, balance_after, label, reference_id)
      VALUES (v_row.user_id, 'win', v_net_payout, v_new_balance,
              '¡Lo sabías! ' || COALESCE(v_event_q, p_event_id), v_row.id::text);

    ELSE
      -- Loser (unchanged)
      UPDATE public.predictions
      SET status = 'lost', resolved_at = now()
      WHERE id = v_row.id;

      SELECT balance INTO v_new_balance FROM public.profiles WHERE id = v_row.user_id;

      INSERT INTO public.balance_ledger (user_id, type, amount, balance_after, label, reference_id)
      VALUES (v_row.user_id, 'loss', 0, v_new_balance,
              'Esta vez no: ' || COALESCE(v_event_q, p_event_id), v_row.id::text);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- Mark winning positions
  UPDATE public.positions
  SET status = 'won'
  WHERE event_id = p_event_id
    AND (status IS NULL OR status = 'active')
    AND (side = p_result OR side = (p_result || '::yes'));

  -- Mark losing positions
  UPDATE public.positions
  SET status = 'lost'
  WHERE event_id = p_event_id
    AND (status IS NULL OR status = 'active')
    AND side <> p_result
    AND side <> (p_result || '::yes');

  -- Mark event resolved
  UPDATE public.events
  SET status = 'resolved', result = p_result
  WHERE id = p_event_id;

  -- Credit total skim to treasury
  IF v_total_skimmed > 0 THEN
    UPDATE public.profiles
    SET balance = balance + v_total_skimmed
    WHERE id = v_treasury_id
    RETURNING balance INTO v_treasury_bal;

    -- Treasury ledger entry
    INSERT INTO public.balance_ledger (user_id, type, amount, balance_after, label, reference_id)
    VALUES (v_treasury_id, 'skim', v_total_skimmed, v_treasury_bal,
            'Resolución: ' || COALESCE(v_event_q, p_event_id), p_event_id);
  END IF;

  RETURN v_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
