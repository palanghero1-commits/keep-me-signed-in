import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Plus, Shuffle, Trash2, Users, ClipboardList } from "lucide-react";
import { toast } from "sonner";

interface KitchenUser {
  id: string;
  username: string;
  last_seen_at: string;
}

interface Duty {
  id: string;
  name: string;
  description: string | null;
}

interface Assignment {
  id: string;
  assigned_date: string;
  status: string;
  duty: { name: string } | null;
  user: { username: string } | null;
}

type Tab = "users" | "duties" | "assignments";

export function AdminDashboard() {
  const { logout } = useAuth();
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<KitchenUser[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [newDutyName, setNewDutyName] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const [u, d, a] = await Promise.all([
      supabase.from("kitchen_users").select("*").order("username"),
      supabase.from("duties").select("*").order("name"),
      supabase.from("duty_assignments")
        .select("id, assigned_date, status, duty:duties(name), user:kitchen_users(username)")
        .order("assigned_date", { ascending: false })
        .limit(50),
    ]);
    setUsers(u.data || []);
    setDuties(d.data || []);
    setAssignments((a.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const addDuty = async () => {
    if (!newDutyName.trim()) return;
    const { error } = await supabase.from("duties").insert({ name: newDutyName.trim() });
    if (error) { toast.error(error.message); return; }
    setNewDutyName("");
    toast.success("Duty added");
    fetchAll();
  };

  const deleteDuty = async (id: string) => {
    await supabase.from("duties").delete().eq("id", id);
    toast.success("Duty deleted");
    fetchAll();
  };

  const deleteUser = async (id: string) => {
    await supabase.from("kitchen_users").delete().eq("id", id);
    toast.success("User removed");
    fetchAll();
  };

  const shuffleAssign = async () => {
    if (users.length === 0 || duties.length === 0) {
      toast.error("Need both users and duties to shuffle");
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    
    // Delete today's assignments first
    await supabase.from("duty_assignments").delete().eq("assigned_date", today);

    // Shuffle users
    const shuffled = [...users].sort(() => Math.random() - 0.5);

    // Assign duties round-robin
    const newAssignments = duties.map((duty, i) => ({
      duty_id: duty.id,
      user_id: shuffled[i % shuffled.length].id,
      assigned_date: today,
      status: "pending",
    }));

    const { error } = await supabase.from("duty_assignments").insert(newAssignments);
    if (error) { toast.error(error.message); return; }
    toast.success("Duties shuffled and assigned!");
    fetchAll();
  };

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: "users", label: "Users", icon: Users },
    { key: "duties", label: "Duties", icon: ClipboardList },
    { key: "assignments", label: "Assignments", icon: Shuffle },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-sm font-bold font-display">Kitchen Duty</h1>
          <p className="text-xs text-muted-foreground">Admin Panel</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                tab === t.key
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6">
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            {tab === "users" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold font-display">Users ({users.length})</h2>
                </div>
                <div className="grid gap-2">
                  {users.map((u) => (
                    <Card key={u.id}>
                      <CardContent className="flex items-center justify-between py-3 px-4">
                        <div>
                          <p className="text-sm font-mono font-medium">{u.username}</p>
                          <p className="text-xs text-muted-foreground">Last seen: {new Date(u.last_seen_at).toLocaleDateString()}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => deleteUser(u.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {users.length === 0 && <p className="text-sm text-muted-foreground">No users yet. Users appear when they log in.</p>}
                </div>
              </div>
            )}

            {tab === "duties" && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold font-display">Duties ({duties.length})</h2>
                <div className="flex gap-2">
                  <Input
                    value={newDutyName}
                    onChange={(e) => setNewDutyName(e.target.value)}
                    placeholder="New duty name"
                    className="max-w-xs"
                    onKeyDown={(e) => e.key === "Enter" && addDuty()}
                  />
                  <Button onClick={addDuty} size="sm" className="bg-primary text-primary-foreground">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
                <div className="grid gap-2">
                  {duties.map((d) => (
                    <Card key={d.id}>
                      <CardContent className="flex items-center justify-between py-3 px-4">
                        <p className="text-sm font-medium">{d.name}</p>
                        <Button variant="ghost" size="sm" onClick={() => deleteDuty(d.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {tab === "assignments" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold font-display">Assignments</h2>
                  <Button onClick={shuffleAssign} className="bg-primary text-primary-foreground">
                    <Shuffle className="h-4 w-4 mr-2" />
                    Shuffle Today
                  </Button>
                </div>
                <div className="grid gap-2">
                  {assignments.map((a: any) => (
                    <Card key={a.id}>
                      <CardContent className="flex items-center justify-between py-3 px-4">
                        <div>
                          <p className="text-sm font-medium">{a.duty?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono">{a.user?.username}</span> · {a.assigned_date}
                          </p>
                        </div>
                        <span className={a.status === "done" ? "status-connected" : "status-pending"}>
                          {a.status}
                        </span>
                      </CardContent>
                    </Card>
                  ))}
                  {assignments.length === 0 && <p className="text-sm text-muted-foreground">No assignments. Click "Shuffle Today" to assign duties.</p>}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
