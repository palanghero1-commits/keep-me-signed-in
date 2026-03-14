import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Shield } from "lucide-react";

interface UserLoginProps {
  onSwitchToAdmin: () => void;
}

export function UserLogin({ onSwitchToAdmin }: UserLoginProps) {
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { loginAsUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await loginAsUser(username);
    } catch (err: any) {
      setError(err.message || "Failed to login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold font-display tracking-tight text-foreground">
            Kitchen Duty Shuffle
          </h1>
          <p className="text-sm text-muted-foreground">Enter your name to check your duties</p>
        </div>

        <Card className="border border-border shadow-sm">
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
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                disabled={isLoading || !username.trim()}
              >
                {isLoading ? "Entering..." : "Enter"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <button
          onClick={onSwitchToAdmin}
          className="flex items-center justify-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Shield className="h-3 w-3" />
          Admin Login
        </button>
      </div>
    </div>
  );
}
