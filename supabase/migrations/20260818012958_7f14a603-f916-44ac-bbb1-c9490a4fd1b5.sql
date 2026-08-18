-- enums
CREATE TYPE public.report_target AS ENUM ('post','comment','user','community','message');
CREATE TYPE public.report_reason AS ENUM ('spam','harassment','nsfw','hate_speech','copyright','scam','other');
CREATE TYPE public.report_status AS ENUM ('open','reviewing','resolved','dismissed');
CREATE TYPE public.moderation_action_type AS ENUM ('warning','mute','ban','suspension','content_removal');

-- reports
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type public.report_target NOT NULL,
  target_id uuid NOT NULL,
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  reason public.report_reason NOT NULL,
  details text NOT NULL DEFAULT '',
  status public.report_status NOT NULL DEFAULT 'open',
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  resolution_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_queue_idx ON public.reports (status, created_at DESC);
CREATE INDEX reports_community_idx ON public.reports (community_id);
CREATE UNIQUE INDEX reports_unique_open ON public.reports (reporter_id, target_type, target_id) WHERE status IN ('open','reviewing');

GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users create own reports" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reporters and staff read reports" ON public.reports FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR (community_id IS NOT NULL AND public.is_community_staff(community_id, auth.uid()))
  );
CREATE POLICY "staff update reports" ON public.reports FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (community_id IS NOT NULL AND public.is_community_staff(community_id, auth.uid()))
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR (community_id IS NOT NULL AND public.is_community_staff(community_id, auth.uid()))
  );

CREATE TRIGGER reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- moderation actions (warnings, mutes, bans, suspensions, removals)
CREATE TABLE public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.moderation_action_type NOT NULL,
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type public.report_target,
  target_id uuid,
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_actions_user_idx ON public.moderation_actions (target_user_id, is_active);
CREATE INDEX moderation_actions_community_idx ON public.moderation_actions (community_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.moderation_actions TO authenticated;
GRANT ALL ON public.moderation_actions TO service_role;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

-- community staff may only act inside their community; platform-wide (community_id IS NULL) requires platform admin
CREATE POLICY "staff create scoped actions" ON public.moderation_actions FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_platform_admin(auth.uid())
      OR (community_id IS NOT NULL AND public.is_community_staff(community_id, auth.uid()))
    )
  );
CREATE POLICY "targets and staff read actions" ON public.moderation_actions FOR SELECT TO authenticated
  USING (
    target_user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR (community_id IS NOT NULL AND public.is_community_staff(community_id, auth.uid()))
  );
CREATE POLICY "staff update scoped actions" ON public.moderation_actions FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (community_id IS NOT NULL AND public.is_community_staff(community_id, auth.uid()))
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR (community_id IS NOT NULL AND public.is_community_staff(community_id, auth.uid()))
  );

-- audit log
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  target_type text,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON public.audit_logs (created_at DESC);
CREATE INDEX audit_logs_community_idx ON public.audit_logs (community_id, created_at DESC);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "actors write audit logs" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());
CREATE POLICY "staff read audit logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (community_id IS NOT NULL AND public.is_community_staff(community_id, auth.uid()))
  );

-- helpers
CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid, _community_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.moderation_actions
    WHERE target_user_id = _user_id
      AND is_active = true
      AND type IN ('ban','suspension','mute')
      AND (expires_at IS NULL OR expires_at > now())
      AND (community_id IS NULL OR community_id = _community_id)
  );
$$;

-- enforce bans/mutes on content creation
CREATE OR REPLACE FUNCTION public.block_banned_posts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.is_banned(NEW.author_id, NEW.community_id) THEN
    RAISE EXCEPTION 'You are currently restricted from posting here';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER posts_block_banned BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.block_banned_posts();

CREATE OR REPLACE FUNCTION public.block_banned_comments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.is_banned(NEW.author_id, public.post_community(NEW.post_id)) THEN
    RAISE EXCEPTION 'You are currently restricted from commenting here';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER comments_block_banned BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.block_banned_comments();