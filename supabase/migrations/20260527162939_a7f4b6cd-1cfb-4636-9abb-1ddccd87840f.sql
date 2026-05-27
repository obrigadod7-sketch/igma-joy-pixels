
-- 1. Prevent role escalation on svc_profiles
CREATE OR REPLACE FUNCTION public.prevent_svc_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      NEW.role := OLD.role;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      NEW.role := 'migrant';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS svc_profiles_prevent_role_escalation ON public.svc_profiles;
CREATE TRIGGER svc_profiles_prevent_role_escalation
BEFORE INSERT OR UPDATE ON public.svc_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_svc_role_escalation();

-- 2. Restrict phone column visibility via column-level grants
REVOKE SELECT ON public.svc_profiles FROM anon, authenticated;
GRANT SELECT (id, user_id, display_name, avatar_url, bio, role, city, lat, lng, rating, categories, created_at, updated_at)
  ON public.svc_profiles TO authenticated;
GRANT SELECT (id, user_id, display_name, avatar_url, bio, role, city, rating, categories, created_at, updated_at)
  ON public.svc_profiles TO anon;

CREATE OR REPLACE FUNCTION public.get_my_phone()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT phone FROM public.svc_profiles WHERE user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_my_phone() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_phone() TO authenticated;

-- Allow owner to fetch its own full row (incl phone) via RPC
CREATE OR REPLACE FUNCTION public.get_my_svc_profile()
RETURNS public.svc_profiles LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.svc_profiles WHERE user_id = auth.uid() LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_my_svc_profile() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_svc_profile() TO authenticated;

-- 3. Drop user-facing UPDATE on svc_subscriptions (payment fields must not be self-edited)
DROP POLICY IF EXISTS "Users update own subscription" ON public.svc_subscriptions;

-- 4. Validate participants on svc_conversations insert
CREATE OR REPLACE FUNCTION public.svc_validate_conversation_participants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.svc_profiles WHERE user_id = NEW.user_a) THEN
    RAISE EXCEPTION 'user_a profile does not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.svc_profiles WHERE user_id = NEW.user_b) THEN
    RAISE EXCEPTION 'user_b profile does not exist';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS svc_conv_validate ON public.svc_conversations;
CREATE TRIGGER svc_conv_validate
BEFORE INSERT ON public.svc_conversations
FOR EACH ROW EXECUTE FUNCTION public.svc_validate_conversation_participants();

-- 5. Remove public read on debug-uploads bucket
DROP POLICY IF EXISTS "Public read debug-uploads" ON storage.objects;

CREATE POLICY "Admins read debug-uploads"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'debug-uploads' AND public.has_role(auth.uid(), 'admin'::app_role));
