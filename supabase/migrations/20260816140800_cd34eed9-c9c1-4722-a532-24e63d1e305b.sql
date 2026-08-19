
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('super_admin','platform_admin','support_admin','analyst','member');
CREATE TYPE public.community_role AS ENUM ('owner','manager','moderator','member');
CREATE TYPE public.community_visibility AS ENUM ('public','private');
CREATE TYPE public.community_status AS ENUM ('pending','approved','rejected','disabled');
CREATE TYPE public.reaction_type AS ENUM ('like','dislike');

-- UPDATED_AT HELPER
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PLATFORM SETTINGS
CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  banner_url TEXT,
  birth_date DATE,
  interests TEXT[] NOT NULL DEFAULT '{}',
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX profiles_username_idx ON public.profiles (lower(username));
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "profiles readable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','platform_admin'));
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY "settings readable" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "admins write settings" ON public.platform_settings FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ADULT CHECK
CREATE OR REPLACE FUNCTION public.is_adult(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND birth_date IS NOT NULL AND birth_date <= (current_date - INTERVAL '18 years')
  );
$$;

-- COMMUNITIES
CREATE TABLE public.communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  icon_url TEXT,
  banner_url TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  accent_color TEXT NOT NULL DEFAULT '#7C5CFF',
  rules TEXT NOT NULL DEFAULT '',
  visibility public.community_visibility NOT NULL DEFAULT 'public',
  status public.community_status NOT NULL DEFAULT 'pending',
  is_nsfw BOOLEAN NOT NULL DEFAULT false,
  featured BOOLEAN NOT NULL DEFAULT false,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.communities TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER communities_updated_at BEFORE UPDATE ON public.communities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- COMMUNITY MEMBERS
CREATE TABLE public.community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.community_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);
GRANT SELECT ON public.community_members TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.community_members TO authenticated;
GRANT ALL ON public.community_members TO service_role;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_community_member(_community_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id = _community_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_community_staff(_community_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = _community_id AND user_id = _user_id AND role IN ('owner','manager','moderator')
  ) OR public.is_platform_admin(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view_community(_community_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = _community_id
      AND (
        (c.status = 'approved' AND c.visibility = 'public')
        OR (_user_id IS NOT NULL AND (c.owner_id = _user_id OR public.is_community_member(c.id, _user_id) OR public.is_platform_admin(_user_id)))
      )
  );
$$;

CREATE POLICY "public communities visible" ON public.communities FOR SELECT
  USING (
    (status = 'approved' AND visibility = 'public')
    OR (auth.uid() IS NOT NULL AND (owner_id = auth.uid() OR public.is_community_member(id, auth.uid()) OR public.is_platform_admin(auth.uid())))
  );
CREATE POLICY "users request communities" ON public.communities FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND (status = 'pending' OR public.is_platform_admin(auth.uid())));
CREATE POLICY "staff update communities" ON public.communities FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_community_staff(id, auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.is_community_staff(id, auth.uid()));
CREATE POLICY "admins delete communities" ON public.communities FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY "members visible with community" ON public.community_members FOR SELECT
  USING (public.can_view_community(community_id, auth.uid()));
CREATE POLICY "users join communities" ON public.community_members FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND role = 'member' AND EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.status = 'approved' AND c.visibility = 'public'))
    OR EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
    OR public.is_community_staff(community_id, auth.uid())
  );
CREATE POLICY "staff manage members" ON public.community_members FOR UPDATE TO authenticated
  USING (public.is_community_staff(community_id, auth.uid())) WITH CHECK (public.is_community_staff(community_id, auth.uid()));
CREATE POLICY "leave or staff remove" ON public.community_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_community_staff(community_id, auth.uid()));

-- COMMUNITY SECTIONS
CREATE TABLE public.community_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'discussion',
  description TEXT NOT NULL DEFAULT '',
  icon TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, slug)
);
GRANT SELECT ON public.community_sections TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.community_sections TO authenticated;
GRANT ALL ON public.community_sections TO service_role;
ALTER TABLE public.community_sections ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER community_sections_updated_at BEFORE UPDATE ON public.community_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "sections visible with community" ON public.community_sections FOR SELECT
  USING (
    public.can_view_community(community_id, auth.uid())
    AND (is_private = false OR (auth.uid() IS NOT NULL AND public.is_community_member(community_id, auth.uid())))
  );
CREATE POLICY "staff manage sections" ON public.community_sections FOR ALL TO authenticated
  USING (public.is_community_staff(community_id, auth.uid())) WITH CHECK (public.is_community_staff(community_id, auth.uid()));

-- POSTS
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.community_sections(id) ON DELETE SET NULL,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'text',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  link_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_spoiler BOOLEAN NOT NULL DEFAULT false,
  is_nsfw BOOLEAN NOT NULL DEFAULT false,
  is_removed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX posts_community_idx ON public.posts (community_id, created_at DESC);
CREATE INDEX posts_section_idx ON public.posts (section_id, created_at DESC);
GRANT SELECT ON public.posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "posts visible with community" ON public.posts FOR SELECT
  USING (
    is_removed = false
    AND public.can_view_community(community_id, auth.uid())
    AND (is_nsfw = false OR (auth.uid() IS NOT NULL AND public.is_adult(auth.uid())))
  );
CREATE POLICY "members create posts" ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.is_community_member(community_id, auth.uid())
    AND (is_nsfw = false OR public.is_adult(auth.uid()))
  );
CREATE POLICY "authors or staff update posts" ON public.posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_community_staff(community_id, auth.uid()))
  WITH CHECK (author_id = auth.uid() OR public.is_community_staff(community_id, auth.uid()));
CREATE POLICY "authors or staff delete posts" ON public.posts FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_community_staff(community_id, auth.uid()));

-- COMMENTS
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_spoiler BOOLEAN NOT NULL DEFAULT false,
  is_removed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_idx ON public.comments (post_id, created_at);
GRANT SELECT ON public.comments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.post_community(_post_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT community_id FROM public.posts WHERE id = _post_id;
$$;

CREATE POLICY "comments visible with post" ON public.comments FOR SELECT
  USING (is_removed = false AND public.can_view_community(public.post_community(post_id), auth.uid()));
CREATE POLICY "members comment" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_community_member(public.post_community(post_id), auth.uid()));
CREATE POLICY "authors or staff update comments" ON public.comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_community_staff(public.post_community(post_id), auth.uid()))
  WITH CHECK (author_id = auth.uid() OR public.is_community_staff(public.post_community(post_id), auth.uid()));
CREATE POLICY "authors or staff delete comments" ON public.comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_community_staff(public.post_community(post_id), auth.uid()));

-- REACTIONS
CREATE TABLE public.post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.reaction_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
GRANT SELECT ON public.post_reactions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.post_reactions TO authenticated;
GRANT ALL ON public.post_reactions TO service_role;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions visible with post" ON public.post_reactions FOR SELECT
  USING (public.can_view_community(public.post_community(post_id), auth.uid()));
CREATE POLICY "users manage own post reactions" ON public.post_reactions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.reaction_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);
GRANT SELECT ON public.comment_reactions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.comment_reactions TO authenticated;
GRANT ALL ON public.comment_reactions TO service_role;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comment reactions visible" ON public.comment_reactions FOR SELECT USING (true);
CREATE POLICY "users manage own comment reactions" ON public.comment_reactions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- MEMBER COUNT MAINTENANCE
CREATE OR REPLACE FUNCTION public.sync_member_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.community_id;
  END IF;
  RETURN NULL;
END; $$;
CREATE TRIGGER community_members_count AFTER INSERT OR DELETE ON public.community_members
FOR EACH ROW EXECUTE FUNCTION public.sync_member_count();

-- DEFAULT PLATFORM SETTINGS
INSERT INTO public.platform_settings (key, value) VALUES
  ('general', '{"platform_name":"Komuna","tagline":"One platform. Every community.","description":"Komuna is one platform for every community — discuss, debate, recommend and connect.","support_email":"support@komuna.app","contact_email":"hello@komuna.app","logo_url":null,"favicon_url":null}'::jsonb),
  ('appearance', '{"primary_color":"#7C5CFF","secondary_color":"#00D4FF","theme":"dark"}'::jsonb),
  ('registration', '{"allow_registration":true,"require_email_verification":false,"allow_username_changes":true}'::jsonb),
  ('communities', '{"allow_community_requests":true,"require_approval":true,"max_communities_per_user":3}'::jsonb),
  ('moderation', '{"spam_controls":true,"reports_enabled":true}'::jsonb),
  ('maintenance', '{"maintenance_mode":false,"maintenance_message":"Komuna is undergoing maintenance. We will be back shortly."}'::jsonb);
