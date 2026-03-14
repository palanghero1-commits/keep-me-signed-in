import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, Wifi } from "lucide-react";

interface Assignment {
  id: string;
  assigned_date: string;
  status: string;
  duty: { name: string; description: string | null } | null;
}

export function DutySchedule() {
  const { kitchenUser, logout } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!kitchenUser) return;

    const fetchAssignments = async () => {
      // Fetch my assignments
      const { data: mine } = await supabase
        .from("duty_assignments")
        .select("id, assigned_date, status, duty:duties(name, description)")
        .eq("user_id", kitchenUser.id)
        .order("assigned_date", { ascending: false });

      // Fetch all assignments for schedule view
      const { data: all } = await supabase
        .from("duty_assignments")
        .select("id, assigned_date, status, duty:duties(name, description), user:kitchen_users(username)")
        .order("assigned_date", { ascending: false })
        .limit(20);

      setAssignments((mine as any) || []);
      setAllAssignments(all || []);
      setLoading(false);
    };

    fetchAssignments();

    // Real-time subscription
    const channel = supabase
      .channel("duty_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "duty_assignments" }, () => {
        fetchAssignments();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [kitchenUser]);

  if (!kitchenUser) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold font-display">Kitchen Duty</h1>
            <span className="status-connected">
              <Wifi className="h-3 w-3" />
              Connected
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-muted-foreground">{kitchenUser.username}</span>
            <Button variant="ghost" size="sm" onClick={logout} className="h-8 px-2">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {/* My Duties */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">My Duties</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No duties assigned to you yet.</p>
            ) : (
              <div className="space-y-2">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{a.duty?.name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{a.assigned_date}</p>
                    </div>
                    <span className={a.status === "done" ? "status-connected" : "status-pending"}>
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Schedule Overview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            {allAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No schedule yet. Admin will set it up.</p>
            ) : (
              <div className="space-y-2">
                {allAssignments.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{a.duty?.name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{a.user?.username}</span> · {a.assigned_date}
                      </p>
                    </div>
                    <span className={a.status === "done" ? "status-connected" : "status-pending"}>
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
