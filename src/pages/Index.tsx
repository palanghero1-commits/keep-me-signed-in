import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { UserLogin } from "@/components/UserLogin";
import { AdminLogin } from "@/components/AdminLogin";
import { DutySchedule } from "@/components/DutySchedule";
import { AdminDashboard } from "@/components/AdminDashboard";

const Index = () => {
  const { mode, isLoading } = useAuth();
  const [loginMode, setLoginMode] = useState<"user" | "admin">("user");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground font-mono">Loading...</div>
      </div>
    );
  }

  // Authenticated views
  if (mode === "user") return <DutySchedule />;
  if (mode === "admin") return <AdminDashboard />;

  // Login views
  if (loginMode === "admin") {
    return <AdminLogin onSwitchToUser={() => setLoginMode("user")} />;
  }

  return <UserLogin onSwitchToAdmin={() => setLoginMode("admin")} />;
};

export default Index;
