-- ============================================================
--  Migration: events.lp_public flag
--  Date: 2026-05-06
--
--  WHY:
--    Today, the only way an LP gets capital into an event is for
--    an admin to add it from the EventManager. There's no user-
--    facing path -- partly because there was no flag distinguishing
--    'this event accepts public LP deposits' from 'LP-by-invite-only
--    or platform-funded'. This adds that flag.
--
--  USE:
--    UI side: the admin event-form gets a 'Abierto para LP público'
--    toggle right under the EN VIVO checkbox. Off by default
--    (conservative). When on, the event surfaces in the user's
--    Portafolio > Capital LP > 'Eventos disponibles para LP' feed,
--    where users can opt to deposit LP capital.
--
--    DB side: server-side checks on the user-facing
--    deposit_lp_capital path can gate on this flag once a public
--    user-deposit RPC ships. (Today only the admin path uses
--    deposit_lp_capital; gating the public path is future work.)
--
--  Idempotency: ADD COLUMN IF NOT EXISTS. Safe to re-run.
-- ============================================================

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS lp_public boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.lp_public IS
  'When true, the event is visible in the user-facing LP feed and accepts public LP deposits. When false, LP capital can only be added by admins.';

COMMIT;
