import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Lock } from "lucide-react";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";

interface AdminLoginProps {
  onSwitchToUser: () => void;
}

export function AdminLogin({ onSwitchToUser }: AdminLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { loginAsAdmin } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await loginAsAdmin(email, password, keepSignedIn);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid credentials";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(50,180,205,0.18),transparent_32%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted))/0.65)] p-4 sm:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col justify-center gap-8 lg:grid lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <section className="order-2 space-y-6 lg:order-1">
          <div className="space-y-4">
            <span className="inline-flex rounded-full border border-secondary/20 bg-secondary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-secondary">
              Admin Workspace
            </span>
            <div className="space-y-3">
              <h1 className="max-w-xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Plan the week, publish time slots, and keep the crew on track.
              </h1>
              <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                Admin access is role-protected, supports persistent sign-in, and powers the weekly calendar plus in-app alert system.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
              <p className="text-sm font-semibold">Weekly planner</p>
              <p className="mt-1 text-sm text-muted-foreground">Build one week of assignments with dates and times.</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
              <p className="text-sm font-semibold">Role enforced</p>
              <p className="mt-1 text-sm text-muted-foreground">Only accounts in the admin role table can enter the panel.</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
              <p className="text-sm font-semibold">Alarm aware</p>
              <p className="mt-1 text-sm text-muted-foreground">Schedules can carry time-based reminders for staff devices.</p>
            </div>
          </div>

          <PwaInstallPrompt className="hidden lg:block" />
        </section>

        <section className="order-1 w-full lg:order-2">
          <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-accent mb-2">
            <Lock className="h-5 w-5 text-accent-foreground" />
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-foreground">
            Admin Login
          </h1>
          <p className="text-sm text-muted-foreground">Authorized personnel only</p>
        </div>

        <Card className="border border-border/80 bg-card/90 shadow-xl shadow-secondary/5 backdrop-blur">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="h-11"
                autoFocus
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="h-11"
              />
              <label className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/40 p-3">
                <Checkbox
                  checked={keepSignedIn}
                  onCheckedChange={(checked) => setKeepSignedIn(checked === true)}
                  className="mt-0.5"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">Keep me signed in</span>
                  <span className="block text-xs text-muted-foreground">
                    Use session-only mode on shared devices to clear admin access when the browser closes.
                  </span>
                </span>
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                className="w-full h-11 bg-foreground text-background hover:bg-foreground/90 font-semibold"
                disabled={isLoading || !email || !password}
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <PwaInstallPrompt className="lg:hidden" />

        <button
          onClick={onSwitchToUser}
          className="flex items-center justify-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to User Login
        </button>
      </div>
        </section>
      </div>
    </div>
  );
}
