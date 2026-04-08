-- ============================================================
--  Migration: notifications — in-app notification system
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL DEFAULT '',
  data        JSONB       DEFAULT '{}'::jsonb,  -- event_id, position_id, friendship_id, etc.
  read        BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id) WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_own_read"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notif_own_update"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "notif_server_insert"
  ON public.notifications FOR INSERT
  WITH CHECK (true);  -- security definer functions insert

-- Enable realtime for notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;


-- ── Helper: create notification (respects user prefs) ──────────

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id  UUID,
  p_type     TEXT,
  p_title    TEXT,
  p_body     TEXT DEFAULT '',
  p_data     JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prefs JSONB;
  v_enabled BOOLEAN;
BEGIN
  -- Check if user has disabled this notification type
  SELECT COALESCE(notification_prefs, '{}'::jsonb)
  INTO v_prefs
  FROM profiles WHERE id = p_user_id;

  v_enabled := COALESCE((v_prefs ->> p_type)::boolean, true);

  IF NOT v_enabled THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (p_user_id, p_type, p_title, p_body, p_data);
END;
$$;


-- ── Trigger: position created (after purchase) ────────────────

CREATE OR REPLACE FUNCTION public.notify_position_created()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_question TEXT;
BEGIN
  SELECT question INTO v_question FROM events WHERE id = NEW.event_id;

  PERFORM notify_user(
    NEW.user_id,
    'posicion_creada',
    'Posición tomada',
    'Tomaste posición en: ' || COALESCE(v_question, NEW.event_id),
    jsonb_build_object('event_id', NEW.event_id, 'position_id', NEW.id, 'side', NEW.side, 'amount', NEW.gross_amount)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_position_created ON public.positions;
CREATE TRIGGER trg_notify_position_created
  AFTER INSERT ON public.positions
  FOR EACH ROW EXECUTE FUNCTION notify_position_created();


-- ── Trigger: position resolved (won/lost) ─────────────────────

CREATE OR REPLACE FUNCTION public.notify_position_resolved()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_question TEXT;
  v_title TEXT;
  v_body TEXT;
  v_type TEXT;
BEGIN
  IF OLD.status = 'active' AND NEW.status IN ('won', 'lost') THEN
    SELECT question INTO v_question FROM events WHERE id = NEW.event_id;

    IF NEW.status = 'won' THEN
      v_type := 'resultado';
      v_title := '¡Lo sabías!';
      v_body := 'Colectás Q' || ROUND(NEW.payout_if_win, 2) || ' en: ' || COALESCE(v_question, NEW.event_id);
    ELSE
      v_type := 'resultado';
      v_title := 'Esta vez no';
      v_body := COALESCE(v_question, NEW.event_id);
    END IF;

    PERFORM notify_user(
      NEW.user_id,
      v_type,
      v_title,
      v_body,
      jsonb_build_object('event_id', NEW.event_id, 'position_id', NEW.id, 'status', NEW.status, 'payout', NEW.payout_if_win)
    );
  END IF;

  -- Position sold
  IF OLD.status = 'active' AND NEW.status = 'sold' THEN
    SELECT question INTO v_question FROM events WHERE id = NEW.event_id;

    PERFORM notify_user(
      NEW.user_id,
      'posicion_vendida',
      'Posición vendida',
      COALESCE(v_question, NEW.event_id),
      jsonb_build_object('event_id', NEW.event_id, 'position_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_position_resolved ON public.positions;
CREATE TRIGGER trg_notify_position_resolved
  AFTER UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION notify_position_resolved();


-- ── Trigger: event resolved ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_event_resolved()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user RECORD;
BEGIN
  IF OLD.status <> 'resolved' AND NEW.status = 'resolved' THEN
    -- Notify all users who have positions in this event
    FOR v_user IN
      SELECT DISTINCT user_id FROM positions WHERE event_id = NEW.id
    LOOP
      PERFORM notify_user(
        v_user.user_id,
        'evento_resuelto',
        'Evento resuelto',
        NEW.question || ' — Resultado: ' || COALESCE(
          CASE WHEN NEW.result = 'yes' THEN 'SÍ' WHEN NEW.result = 'no' THEN 'NO' ELSE NEW.result END,
          '?'
        ),
        jsonb_build_object('event_id', NEW.id, 'result', NEW.result)
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_event_resolved ON public.events;
CREATE TRIGGER trg_notify_event_resolved
  AFTER UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION notify_event_resolved();


-- ── Trigger: friend request sent ──────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_friend_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sender_name TEXT;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT COALESCE(username, name) INTO v_sender_name FROM profiles WHERE id = NEW.sender_id;

    PERFORM notify_user(
      NEW.receiver_id,
      'solicitud_amistad',
      'Solicitud de amistad',
      '@' || v_sender_name || ' quiere ser tu amigo',
      jsonb_build_object('friendship_id', NEW.id, 'sender_id', NEW.sender_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_friend_request ON public.friendships;
CREATE TRIGGER trg_notify_friend_request
  AFTER INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION notify_friend_request();


-- ── Trigger: friend request accepted ──────────────────────────

CREATE OR REPLACE FUNCTION public.notify_friend_accepted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_accepter_name TEXT;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    SELECT COALESCE(username, name) INTO v_accepter_name FROM profiles WHERE id = NEW.receiver_id;

    PERFORM notify_user(
      NEW.sender_id,
      'amistad_aceptada',
      'Amistad aceptada',
      '@' || v_accepter_name || ' aceptó tu solicitud',
      jsonb_build_object('friendship_id', NEW.id, 'friend_id', NEW.receiver_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_friend_accepted ON public.friendships;
CREATE TRIGGER trg_notify_friend_accepted
  AFTER UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION notify_friend_accepted();


-- ── Trigger: comment reply ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_comment_reply()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent_user_id UUID;
  v_replier_name TEXT;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id INTO v_parent_user_id FROM comments WHERE id = NEW.parent_id;

    -- Don't notify if replying to yourself
    IF v_parent_user_id IS NOT NULL AND v_parent_user_id <> NEW.user_id THEN
      SELECT COALESCE(username, name) INTO v_replier_name FROM profiles WHERE id = NEW.user_id;

      PERFORM notify_user(
        v_parent_user_id,
        'respuesta_comentario',
        'Respuesta a tu comentario',
        '@' || v_replier_name || ': ' || LEFT(NEW.text, 80),
        jsonb_build_object('event_id', NEW.event_id, 'comment_id', NEW.id, 'parent_id', NEW.parent_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_comment_reply ON public.comments;
CREATE TRIGGER trg_notify_comment_reply
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION notify_comment_reply();


-- ── Trigger: balance deposit ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_balance_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'deposit' THEN
    PERFORM notify_user(
      NEW.user_id,
      'deposito_confirmado',
      'Depósito confirmado',
      'Se acreditaron Q' || ABS(NEW.amount) || ' a tu cuenta',
      jsonb_build_object('amount', NEW.amount, 'balance_after', NEW.balance_after)
    );
  ELSIF NEW.type = 'withdraw' THEN
    PERFORM notify_user(
      NEW.user_id,
      'retiro_procesado',
      'Retiro procesado',
      'Se procesó tu retiro de Q' || ABS(NEW.amount),
      jsonb_build_object('amount', NEW.amount, 'balance_after', NEW.balance_after)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_balance_change ON public.balance_ledger;
CREATE TRIGGER trg_notify_balance_change
  AFTER INSERT ON public.balance_ledger
  FOR EACH ROW EXECUTE FUNCTION notify_balance_change();


-- ── Trigger: new event created ──────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_new_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user RECORD;
BEGIN
  -- Notify all active users about the new event
  FOR v_user IN
    SELECT id FROM profiles
  LOOP
    PERFORM notify_user(
      v_user.id,
      'nuevo_evento',
      'Nuevo evento',
      NEW.question,
      jsonb_build_object('event_id', NEW.id, 'category', NEW.category)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_event ON public.events;
CREATE TRIGGER trg_notify_new_event
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION notify_new_event();


-- ── Trigger: tier upgrade ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_tier_upgrade()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.tier > OLD.tier THEN
    PERFORM notify_user(
      NEW.id,
      'nivel_subio',
      '¡Subiste de nivel!',
      'Ahora sos Nivel ' || NEW.tier || '. Podés participar con montos más altos.',
      jsonb_build_object('old_tier', OLD.tier, 'new_tier', NEW.tier)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_tier_upgrade ON public.profiles;
CREATE TRIGGER trg_notify_tier_upgrade
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.tier IS DISTINCT FROM OLD.tier)
  EXECUTE FUNCTION notify_tier_upgrade();


-- ── Trigger: low balance warning (after purchase) ───────────

CREATE OR REPLACE FUNCTION public.notify_low_balance()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  -- Only check on purchase-type ledger entries (negative amount)
  IF NEW.amount < 0 THEN
    SELECT balance INTO v_balance FROM profiles WHERE id = NEW.user_id;
    IF v_balance IS NOT NULL AND v_balance < 50 AND v_balance >= 0 THEN
      PERFORM notify_user(
        NEW.user_id,
        'saldo_bajo',
        'Saldo bajo',
        'Tu saldo es Q' || ROUND(v_balance, 2) || '. Recargá para seguir participando.',
        jsonb_build_object('balance', v_balance)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_low_balance ON public.balance_ledger;
CREATE TRIGGER trg_notify_low_balance
  AFTER INSERT ON public.balance_ledger
  FOR EACH ROW EXECUTE FUNCTION notify_low_balance();


-- ── Trigger: @mention in comments ───────────────────────────

CREATE OR REPLACE FUNCTION public.notify_mention()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_mention TEXT;
  v_mentioned_id UUID;
  v_author_name TEXT;
BEGIN
  -- Extract @mentions from comment text
  FOR v_mention IN
    SELECT (regexp_matches(NEW.text, '@([A-Za-z0-9_.]+)', 'g'))[1]
  LOOP
    SELECT id INTO v_mentioned_id FROM profiles WHERE username = v_mention;
    IF v_mentioned_id IS NOT NULL AND v_mentioned_id <> NEW.user_id THEN
      SELECT COALESCE(username, name) INTO v_author_name FROM profiles WHERE id = NEW.user_id;
      PERFORM notify_user(
        v_mentioned_id,
        'mencion',
        'Te mencionaron',
        '@' || v_author_name || ': ' || LEFT(NEW.text, 80),
        jsonb_build_object('event_id', NEW.event_id, 'comment_id', NEW.id, 'mentioner_id', NEW.user_id)
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_mention ON public.comments;
CREATE TRIGGER trg_notify_mention
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION notify_mention();


-- ── Function: notify event closing soon (call via cron/edge fn) ──

CREATE OR REPLACE FUNCTION public.notify_events_closing_soon(p_hours_before INT DEFAULT 1)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_user RECORD;
  v_count INT := 0;
BEGIN
  FOR v_event IN
    SELECT id, question, close_time
    FROM events
    WHERE status = 'open'
      AND close_time BETWEEN now() AND now() + (p_hours_before || ' hours')::interval
      AND NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE type = 'evento_por_cerrar'
          AND data->>'event_id' = events.id::text
        LIMIT 1
      )
  LOOP
    FOR v_user IN
      SELECT DISTINCT user_id FROM positions WHERE event_id = v_event.id
    LOOP
      PERFORM notify_user(
        v_user.user_id,
        'evento_por_cerrar',
        'Evento por cerrar',
        v_event.question || ' cierra pronto.',
        jsonb_build_object('event_id', v_event.id, 'close_time', v_event.close_time)
      );
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;


NOTIFY pgrst, 'reload schema';
