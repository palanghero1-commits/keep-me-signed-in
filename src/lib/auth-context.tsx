import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

type UserMode = "user" | "admin";

interface KitchenUser {
  id: string;
  username: string;
}

interface AuthState {
  mode: UserMode | null;
  kitchenUser: KitchenUser | null;
  adminSession: Session | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  loginAsUser: (username: string) => Promise<void>;
  loginAsAdmin: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    mode: null,
    kitchenUser: null,
    adminSession: null,
    isLoading: true,
  });

  // Restore user session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("kitchen_user");
    if (saved) {
      try {
        const user = JSON.parse(saved);
        setState((s) => ({ ...s, kitchenUser: user, mode: "user", isLoading: false }));
        return;
      } catch {}
    }

    // Check for admin session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session) {
        setState((s) => ({ ...s, adminSession: session, mode: "admin", isLoading: false }));
      } else {
        setState((s) => ({ ...s, isLoading: false }));
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setState((s) => ({ ...s, adminSession: session, mode: "admin", isLoading: false }));
      } else {
        setState((s) => ({ ...s, isLoading: false }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loginAsUser = async (username: string) => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) throw new Error("Username required");

    // Upsert the user
    const { data: existing } = await supabase
      .from("kitchen_users")
      .select("*")
      .eq("username", trimmed)
      .maybeSingle();

    let user: KitchenUser;
    if (existing) {
      await supabase
        .from("kitchen_users")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", existing.id);
      user = { id: existing.id, username: existing.username };
    } else {
      const { data: newUser, error } = await supabase
        .from("kitchen_users")
        .insert({ username: trimmed })
        .select()
        .single();
      if (error || !newUser) throw new Error("Failed to create user");
      user = { id: newUser.id, username: newUser.username };
    }

    localStorage.setItem("kitchen_user", JSON.stringify(user));
    setState({ mode: "user", kitchenUser: user, adminSession: null, isLoading: false });
  };

  const loginAsAdmin = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const logout = () => {
    localStorage.removeItem("kitchen_user");
    supabase.auth.signOut();
    setState({ mode: null, kitchenUser: null, adminSession: null, isLoading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, loginAsUser, loginAsAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
