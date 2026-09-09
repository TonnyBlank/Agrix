CREATE TABLE IF NOT EXISTS public.activity_event_moderation (
  event_key text PRIMARY KEY CHECK (char_length(event_key) BETWEEN 1 AND 200),
  hidden_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  hidden_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_event_moderation ENABLE ROW LEVEL SECURITY;
