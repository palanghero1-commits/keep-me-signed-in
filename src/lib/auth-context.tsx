import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import {
  clearStoredKitchenUser,
  readStoredKitchenUser,
  setAdminSessionPersistence,
  storeKitchenUser,
  type StoredKitchenUser,
} from "@/lib/session-storage";
import { disableBrowserPushSubscription } from "@/lib/push-notifications";

type UserMode = "user" | "admin";

type KitchenUser = StoredKitchenUser;

interface AuthState {
  mode: UserMode | null;
  kitchenUser: KitchenUser | null;
  adminSession: Session | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  loginAsUser: (username: string, keepSignedIn: boolean) => Promise<void>;
  loginAsAdmin: (email: string, password: string, keepSignedIn: boolean) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const DEFAULT_AUTH_STATE: AuthState = {
  mode: null,
  kitchenUser: null,
  adminSession: null,
  isLoading: false,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    ...DEFAULT_AUTH_STATE,
    isLoading: true,
  });

  useEffect(() => {
    let isActive = true;

    const applyState = (nextState: AuthState) => {
      if (isActive) {
        setState(nextState);
      }
    };

    const verifyAdminSession = async (session: Session) => {
      const { data, error } = await supabase.rpc("is_admin", {
        check_user_id: session.user.id,
      });

      if (error) {
        throw error;
      }

      return Boolean(data);
    };

    const syncAuthState = async (session: Session | null) => {
      if (session) {
        try {
          const isAdmin = await verifyAdminSession(session);
          if (isAdmin) {
            clearStoredKitchenUser();
            applyState({
              mode: "admin",
              kitchenUser: null,
              adminSession: session,
              isLoading: false,
            });
            return;
          }
        } catch (error) {
          console.error("Failed to verify admin role", error);
        }

        await supabase.auth.signOut();
        applyState(DEFAULT_AUTH_STATE);
        return;
      }

      const storedUser = readStoredKitchenUser();
      if (storedUser) {
        applyState({
          mode: "user",
          kitchenUser: storedUser,
          adminSession: null,
          isLoading: false,
        });
        return;
      }

      applyState(DEFAULT_AUTH_STATE);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      void syncAuthState(session);
    });

    void supabase.auth.getSession().then(({ data: { session } }) => syncAuthState(session));

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  const loginAsUser = async (username: string, keepSignedIn: boolean) => {
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

    storeKitchenUser(user, keepSignedIn);
    setState({ mode: "user", kitchenUser: user, adminSession: null, isLoading: false });
  };

  const loginAsAdmin = async (email: string, password: string, keepSignedIn: boolean) => {
    setAdminSessionPersistence(keepSignedIn);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session) throw new Error("Admin session was not created");

    const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin", {
      check_user_id: data.session.user.id,
    });

    if (roleError) {
      await supabase.auth.signOut();
      throw roleError;
    }

    if (!isAdmin) {
      await supabase.auth.signOut();
      throw new Error("This account does not have admin access");
    }

    clearStoredKitchenUser();
    setState({
      mode: "admin",
      kitchenUser: null,
      adminSession: data.session,
      isLoading: false,
    });
  };

  const logout = () => {
    void disableBrowserPushSubscription().catch((error) => {
      console.error("Failed to disable browser push subscription", error);
    });
    clearStoredKitchenUser();
    void supabase.auth.signOut();
    setState(DEFAULT_AUTH_STATE);
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
