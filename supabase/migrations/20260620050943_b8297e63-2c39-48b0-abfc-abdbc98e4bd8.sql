
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TYPE public.post_kind AS ENUM ('photo','video','carousel','reel','text');
CREATE TYPE public.verification_status AS ENUM ('pending','reviewing','approved','rejected');
CREATE TYPE public.notification_kind AS ENUM ('like','comment','follow','mention','message','verification','system');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  website TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  followers_count INT NOT NULL DEFAULT 0,
  following_count INT NOT NULL DEFAULT 0,
  posts_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles read all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE USING (auth.uid()=id);
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT WITH CHECK (auth.uid()=id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles read own" ON public.user_roles FOR SELECT USING (auth.uid()=user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;

CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Handle new user: create profile + auto-promote configured admin email
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  n INT := 0;
BEGIN
  base_username := lower(regexp_replace(coalesce(split_part(NEW.email,'@',1),'user'), '[^a-z0-9_]', '', 'g'));
  IF base_username = '' THEN base_username := 'user'; END IF;
  final_username := base_username;
  WHILE EXISTS(SELECT 1 FROM public.profiles WHERE username=final_username) LOOP
    n := n+1;
    final_username := base_username || n::text;
  END LOOP;

  INSERT INTO public.profiles(id, username, display_name, avatar_url)
  VALUES (NEW.id, final_username,
          COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', final_username),
          NEW.raw_user_meta_data->>'avatar_url');

  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user');

  IF lower(NEW.email) = 'joaopedromoladeoliveira@gmail.com' THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET is_verified = true WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- FOLLOWS
CREATE TABLE public.follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows read all" ON public.follows FOR SELECT USING (true);
CREATE POLICY "follows insert own" ON public.follows FOR INSERT WITH CHECK (auth.uid()=follower_id);
CREATE POLICY "follows delete own" ON public.follows FOR DELETE USING (auth.uid()=follower_id);

CREATE OR REPLACE FUNCTION public.tg_follow_counts() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.profiles SET followers_count=followers_count+1 WHERE id=NEW.following_id;
    UPDATE public.profiles SET following_count=following_count+1 WHERE id=NEW.follower_id;
  ELSIF TG_OP='DELETE' THEN
    UPDATE public.profiles SET followers_count=GREATEST(followers_count-1,0) WHERE id=OLD.following_id;
    UPDATE public.profiles SET following_count=GREATEST(following_count-1,0) WHERE id=OLD.follower_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER follows_counts AFTER INSERT OR DELETE ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.tg_follow_counts();

-- POSTS
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.post_kind NOT NULL DEFAULT 'photo',
  caption TEXT,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  thumbnail_url TEXT,
  likes_count INT NOT NULL DEFAULT 0,
  comments_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT ON public.posts TO anon;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts read all" ON public.posts FOR SELECT USING (true);
CREATE POLICY "posts insert own" ON public.posts FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "posts update own" ON public.posts FOR UPDATE USING (auth.uid()=user_id);
CREATE POLICY "posts delete own or admin" ON public.posts FOR DELETE USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));
CREATE INDEX posts_created_idx ON public.posts(created_at DESC);
CREATE INDEX posts_user_idx ON public.posts(user_id, created_at DESC);
CREATE INDEX posts_kind_idx ON public.posts(kind, created_at DESC);
CREATE TRIGGER posts_updated BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_post_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.profiles SET posts_count=posts_count+1 WHERE id=NEW.user_id;
  ELSIF TG_OP='DELETE' THEN
    UPDATE public.profiles SET posts_count=GREATEST(posts_count-1,0) WHERE id=OLD.user_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER posts_count_trg AFTER INSERT OR DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.tg_post_count();

-- LIKES
CREATE TABLE public.post_likes (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT ALL ON public.post_likes TO service_role;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes read all" ON public.post_likes FOR SELECT USING (true);
CREATE POLICY "likes insert own" ON public.post_likes FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "likes delete own" ON public.post_likes FOR DELETE USING (auth.uid()=user_id);

CREATE OR REPLACE FUNCTION public.tg_like_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.posts SET likes_count=likes_count+1 WHERE id=NEW.post_id;
  ELSIF TG_OP='DELETE' THEN
    UPDATE public.posts SET likes_count=GREATEST(likes_count-1,0) WHERE id=OLD.post_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER post_likes_count AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.tg_like_count();

-- COMMENTS
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments read all" ON public.comments FOR SELECT USING (true);
CREATE POLICY "comments insert own" ON public.comments FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "comments delete own or admin" ON public.comments FOR DELETE USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));
CREATE INDEX comments_post_idx ON public.comments(post_id, created_at);

CREATE OR REPLACE FUNCTION public.tg_comment_count() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.posts SET comments_count=comments_count+1 WHERE id=NEW.post_id;
  ELSIF TG_OP='DELETE' THEN
    UPDATE public.posts SET comments_count=GREATEST(comments_count-1,0) WHERE id=OLD.post_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER comments_count AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.tg_comment_count();

-- SAVED POSTS
CREATE TABLE public.saved_posts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
GRANT SELECT, INSERT, DELETE ON public.saved_posts TO authenticated;
GRANT ALL ON public.saved_posts TO service_role;
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved read own" ON public.saved_posts FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "saved insert own" ON public.saved_posts FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "saved delete own" ON public.saved_posts FOR DELETE USING (auth.uid()=user_id);

-- STORIES
CREATE TABLE public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);
GRANT SELECT, INSERT, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stories read active" ON public.stories FOR SELECT USING (expires_at > now());
CREATE POLICY "stories insert own" ON public.stories FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "stories delete own or admin" ON public.stories FOR DELETE USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));

-- CONVERSATIONS + MESSAGES
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv read members" ON public.conversations FOR SELECT USING (auth.uid()=user_a OR auth.uid()=user_b);
CREATE POLICY "conv insert members" ON public.conversations FOR INSERT WITH CHECK (auth.uid()=user_a OR auth.uid()=user_b);
CREATE POLICY "conv update members" ON public.conversations FOR UPDATE USING (auth.uid()=user_a OR auth.uid()=user_b);

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(_other UUID) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a UUID; b UUID; cid UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF auth.uid() = _other THEN RAISE EXCEPTION 'cannot dm self'; END IF;
  IF auth.uid() < _other THEN a := auth.uid(); b := _other; ELSE a := _other; b := auth.uid(); END IF;
  SELECT id INTO cid FROM public.conversations WHERE user_a=a AND user_b=b;
  IF cid IS NULL THEN
    INSERT INTO public.conversations(user_a,user_b) VALUES (a,b) RETURNING id INTO cid;
  END IF;
  RETURN cid;
END $$;

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  media_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg read members" ON public.messages FOR SELECT USING (
  EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=conversation_id AND (c.user_a=auth.uid() OR c.user_b=auth.uid()))
);
CREATE POLICY "msg insert sender" ON public.messages FOR INSERT WITH CHECK (
  auth.uid()=sender_id AND EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=conversation_id AND (c.user_a=auth.uid() OR c.user_b=auth.uid()))
);
CREATE POLICY "msg update read by recipient" ON public.messages FOR UPDATE USING (
  EXISTS(SELECT 1 FROM public.conversations c WHERE c.id=conversation_id AND (c.user_a=auth.uid() OR c.user_b=auth.uid()))
);
CREATE INDEX msg_conv_idx ON public.messages(conversation_id, created_at);

CREATE OR REPLACE FUNCTION public.tg_msg_bump_conv() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.conversations SET last_message=COALESCE(NEW.content,'[mídia]'), last_message_at=NEW.created_at WHERE id=NEW.conversation_id;
  RETURN NEW;
END $$;
CREATE TRIGGER msg_bump AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.tg_msg_bump_conv();

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.notification_kind NOT NULL,
  entity_id UUID,
  content TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif read own" ON public.notifications FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "notif update own" ON public.notifications FOR UPDATE USING (auth.uid()=user_id);
CREATE POLICY "notif insert any auth" ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX notif_user_idx ON public.notifications(user_id, created_at DESC);

-- VERIFICATION REQUESTS
CREATE TABLE public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_path TEXT NOT NULL,
  selfie_path TEXT,
  status public.verification_status NOT NULL DEFAULT 'pending',
  review_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.verification_requests TO authenticated;
GRANT ALL ON public.verification_requests TO service_role;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vr read own or admin" ON public.verification_requests FOR SELECT USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "vr insert own" ON public.verification_requests FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "vr update admin" ON public.verification_requests FOR UPDATE USING (public.has_role(auth.uid(),'admin'));

-- BANS
CREATE TABLE public.user_bans (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  banned_by UUID REFERENCES auth.users(id)
);
GRANT SELECT ON public.user_bans TO authenticated;
GRANT ALL ON public.user_bans TO service_role;
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bans read all" ON public.user_bans FOR SELECT USING (true);
CREATE POLICY "bans admin manage" ON public.user_bans FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;
