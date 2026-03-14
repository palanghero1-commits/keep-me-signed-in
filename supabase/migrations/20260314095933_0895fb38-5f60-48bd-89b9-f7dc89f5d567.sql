
-- Create table for kitchen users (username-only login)
CREATE TABLE public.kitchen_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for kitchen duties
CREATE TABLE public.duties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for duty assignments
CREATE TABLE public.duty_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  duty_id UUID NOT NULL REFERENCES public.duties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.kitchen_users(id) ON DELETE CASCADE,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kitchen_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_assignments ENABLE ROW LEVEL SECURITY;

-- Everyone can read all tables (shared kitchen app)
CREATE POLICY "Anyone can view kitchen users" ON public.kitchen_users FOR SELECT USING (true);
CREATE POLICY "Anyone can insert kitchen users" ON public.kitchen_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update kitchen users" ON public.kitchen_users FOR UPDATE USING (true);

CREATE POLICY "Anyone can view duties" ON public.duties FOR SELECT USING (true);
CREATE POLICY "Anyone can view assignments" ON public.duty_assignments FOR SELECT USING (true);

-- Admin-only write policies (authenticated users = admins)
CREATE POLICY "Authenticated can manage duties" ON public.duties FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update duties" ON public.duties FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete duties" ON public.duties FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can manage assignments" ON public.duty_assignments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update assignments" ON public.duty_assignments FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete assignments" ON public.duty_assignments FOR DELETE USING (auth.uid() IS NOT NULL);
