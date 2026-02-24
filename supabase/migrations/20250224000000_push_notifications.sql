-- ============================================
-- Push notifications: table, profiles column, and triggers
-- Run this in Supabase SQL Editor (or via supabase db push)
-- ============================================

-- 1. Add expo push token and notifications_enabled to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS expo_push_token text;
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notifications_enabled boolean DEFAULT true;

-- 2. Notifications table (webhook inserts here; Edge Function sends via Expo)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  body text NOT NULL,
  data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Inserts are done by triggers (SECURITY DEFINER, owner bypasses RLS) and by Edge Function (service role). No app INSERT policy.

-- 3. Helper: insert a notification (used by triggers; SECURITY DEFINER so triggers can insert)
CREATE OR REPLACE FUNCTION public.notify_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_data jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, body, data)
  VALUES (p_user_id, p_title, p_body, COALESCE(p_data, '{}'));
END;
$$;

-- 4. Notify when someone accepts your friend request (requester gets "X added you as a friend")
CREATE OR REPLACE FUNCTION public.on_friend_request_accepted_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient_name text;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status <> 'accepted') THEN
    SELECT name INTO recipient_name FROM public.profiles WHERE id = NEW.recipient_id;
    PERFORM notify_push(
      NEW.requester_id,
      'Friend request accepted',
      COALESCE(recipient_name, 'Someone') || ' added you as a friend!',
      jsonb_build_object('type', 'friend_added', 'recipient_id', NEW.recipient_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_friend_request_accepted_notify ON public.friend_requests;
CREATE TRIGGER trigger_friend_request_accepted_notify
  AFTER UPDATE ON public.friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.on_friend_request_accepted_notify();

-- 4b. Notify recipient when someone sends them a friend request (INSERT, status pending)
CREATE OR REPLACE FUNCTION public.on_friend_request_sent_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_name text;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT name INTO requester_name FROM public.profiles WHERE id = NEW.requester_id;
    PERFORM notify_push(
      NEW.recipient_id,
      'Friend request',
      COALESCE(requester_name, 'Someone') || ' sent you a friend request',
      jsonb_build_object('type', 'friend_request', 'requester_id', NEW.requester_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_friend_request_sent_notify ON public.friend_requests;
CREATE TRIGGER trigger_friend_request_sent_notify
  AFTER INSERT ON public.friend_requests
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.on_friend_request_sent_notify();

-- 5. Notify when you're added to a group list; notify existing participants that someone joined
CREATE OR REPLACE FUNCTION public.on_group_participant_added_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  list_name text;
  list_owner_id uuid;
  participant_name text;
  existing_user_id uuid;
BEGIN
  SELECT gl.name, gl.user_id INTO list_name, list_owner_id
  FROM public.goal_lists gl WHERE gl.id = NEW.goal_list_id;

  SELECT name INTO participant_name FROM public.profiles WHERE id = NEW.user_id;

  -- Notify the new participant: "You were added to [name]. Open the app to continue."
  PERFORM notify_push(
    NEW.user_id,
    'Added to Group Challenge',
    'You were added to "' || COALESCE(list_name, 'a group challenge') || '". Open the app to continue.',
    jsonb_build_object('type', 'added_to_list', 'goal_list_id', NEW.goal_list_id)
  );

  -- Notify list owner (if not the one who added)
  IF list_owner_id IS NOT NULL AND list_owner_id <> NEW.user_id THEN
    PERFORM notify_push(
      list_owner_id,
      'Someone joined',
      COALESCE(participant_name, 'Someone') || ' joined "' || COALESCE(list_name, 'your challenge') || '"',
      jsonb_build_object('type', 'participant_joined', 'goal_list_id', NEW.goal_list_id, 'user_id', NEW.user_id)
    );
  END IF;

  -- Notify other existing participants (someone joined the list)
  FOR existing_user_id IN
    SELECT ggp.user_id FROM public.group_goal_participants ggp
    WHERE ggp.goal_list_id = NEW.goal_list_id AND ggp.user_id <> NEW.user_id AND ggp.user_id <> list_owner_id
  LOOP
    PERFORM notify_push(
      existing_user_id,
      'Someone joined',
      COALESCE(participant_name, 'Someone') || ' joined "' || COALESCE(list_name, 'your challenge') || '"',
      jsonb_build_object('type', 'participant_joined', 'goal_list_id', NEW.goal_list_id, 'user_id', NEW.user_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_group_participant_added_notify ON public.group_goal_participants;
CREATE TRIGGER trigger_group_participant_added_notify
  AFTER INSERT ON public.group_goal_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.on_group_participant_added_notify();

-- 6. Notify when someone posts (completes a goal) in a group list – notify other participants
CREATE OR REPLACE FUNCTION public.on_goal_completion_posted_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  list_name text;
  goal_title text;
  completer_name text;
  participant_user_id uuid;
  list_id uuid;
  owner_id uuid;
BEGIN
  SELECT g.title, g.goal_list_id INTO goal_title, list_id
  FROM public.goals g WHERE g.id = NEW.goal_id;

  SELECT gl.name, gl.user_id INTO list_name, owner_id FROM public.goal_lists gl WHERE gl.id = list_id;
  SELECT name INTO completer_name FROM public.profiles WHERE id = NEW.user_id;

  FOR participant_user_id IN
    SELECT ggp.user_id FROM public.group_goal_participants ggp
    WHERE ggp.goal_list_id = list_id AND ggp.user_id <> NEW.user_id
  LOOP
    PERFORM notify_push(
      participant_user_id,
      'New post in ' || COALESCE(list_name, 'your list'),
      COALESCE(completer_name, 'Someone') || ' completed: ' || COALESCE(goal_title, 'a goal'),
      jsonb_build_object('type', 'goal_post', 'goal_list_id', list_id, 'goal_completion_id', NEW.id, 'goal_id', NEW.goal_id)
    );
  END LOOP;

  -- Notify list owner if not a participant and not the completer
  IF owner_id IS NOT NULL AND owner_id <> NEW.user_id AND NOT EXISTS (
    SELECT 1 FROM public.group_goal_participants WHERE goal_list_id = list_id AND user_id = owner_id
  ) THEN
    PERFORM notify_push(
      owner_id,
      'New post in ' || COALESCE(list_name, 'your list'),
      COALESCE(completer_name, 'Someone') || ' completed: ' || COALESCE(goal_title, 'a goal'),
      jsonb_build_object('type', 'goal_post', 'goal_list_id', list_id, 'goal_completion_id', NEW.id, 'goal_id', NEW.goal_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_goal_completion_posted_notify ON public.goal_completions;
CREATE TRIGGER trigger_goal_completion_posted_notify
  AFTER INSERT ON public.goal_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.on_goal_completion_posted_notify();

-- 7. Notify completer when someone validates their post
CREATE OR REPLACE FUNCTION public.on_goal_validated_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  completer_id uuid;
  validator_name text;
  goal_title text;
BEGIN
  SELECT user_id INTO completer_id FROM public.goal_completions WHERE id = NEW.goal_completion_id;
  IF completer_id IS NULL OR completer_id = NEW.validator_id THEN
    RETURN NEW;
  END IF;
  SELECT name INTO validator_name FROM public.profiles WHERE id = NEW.validator_id;
  SELECT g.title INTO goal_title FROM public.goals g
  JOIN public.goal_completions gc ON gc.goal_id = g.id WHERE gc.id = NEW.goal_completion_id;
  PERFORM notify_push(
    completer_id,
    'Post validated',
    COALESCE(validator_name, 'Someone') || ' validated your completion: ' || COALESCE(goal_title, 'goal'),
    jsonb_build_object('type', 'validation', 'goal_completion_id', NEW.goal_completion_id, 'validator_id', NEW.validator_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_goal_validated_notify ON public.goal_validations;
CREATE TRIGGER trigger_goal_validated_notify
  AFTER INSERT ON public.goal_validations
  FOR EACH ROW
  EXECUTE FUNCTION public.on_goal_validated_notify();

-- 8. Notify participants when someone pays (payment recorded)
CREATE OR REPLACE FUNCTION public.on_payment_made_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  list_name text;
  payer_name text;
  participant_user_id uuid;
  owner_id uuid;
BEGIN
  SELECT gl.name, gl.user_id INTO list_name, owner_id FROM public.goal_lists gl WHERE gl.id = NEW.goal_list_id;
  SELECT name INTO payer_name FROM public.profiles WHERE id = NEW.user_id;

  FOR participant_user_id IN
    SELECT ggp.user_id FROM public.group_goal_participants ggp
    WHERE ggp.goal_list_id = NEW.goal_list_id AND ggp.user_id <> NEW.user_id
  LOOP
    PERFORM notify_push(
      participant_user_id,
      'Buy-in paid',
      COALESCE(payer_name, 'Someone') || ' paid their buy-in for "' || COALESCE(list_name, 'the challenge') || '"',
      jsonb_build_object('type', 'payment', 'goal_list_id', NEW.goal_list_id, 'user_id', NEW.user_id)
    );
  END LOOP;

  IF owner_id IS NOT NULL AND owner_id <> NEW.user_id THEN
    PERFORM notify_push(
      owner_id,
      'Buy-in paid',
      COALESCE(payer_name, 'Someone') || ' paid their buy-in for "' || COALESCE(list_name, 'your challenge') || '"',
      jsonb_build_object('type', 'payment', 'goal_list_id', NEW.goal_list_id, 'user_id', NEW.user_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_payment_made_notify ON public.payments;
CREATE TRIGGER trigger_payment_made_notify
  AFTER INSERT ON public.payments
  FOR EACH ROW
  WHEN (NEW.status = 'succeeded')
  EXECUTE FUNCTION public.on_payment_made_notify();

-- 9. Notify when all have paid (goal_lists.all_paid -> true)
CREATE OR REPLACE FUNCTION public.on_all_paid_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participant_user_id uuid;
BEGIN
  IF NEW.all_paid = true AND (OLD.all_paid IS NULL OR OLD.all_paid = false) THEN
    FOR participant_user_id IN
      SELECT user_id FROM public.group_goal_participants WHERE goal_list_id = NEW.id
    LOOP
      PERFORM notify_push(
        participant_user_id,
        'Challenge is on!',
        'Everyone has paid for "' || COALESCE(NEW.name, 'your challenge') || '" – time to crush your goals.',
        jsonb_build_object('type', 'all_paid', 'goal_list_id', NEW.id)
      );
    END LOOP;
    -- Notify owner if not in participants
    IF NOT EXISTS (SELECT 1 FROM public.group_goal_participants WHERE goal_list_id = NEW.id AND user_id = NEW.user_id) THEN
      PERFORM notify_push(
        NEW.user_id,
        'Challenge is on!',
        'Everyone has paid for "' || COALESCE(NEW.name, 'your challenge') || '" – time to crush your goals.',
        jsonb_build_object('type', 'all_paid', 'goal_list_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_all_paid_notify ON public.goal_lists;
CREATE TRIGGER trigger_all_paid_notify
  AFTER UPDATE ON public.goal_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.on_all_paid_notify();

-- 10. Notify when winner/loser is declared (winner_id or tie_winner_ids set)
CREATE OR REPLACE FUNCTION public.on_winner_declared_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participant_user_id uuid;
  winner_names text;
  is_winner boolean;
  msg text;
BEGIN
  IF (NEW.winner_id IS NOT NULL OR (NEW.tie_winner_ids IS NOT NULL AND array_length(NEW.tie_winner_ids, 1) > 0))
     AND (OLD.winner_id IS DISTINCT FROM NEW.winner_id OR OLD.tie_winner_ids IS DISTINCT FROM NEW.tie_winner_ids) THEN

    FOR participant_user_id IN
      SELECT user_id FROM public.group_goal_participants WHERE goal_list_id = NEW.id
    LOOP
      is_winner := (NEW.winner_id = participant_user_id)
        OR (NEW.tie_winner_ids IS NOT NULL AND participant_user_id = ANY(NEW.tie_winner_ids));
      IF is_winner THEN
        msg := 'You won "' || COALESCE(NEW.name, 'the challenge') || '"! 🎉';
      ELSE
        IF NEW.tie_winner_ids IS NOT NULL AND array_length(NEW.tie_winner_ids, 1) > 1 THEN
          SELECT string_agg(p.name, ', ') INTO winner_names FROM public.profiles p WHERE p.id = ANY(NEW.tie_winner_ids);
          msg := 'Winner(s) declared for "' || COALESCE(NEW.name, 'the challenge') || '": ' || COALESCE(winner_names, 'Tie');
        ELSE
          SELECT name INTO winner_names FROM public.profiles WHERE id = NEW.winner_id;
          msg := COALESCE(winner_names, 'Winner') || ' won "' || COALESCE(NEW.name, 'the challenge') || '".';
        END IF;
      END IF;
      PERFORM notify_push(
        participant_user_id,
        CASE WHEN is_winner THEN 'You won!' ELSE 'Winner declared' END,
        msg,
        jsonb_build_object('type', 'winner_declared', 'goal_list_id', NEW.id, 'winner_id', NEW.winner_id, 'tie_winner_ids', NEW.tie_winner_ids)
      );
    END LOOP;

    -- Notify owner if not in participants
    IF NOT EXISTS (SELECT 1 FROM public.group_goal_participants WHERE goal_list_id = NEW.id AND user_id = NEW.user_id) THEN
      is_winner := (NEW.winner_id = NEW.user_id) OR (NEW.tie_winner_ids IS NOT NULL AND NEW.user_id = ANY(NEW.tie_winner_ids));
      IF is_winner THEN
        msg := 'You won "' || COALESCE(NEW.name, 'your challenge') || '"! 🎉';
      ELSE
        SELECT string_agg(p.name, ', ') INTO winner_names FROM public.profiles p WHERE p.id IN (SELECT unnest(COALESCE(NEW.tie_winner_ids, ARRAY[]::uuid[]) || CASE WHEN NEW.winner_id IS NOT NULL THEN ARRAY[NEW.winner_id] ELSE ARRAY[]::uuid[] END));
        msg := 'Winner(s) declared: ' || COALESCE(winner_names, 'See app');
      END IF;
      PERFORM notify_push(
        NEW.user_id,
        CASE WHEN is_winner THEN 'You won!' ELSE 'Winner declared' END,
        msg,
        jsonb_build_object('type', 'winner_declared', 'goal_list_id', NEW.id, 'winner_id', NEW.winner_id, 'tie_winner_ids', NEW.tie_winner_ids)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_winner_declared_notify ON public.goal_lists;
CREATE TRIGGER trigger_winner_declared_notify
  AFTER UPDATE ON public.goal_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.on_winner_declared_notify();

-- 11. Table for reminder throttling (stake reminder every 2 days)
CREATE TABLE IF NOT EXISTS public.reminder_sent (
  goal_list_id uuid NOT NULL REFERENCES public.goal_lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  PRIMARY KEY (goal_list_id, user_id, kind)
);
ALTER TABLE public.reminder_sent ENABLE ROW LEVEL SECURITY;
-- Only service role / Edge Function needs to insert/select (no app policy needed for cron)
