-- Make the messaging feature safe to deploy to projects created before it existed.
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message text,
  last_at timestamptz DEFAULT now(),
  unread_a integer NOT NULL DEFAULT 0,
  unread_b integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CHECK (participant_a <> participant_b),
  UNIQUE (participant_a, participant_b)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conv_participants" ON public.conversations;
CREATE POLICY "conv_participants" ON public.conversations FOR ALL
USING (participant_a = auth.uid() OR participant_b = auth.uid())
WITH CHECK (participant_a = auth.uid() OR participant_b = auth.uid());

DROP POLICY IF EXISTS "msg_participants_read" ON public.messages;
DROP POLICY IF EXISTS "msg_sender_insert" ON public.messages;
CREATE POLICY "msg_participants_read" ON public.messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversations conversation
    WHERE conversation.id = conversation_id
      AND (conversation.participant_a = auth.uid() OR conversation.participant_b = auth.uid())
  )
);
CREATE POLICY "msg_sender_insert" ON public.messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversations conversation
    WHERE conversation.id = conversation_id
      AND (conversation.participant_a = auth.uid() OR conversation.participant_b = auth.uid())
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
