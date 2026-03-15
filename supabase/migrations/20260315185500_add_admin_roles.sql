-- Explicit admin role mapping for Supabase auth users.
-- After this migration, bootstrap the first admin manually in Supabase SQL:
-- insert into public.admin_users (user_id) values ('<auth-user-uuid>');

CREATE TABLE public.admin_users (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE user_id = check_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

CREATE POLICY "Users can view own admin role" ON public.admin_users
FOR SELECT
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can add admins" ON public.admin_users
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update admins" ON public.admin_users
FOR UPDATE
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete admins" ON public.admin_users
FOR DELETE
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can manage duties" ON public.duties;
DROP POLICY IF EXISTS "Authenticated can update duties" ON public.duties;
DROP POLICY IF EXISTS "Authenticated can delete duties" ON public.duties;

DROP POLICY IF EXISTS "Authenticated can manage assignments" ON public.duty_assignments;
DROP POLICY IF EXISTS "Authenticated can update assignments" ON public.duty_assignments;
DROP POLICY IF EXISTS "Authenticated can delete assignments" ON public.duty_assignments;

CREATE POLICY "Admins can manage duties" ON public.duties
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update duties" ON public.duties
FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete duties" ON public.duties
FOR DELETE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage assignments" ON public.duty_assignments
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update assignments" ON public.duty_assignments
FOR UPDATE
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete assignments" ON public.duty_assignments
FOR DELETE
USING (public.is_admin(auth.uid()));
