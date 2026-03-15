import { useEffect, useMemo, useState } from "react";
import {
  addWeeks,
  format,
  parseISO,
  subWeeks,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LogOut,
  Pencil,
  Plus,
  Shuffle,
  Trash2,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { WeeklyScheduleBoard } from "@/components/WeeklyScheduleBoard";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  buildWeeklyDutyRotation,
  compareScheduleEntries,
  type ScheduleEntry,
  formatTimeRange,
  getWorkingWeekDays,
  getWeekStart,
  isAssignmentInWeek,
  WEEKDAY_ROTATION_DAY_COUNT,
} from "@/lib/schedule";

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

interface AssignmentRow {
  id: string;
  assigned_date: string;
  start_time: string | null;
  end_time: string | null;
  alarm_enabled: boolean;
  duty_id: string;
  user_id: string;
  status: string;
  duty: { name: string; description: string | null } | null;
  user: { username: string } | null;
}

interface AssignmentFormState {
  id: string | null;
  dutyId: string;
  userId: string;
  assignedDate: string;
  startTime: string;
  endTime: string;
  alarmEnabled: boolean;
  status: string;
}

interface ScheduleSettingsRow {
  id: number;
  rotation_user_count: number;
  default_start_time: string;
  default_end_time: string;
  default_alarm_enabled: boolean;
  default_status: string;
  auto_shuffle_enabled: boolean;
}

interface ScheduleSettingsState {
  rotationUserCount: number;
  startTime: string;
  endTime: string;
  alarmEnabled: boolean;
  status: string;
  autoShuffleEnabled: boolean;
}

type AdminTab = "schedule" | "users" | "duties";

const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettingsState = {
  rotationUserCount: WEEKDAY_ROTATION_DAY_COUNT,
  startTime: "09:00",
  endTime: "10:00",
  alarmEnabled: true,
  status: "pending",
  autoShuffleEnabled: true,
};

function normalizeTime(value: string) {
  return value.length === 5 ? `${value}:00` : value;
}

function toInputTime(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

function toScheduleEntry(row: AssignmentRow): ScheduleEntry {
  return {
    id: row.id,
    assignedDate: row.assigned_date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    dutyName: row.duty?.name ?? "Unknown duty",
    dutyDescription: row.duty?.description ?? null,
    userName: row.user?.username ?? "Unknown user",
    alarmEnabled: row.alarm_enabled,
  };
}

function toScheduleSettingsState(row: ScheduleSettingsRow | null): ScheduleSettingsState {
  if (!row) return DEFAULT_SCHEDULE_SETTINGS;

  return {
    rotationUserCount: row.rotation_user_count,
    startTime: toInputTime(row.default_start_time),
    endTime: toInputTime(row.default_end_time),
    alarmEnabled: row.default_alarm_enabled,
    status: row.default_status,
    autoShuffleEnabled: row.auto_shuffle_enabled,
  };
}

export function AdminDashboard() {
  const { logout } = useAuth();
  const [tab, setTab] = useState<AdminTab>("schedule");
  const [users, setUsers] = useState<KitchenUser[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [newDutyName, setNewDutyName] = useState("");
  const [newDutyDescription, setNewDutyDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedWeekStart, setSelectedWeekStart] = useState(getWeekStart(new Date()));
  const [scheduleSettings, setScheduleSettings] = useState<ScheduleSettingsState>(DEFAULT_SCHEDULE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<AssignmentFormState>({
    id: null,
    dutyId: "",
    userId: "",
    assignedDate: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "10:00",
    alarmEnabled: true,
    status: "pending",
  });

  const weekAssignments = useMemo(
    () => assignments.map(toScheduleEntry).filter((entry) => isAssignmentInWeek(entry, selectedWeekStart)),
    [assignments, selectedWeekStart],
  );
  const workingWeekDays = useMemo(() => getWorkingWeekDays(selectedWeekStart), [selectedWeekStart]);

  const fetchAll = async () => {
    const rangeStart = format(subWeeks(new Date(), 2), "yyyy-MM-dd");
    const rangeEnd = format(addWeeks(new Date(), 8), "yyyy-MM-dd");

    const [usersResponse, dutiesResponse, assignmentsResponse, settingsResponse] = await Promise.all([
      supabase.from("kitchen_users").select("*").order("username"),
      supabase.from("duties").select("*").order("name"),
      supabase
        .from("duty_assignments")
        .select("id, assigned_date, start_time, end_time, alarm_enabled, duty_id, user_id, status, duty:duties(name, description), user:kitchen_users(username)")
        .gte("assigned_date", rangeStart)
        .lte("assigned_date", rangeEnd)
        .order("assigned_date", { ascending: true })
        .order("start_time", { ascending: true }),
      supabase.from("schedule_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

    setUsers((usersResponse.data as KitchenUser[] | null) ?? []);
    setDuties((dutiesResponse.data as Duty[] | null) ?? []);
    setAssignments((assignmentsResponse.data as AssignmentRow[] | null) ?? []);
    setScheduleSettings(toScheduleSettingsState((settingsResponse.data as ScheduleSettingsRow | null) ?? null));
    setLoading(false);
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const updateForm = <Key extends keyof AssignmentFormState>(key: Key, value: AssignmentFormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = (targetDate = selectedDate) => {
    setForm({
      id: null,
      dutyId: duties[0]?.id ?? "",
      userId: users[0]?.id ?? "",
      assignedDate: format(targetDate, "yyyy-MM-dd"),
      startTime: "09:00",
      endTime: "10:00",
      alarmEnabled: true,
      status: "pending",
    });
  };

  useEffect(() => {
    if (!form.dutyId && duties[0]?.id) {
      updateForm("dutyId", duties[0].id);
    }
  }, [duties, form.dutyId]);

  useEffect(() => {
    if (!form.userId && users[0]?.id) {
      updateForm("userId", users[0].id);
    }
  }, [form.userId, users]);

  useEffect(() => {
    setScheduleSettings((current) => ({
      ...current,
      rotationUserCount:
        users.length === 0
          ? 0
          : current.rotationUserCount === 0
            ? Math.min(users.length, WEEKDAY_ROTATION_DAY_COUNT)
            : Math.min(current.rotationUserCount, users.length),
    }));
  }, [users.length]);

  const handleDateSelection = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setSelectedWeekStart(getWeekStart(date));
    updateForm("assignedDate", format(date, "yyyy-MM-dd"));
  };

  const handleAssignedDateInput = (value: string) => {
    updateForm("assignedDate", value);
    if (!value) return;
    const parsed = parseISO(value);
    setSelectedDate(parsed);
    setSelectedWeekStart(getWeekStart(parsed));
  };

  const updateScheduleSettings = <Key extends keyof ScheduleSettingsState>(
    key: Key,
    value: ScheduleSettingsState[Key],
  ) => {
    setScheduleSettings((current) => ({ ...current, [key]: value }));
  };

  const handleRotationUserCountChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      updateScheduleSettings("rotationUserCount", 0);
      return;
    }

    updateScheduleSettings("rotationUserCount", Math.min(Math.max(parsed, 1), users.length));
  };

  const saveScheduleSettings = async (showToast = true) => {
    if (!scheduleSettings.startTime || !scheduleSettings.endTime) {
      toast.error("Set the weekly start and end time before saving auto-shuffle settings.");
      return false;
    }

    if (scheduleSettings.endTime <= scheduleSettings.startTime) {
      toast.error("The weekly end time must be later than the weekly start time.");
      return false;
    }

    const { error } = await supabase.from("schedule_settings").upsert({
      id: 1,
      rotation_user_count: Math.max(scheduleSettings.rotationUserCount, 1),
      default_start_time: normalizeTime(scheduleSettings.startTime),
      default_end_time: normalizeTime(scheduleSettings.endTime),
      default_alarm_enabled: scheduleSettings.alarmEnabled,
      default_status: scheduleSettings.status,
      auto_shuffle_enabled: scheduleSettings.autoShuffleEnabled,
    });

    if (error) {
      toast.error(error.message);
      return false;
    }

    if (showToast) {
      toast.success("Weekly auto-shuffle settings saved");
    }

    return true;
  };

  const saveAssignment = async () => {
    if (!form.dutyId || !form.userId || !form.assignedDate) {
      toast.error("Pick a duty, user, and date before saving.");
      return;
    }

    const payload = {
      duty_id: form.dutyId,
      user_id: form.userId,
      assigned_date: form.assignedDate,
      start_time: form.startTime ? normalizeTime(form.startTime) : null,
      end_time: form.endTime ? normalizeTime(form.endTime) : null,
      alarm_enabled: form.alarmEnabled,
      status: form.status,
    };

    const query = form.id
      ? supabase.from("duty_assignments").update(payload).eq("id", form.id)
      : supabase.from("duty_assignments").insert(payload);

    const { error } = await query;
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(form.id ? "Schedule updated" : "Schedule created");
    resetForm(selectedDate);
    await fetchAll();
  };

  const deleteAssignment = async (id: string) => {
    const { error } = await supabase.from("duty_assignments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Schedule deleted");
    await fetchAll();
  };

  const editAssignment = (assignment: AssignmentRow) => {
    setTab("schedule");
    const targetDate = parseISO(assignment.assigned_date);
    setSelectedDate(targetDate);
    setSelectedWeekStart(getWeekStart(targetDate));
    setForm({
      id: assignment.id,
      dutyId: assignment.duty_id,
      userId: assignment.user_id,
      assignedDate: assignment.assigned_date,
      startTime: toInputTime(assignment.start_time),
      endTime: toInputTime(assignment.end_time),
      alarmEnabled: assignment.alarm_enabled,
      status: assignment.status,
    });
  };

  const addDuty = async () => {
    if (!newDutyName.trim()) {
      toast.error("Duty name is required.");
      return;
    }

    const { error } = await supabase
      .from("duties")
      .insert({ name: newDutyName.trim(), description: newDutyDescription.trim() || null });

    if (error) {
      toast.error(error.message);
      return;
    }

    setNewDutyName("");
    setNewDutyDescription("");
    toast.success("Duty added");
    await fetchAll();
  };

  const deleteDuty = async (id: string) => {
    const { error } = await supabase.from("duties").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Duty deleted");
    await fetchAll();
  };

  const deleteUser = async (id: string) => {
    const { error } = await supabase.from("kitchen_users").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("User removed");
    await fetchAll();
  };

  const autoBuildSelectedWeek = async () => {
    if (users.length === 0 || duties.length === 0) {
      toast.error("You need both users and duties before building the week.");
      return;
    }

    if (scheduleSettings.rotationUserCount < WEEKDAY_ROTATION_DAY_COUNT) {
      toast.error(`Choose at least ${WEEKDAY_ROTATION_DAY_COUNT} people to avoid repeating the same duty this week.`);
      return;
    }

    const settingsSaved = await saveScheduleSettings(false);
    if (!settingsSaved) return;

    const rangeStart = format(workingWeekDays[0], "yyyy-MM-dd");
    const rangeEnd = format(workingWeekDays[workingWeekDays.length - 1], "yyyy-MM-dd");

    let payload;
    try {
      payload = buildWeeklyDutyRotation({
        weekStart: selectedWeekStart,
        users,
        duties,
        participantCount: scheduleSettings.rotationUserCount,
        startTime: scheduleSettings.startTime ? normalizeTime(scheduleSettings.startTime) : null,
        endTime: scheduleSettings.endTime ? normalizeTime(scheduleSettings.endTime) : null,
        alarmEnabled: scheduleSettings.alarmEnabled,
        status: scheduleSettings.status,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to build the weekly rotation.");
      return;
    }

    const { error: deleteError } = await supabase
      .from("duty_assignments")
      .delete()
      .gte("assigned_date", rangeStart)
      .lte("assigned_date", rangeEnd);

    if (deleteError) {
      toast.error(deleteError.message);
      return;
    }

    const { error } = await supabase.from("duty_assignments").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Monday to Friday schedule rebuilt with no same-duty repeats");
    await fetchAll();
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(50,180,205,0.18),transparent_24%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted))/0.72)]">
      <header className="border-b border-border/70 bg-background/80 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold font-display">Kitchen Duty Admin</h1>
              <span className="rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-secondary">
                Weekly planner
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Publish weekly schedules, set exact duty times, and manage the team from any screen size.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedWeekStart((current) => subWeeks(current, 1))}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous week
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedWeekStart(getWeekStart(new Date()))}>
              This week
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedWeekStart((current) => addWeeks(current, 1))}>
              Next week
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={logout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border/70 bg-card/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <Users className="h-4 w-4 text-primary" />
                Active users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{users.length}</p>
              <p className="text-sm text-muted-foreground">People available for weekly duty rotation.</p>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <ClipboardList className="h-4 w-4 text-secondary" />
                Duties tracked
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{duties.length}</p>
              <p className="text-sm text-muted-foreground">Reusable tasks you can assign across the week.</p>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <CalendarDays className="h-4 w-4 text-primary" />
                Week focus
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{format(selectedWeekStart, "MMMM d, yyyy")}</p>
              <p className="text-sm text-muted-foreground">
                {weekAssignments.length} schedules loaded for the selected week.
              </p>
            </CardContent>
          </Card>
        </section>

        <Tabs value={tab} onValueChange={(value) => setTab(value as AdminTab)} className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-2xl bg-transparent p-0">
            <TabsTrigger value="schedule" className="rounded-full border border-border/70 bg-card px-4 py-2">
              Schedule
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-full border border-border/70 bg-card px-4 py-2">
              Users
            </TabsTrigger>
            <TabsTrigger value="duties" className="rounded-full border border-border/70 bg-card px-4 py-2">
              Duties
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
              <Card className="border-border/70 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-display">Schedule builder</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-muted/30 p-3">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelection}
                      className="mx-auto"
                    />
                  </div>

                  <div className="grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Duty</label>
                        <Select value={form.dutyId} onValueChange={(value) => updateForm("dutyId", value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select duty" />
                          </SelectTrigger>
                          <SelectContent>
                            {duties.map((duty) => (
                              <SelectItem key={duty.id} value={duty.id}>
                                {duty.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">User</label>
                        <Select value={form.userId} onValueChange={(value) => updateForm("userId", value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select user" />
                          </SelectTrigger>
                          <SelectContent>
                            {users.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.username}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Date</label>
                        <Input
                          type="date"
                          value={form.assignedDate}
                          onChange={(event) => handleAssignedDateInput(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Status</label>
                        <Select value={form.status} onValueChange={(value) => updateForm("status", value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="done">Done</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Start time</label>
                        <Input
                          type="time"
                          value={form.startTime}
                          onChange={(event) => updateForm("startTime", event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">End time</label>
                        <Input
                          type="time"
                          value={form.endTime}
                          onChange={(event) => updateForm("endTime", event.target.value)}
                        />
                      </div>
                    </div>

                    <label className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3">
                      <Checkbox
                        checked={form.alarmEnabled}
                        onCheckedChange={(checked) => updateForm("alarmEnabled", checked === true)}
                        className="mt-0.5"
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">Enable duty alarm</span>
                        <span className="block text-xs text-muted-foreground">
                          Staff devices will surface an in-app reminder when this time arrives.
                        </span>
                      </span>
                    </label>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button onClick={saveAssignment} className="gap-2">
                        <Plus className="h-4 w-4" />
                        {form.id ? "Update schedule" : "Add schedule"}
                      </Button>
                      <Button variant="outline" onClick={() => resetForm(selectedDate)} disabled={!form.id}>
                        Reset form
                      </Button>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">5-day weekly rotation</p>
                        <p className="text-xs text-muted-foreground">
                          Builds Monday to Friday for every duty in the selected week and prevents the same person
                          from repeating the same duty within that week.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">People included in the 5-day rotation</label>
                        <Input
                          type="number"
                          min={1}
                          max={Math.max(users.length, 1)}
                          value={scheduleSettings.rotationUserCount === 0 ? "" : String(scheduleSettings.rotationUserCount)}
                          onChange={(event) => handleRotationUserCountChange(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Week range: {format(workingWeekDays[0], "MMM d")} to{" "}
                          {format(workingWeekDays[workingWeekDays.length - 1], "MMM d")}. Choose at least{" "}
                          {WEEKDAY_ROTATION_DAY_COUNT} people for no-repeat duty assignments. The planner uses the
                          first {scheduleSettings.rotationUserCount || 0} users from the current user list.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Weekly start time</label>
                          <Input
                            type="time"
                            value={scheduleSettings.startTime}
                            onChange={(event) => updateScheduleSettings("startTime", event.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Weekly end time</label>
                          <Input
                            type="time"
                            value={scheduleSettings.endTime}
                            onChange={(event) => updateScheduleSettings("endTime", event.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Weekly status</label>
                          <Select
                            value={scheduleSettings.status}
                            onValueChange={(value) => updateScheduleSettings("status", value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-3">
                          <label className="flex items-start gap-3">
                            <Checkbox
                              checked={scheduleSettings.alarmEnabled}
                              onCheckedChange={(checked) => updateScheduleSettings("alarmEnabled", checked === true)}
                              className="mt-0.5"
                            />
                            <span className="space-y-1">
                              <span className="block text-sm font-medium">Weekly alarm enabled</span>
                              <span className="block text-xs text-muted-foreground">
                                Every auto-built duty will include the alarm flag.
                              </span>
                            </span>
                          </label>
                          <label className="flex items-start gap-3">
                            <Checkbox
                              checked={scheduleSettings.autoShuffleEnabled}
                              onCheckedChange={(checked) =>
                                updateScheduleSettings("autoShuffleEnabled", checked === true)
                              }
                              className="mt-0.5"
                            />
                            <span className="space-y-1">
                              <span className="block text-sm font-medium">Sunday 8:00 PM auto-shuffle</span>
                              <span className="block text-xs text-muted-foreground">
                                Runs for next Monday in Asia/Singapore when enabled. Manual building still works even
                                when this is turned off.
                              </span>
                            </span>
                          </label>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button variant="outline" onClick={() => void saveScheduleSettings()} className="w-full">
                          Save auto-shuffle settings
                        </Button>
                        <Button variant="secondary" onClick={autoBuildSelectedWeek} className="w-full gap-2">
                          <Shuffle className="h-4 w-4" />
                          Manual build 5-day schedule
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Sunday 8:00 PM Asia/Singapore is Sunday 12:00 UTC. Users will receive an update notification
                        when the new week is published.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <WeeklyScheduleBoard
                  assignments={weekAssignments}
                  weekStart={selectedWeekStart}
                  emptyLabel="No schedule published"
                  title="Published weekly calendar"
                />

                <Card className="border-border/70 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-display">Scheduled assignments</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : weekAssignments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No schedules exist for the selected week.</p>
                    ) : (
                      <div className="space-y-3">
                        {assignments
                          .filter((assignment) =>
                            isAssignmentInWeek(toScheduleEntry(assignment), selectedWeekStart),
                          )
                          .sort((left, right) => compareScheduleEntries(toScheduleEntry(left), toScheduleEntry(right)))
                          .map((assignment) => (
                            <div
                              key={assignment.id}
                              className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 lg:flex-row lg:items-center lg:justify-between"
                            >
                              <div>
                                <p className="text-base font-semibold">{assignment.duty?.name ?? "Unknown duty"}</p>
                                <p className="text-sm text-muted-foreground">
                                  {assignment.user?.username ?? "Unknown user"} • {assignment.assigned_date} •{" "}
                                  {formatTimeRange(assignment.start_time, assignment.end_time)}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={assignment.status === "done" ? "status-connected" : "status-pending"}>
                                  {assignment.status}
                                </span>
                                <Button variant="outline" size="sm" onClick={() => editAssignment(assignment)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => deleteAssignment(assignment.id)}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display">Kitchen users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {users.map((user) => (
                    <div key={user.id} className="rounded-2xl border border-border/70 bg-card/60 p-4">
                      <p className="font-mono text-sm font-semibold">{user.username}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Last seen {format(parseISO(user.last_seen_at), "MMM d, yyyy h:mm a")}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteUser(user.id)}
                        className="mt-3 gap-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="duties">
            <div className="grid gap-4 xl:grid-cols-[0.65fr_1.35fr]">
              <Card className="border-border/70 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-display">Add duty</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    value={newDutyName}
                    onChange={(event) => setNewDutyName(event.target.value)}
                    placeholder="Duty name"
                  />
                  <Input
                    value={newDutyDescription}
                    onChange={(event) => setNewDutyDescription(event.target.value)}
                    placeholder="Description"
                  />
                  <Button onClick={addDuty} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add duty
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border/70 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-display">Duty library</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2">
                    {duties.map((duty) => (
                      <div key={duty.id} className="rounded-2xl border border-border/70 bg-card/60 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold">{duty.name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {duty.description || "No description provided."}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteDuty(duty.id)}
                            className="gap-2 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
