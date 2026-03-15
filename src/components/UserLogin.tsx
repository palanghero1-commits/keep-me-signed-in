import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Shield } from "lucide-react";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";

interface UserLoginProps {
  onSwitchToAdmin: () => void;
}

export function UserLogin({ onSwitchToAdmin }: UserLoginProps) {
  const [username, setUsername] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { loginAsUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await loginAsUser(username, keepSignedIn);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to login";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(80,210,165,0.18),transparent_32%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted))/0.65)] p-4 sm:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col justify-center gap-8 lg:grid lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section className="space-y-6">
          <div className="space-y-4">
            <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
              Kitchen Duty PWA
            </span>
            <div className="space-y-3">
              <h1 className="max-w-xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Weekly kitchen schedules with reminders that stay visible.
              </h1>
              <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                Check your weekly duty calendar, stay signed in on shared or personal devices, and get loud on-screen reminders when a scheduled shift is due.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
              <p className="text-sm font-semibold">Responsive</p>
              <p className="mt-1 text-sm text-muted-foreground">Optimized for phones, tablets, and desktop screens.</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
              <p className="text-sm font-semibold">Weekly calendar</p>
              <p className="mt-1 text-sm text-muted-foreground">See the whole week instead of only today’s list.</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
              <p className="text-sm font-semibold">Alarm-ready</p>
              <p className="mt-1 text-sm text-muted-foreground">Use notifications and an in-app alarm overlay for due schedules.</p>
            </div>
          </div>

          <PwaInstallPrompt className="hidden lg:block" />
        </section>

        <section className="w-full">
          <div className="mx-auto w-full max-w-sm space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold font-display tracking-tight text-foreground">
                Kitchen Duty Shuffle
              </h2>
              <p className="text-sm text-muted-foreground">Enter your name to check your duties</p>
            </div>

            <Card className="border border-border/80 bg-card/90 shadow-xl shadow-primary/5 backdrop-blur">
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    className="h-12 text-base font-mono"
                    autoFocus
                    autoComplete="off"
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
                        Turn this off on shared devices to keep the login only for this browser session.
                      </span>
                    </span>
                  </label>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button
                    type="submit"
                    className="h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                    disabled={isLoading || !username.trim()}
                  >
                    {isLoading ? "Entering..." : "Enter"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </CardContent>
            </Card>

            <PwaInstallPrompt className="lg:hidden" />

            <button
              onClick={onSwitchToAdmin}
              className="flex items-center justify-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Shield className="h-3 w-3" />
              Admin Login
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
