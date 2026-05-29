-- Adds persistent user notifications so admin/company decisions are consistently surfaced.

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'system'
    CHECK (source IN ('system', 'admin', 'company', 'user')),
  source_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low')),
  category text NOT NULL DEFAULT 'update'
    CHECK (category IN ('action', 'update', 'info')),
  entity_type text,
  entity_id text,
  action_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created_at
  ON public.user_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_read_at
  ON public.user_notifications(user_id, read_at);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_notifications_owner_read" ON public.user_notifications;
CREATE POLICY "user_notifications_owner_read"
ON public.user_notifications
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_notifications_owner_update" ON public.user_notifications;
CREATE POLICY "user_notifications_owner_update"
ON public.user_notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
