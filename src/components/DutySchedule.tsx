import { useEffect, useMemo, useRef, useState } from "react";
import { addWeeks, format, parseISO, subWeeks } from "date-fns";
import {
  BellRing,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Settings2,
  ShieldAlert,
  Volume2,
  Wifi,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeeklyScheduleBoard } from "@/components/WeeklyScheduleBoard";
import { toast } from "sonner";
import {
  supportsPushNotifications,
  syncBrowserPushSubscription,
} from "@/lib/push-notifications";
import {
  type ScheduleEntry,
  formatTimeRange,
  formatTimeValue,
  getWeekStart,
  isAssignmentInWeek,
  parseAssignmentDateTime,
} from "@/lib/schedule";

interface AssignmentRow {
  id: string;
  assigned_date: string;
  start_time: string | null;
  end_time: string | null;
  alarm_enabled: boolean;
  status: string;
  duty_id: string;
  user_id: string;
  duty: { name: string; description: string | null } | null;
  user?: { username: string } | null;
}

interface UserNotificationRow {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  body: string;
  week_start: string | null;
  read_at: string | null;
  created_at: string;
}

type NotificationPermissionState = NotificationPermission | "unsupported";

const ALARM_DISMISSED_PREFIX = "alarm-dismissed:";
const ALARM_SNOOZE_PREFIX = "alarm-snooze:";
const USER_ALARM_SETTINGS_KEY = "kitchen-user-alarm-settings";
const ALARM_WINDOW_MS = 60 * 60 * 1000;

interface AlarmSettings {
  enabled: boolean;
  volume: number;
  vibrate: boolean;
  voicePrompt: boolean;
  snoozeMinutes: number;
}

const DEFAULT_ALARM_SETTINGS: AlarmSettings = {
  enabled: true,
  volume: 100,
  vibrate: true,
  voicePrompt: true,
  snoozeMinutes: 5,
};

function readAlarmSettings() {
  const saved = window.localStorage.getItem(USER_ALARM_SETTINGS_KEY);
  if (!saved) return DEFAULT_ALARM_SETTINGS;

  try {
    return {
      ...DEFAULT_ALARM_SETTINGS,
      ...(JSON.parse(saved) as Partial<AlarmSettings>),
    };
  } catch {
    return DEFAULT_ALARM_SETTINGS;
  }
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
    userName: row.user?.username ?? null,
    alarmEnabled: row.alarm_enabled,
  };
}

function getStorageNumber(key: string) {
  const value = window.localStorage.getItem(key);
  return value ? Number(value) : null;
}

function getStorageBoolean(key: string) {
  return window.localStorage.getItem(key) === "1";
}

function markAlarmDismissed(assignmentId: string) {
  window.localStorage.setItem(`${ALARM_DISMISSED_PREFIX}${assignmentId}`, "1");
  window.localStorage.removeItem(`${ALARM_SNOOZE_PREFIX}${assignmentId}`);
}

function setAlarmSnooze(assignmentId: string, until: number) {
  window.localStorage.setItem(`${ALARM_SNOOZE_PREFIX}${assignmentId}`, String(until));
}

export function DutySchedule() {
  const { kitchenUser, logout } = useAuth();
  const [myAssignments, setMyAssignments] = useState<AssignmentRow[]>([]);
  const [teamAssignments, setTeamAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeekStart, setSelectedWeekStart] = useState(getWeekStart(new Date()));
  const [currentAlarm, setCurrentAlarm] = useState<ScheduleEntry | null>(null);
  const [alarmSettings, setAlarmSettings] = useState<AlarmSettings>(DEFAULT_ALARM_SETTINGS);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const stopAlarmRef = useRef<(() => void) | null>(null);
  const notifiedAssignmentsRef = useRef<Set<string>>(new Set());
  const shownUpdateNotificationsRef = useRef<Set<string>>(new Set());

  const mySchedule = useMemo(() => myAssignments.map(toScheduleEntry), [myAssignments]);
  const teamSchedule = useMemo(() => teamAssignments.map(toScheduleEntry), [teamAssignments]);
  const selectedWeekMySchedule = useMemo(
    () => mySchedule.filter((assignment) => isAssignmentInWeek(assignment, selectedWeekStart)),
    [mySchedule, selectedWeekStart],
  );
  const selectedWeekTeamSchedule = useMemo(
    () => teamSchedule.filter((assignment) => isAssignmentInWeek(assignment, selectedWeekStart)),
    [selectedWeekStart, teamSchedule],
  );
  const startAlarmSound = () => {
    const AudioCtx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return () => undefined;

    const context = new AudioCtx();
    const triggerVoicePrompt = () => {
      if (!alarmSettings.voicePrompt || typeof window.speechSynthesis === "undefined") return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("Kitchen duty alarm. Your schedule is due now.");
      utterance.volume = 1;
      utterance.rate = 1;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    };

    const emitTone = () => {
      const masterGain = context.createGain();
      const volume = Math.min(Math.max(alarmSettings.volume / 100, 0.15), 1);
      masterGain.gain.setValueAtTime(0.0001, context.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(0.45 * volume, context.currentTime + 0.01);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
      masterGain.connect(context.destination);

      [880, 1320, 1760].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        oscillator.type = index === 1 ? "sawtooth" : "square";
        oscillator.frequency.value = frequency;
        oscillator.connect(masterGain);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.45);
      });

      if (alarmSettings.vibrate && "vibrate" in navigator) {
        navigator.vibrate([450, 150, 450]);
      }
    };

    void context.resume();
    emitTone();
    triggerVoicePrompt();
    const interval = window.setInterval(() => {
      emitTone();
      triggerVoicePrompt();
    }, 850);

    return () => {
      window.clearInterval(interval);
      if ("vibrate" in navigator) {
        navigator.vibrate(0);
      }
      if (typeof window.speechSynthesis !== "undefined") {
        window.speechSynthesis.cancel();
      }
      void context.close();
    };
  };

  useEffect(() => {
    setAlarmSettings(readAlarmSettings());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(USER_ALARM_SETTINGS_KEY, JSON.stringify(alarmSettings));
  }, [alarmSettings]);

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      return;
    }

    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!kitchenUser || notificationPermission !== "granted") return;
    if (!supportsPushNotifications()) return;

    void syncBrowserPushSubscription(kitchenUser.id).catch((error) => {
      console.error("Failed to sync push subscription", error);
    });
  }, [kitchenUser, notificationPermission]);

  useEffect(() => {
    if (!kitchenUser) return;

    const fetchAssignments = async () => {
      const rangeStart = format(subWeeks(new Date(), 1), "yyyy-MM-dd");
      const rangeEnd = format(addWeeks(new Date(), 4), "yyyy-MM-dd");

      const [mineResponse, teamResponse] = await Promise.all([
        supabase
          .from("duty_assignments")
          .select("id, assigned_date, start_time, end_time, alarm_enabled, status, duty_id, user_id, duty:duties(name, description)")
          .eq("user_id", kitchenUser.id)
          .gte("assigned_date", rangeStart)
          .lte("assigned_date", rangeEnd)
          .order("assigned_date", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("duty_assignments")
          .select("id, assigned_date, start_time, end_time, alarm_enabled, status, duty_id, user_id, duty:duties(name, description), user:kitchen_users(username)")
          .gte("assigned_date", rangeStart)
          .lte("assigned_date", rangeEnd)
          .order("assigned_date", { ascending: true })
          .order("start_time", { ascending: true }),
      ]);

      setMyAssignments((mineResponse.data as AssignmentRow[] | null) ?? []);
      setTeamAssignments((teamResponse.data as AssignmentRow[] | null) ?? []);
      setLoading(false);
    };

    const markNotificationsRead = async (notificationIds: string[]) => {
      if (notificationIds.length === 0) return;

      await supabase
        .from("user_notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", notificationIds);
    };

    const announceScheduleUpdates = async (rows: UserNotificationRow[]) => {
      const unseenRows = rows.filter((row) => !shownUpdateNotificationsRef.current.has(row.id));
      if (unseenRows.length === 0) return;

      unseenRows.forEach((row) => {
        shownUpdateNotificationsRef.current.add(row.id);
        toast(row.title, {
          description: row.body,
        });

        if (notificationPermission === "granted") {
          new Notification(row.title, {
            body: row.body,
            tag: `schedule-update-${row.week_start ?? row.id}`,
          });
        }
      });

      await markNotificationsRead(unseenRows.map((row) => row.id));
    };

    const fetchUnreadNotifications = async () => {
      const { data } = await supabase
        .from("user_notifications")
        .select("id, user_id, notification_type, title, body, week_start, read_at, created_at")
        .eq("user_id", kitchenUser.id)
        .is("read_at", null)
        .order("created_at", { ascending: true });

      await announceScheduleUpdates((data as UserNotificationRow[] | null) ?? []);
    };

    void fetchAssignments();
    void fetchUnreadNotifications();

    const assignmentsChannel = supabase
      .channel(`duty_changes_${kitchenUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "duty_assignments" }, () => {
        void fetchAssignments();
      })
      .subscribe();

    const notificationsChannel = supabase
      .channel(`duty_notifications_${kitchenUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${kitchenUser.id}`,
        },
        (payload) => {
          void announceScheduleUpdates([payload.new as UserNotificationRow]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(assignmentsChannel);
      void supabase.removeChannel(notificationsChannel);
    };
  }, [kitchenUser, notificationPermission]);

  useEffect(() => {
    if (!mySchedule.length) return;

    const maybeNotify = (assignment: ScheduleEntry) => {
      if (notificationPermission !== "granted" || notifiedAssignmentsRef.current.has(assignment.id)) return;
      const body = `${assignment.dutyName} starts at ${formatTimeValue(assignment.startTime)}.`;
      new Notification("Kitchen duty reminder", {
        body,
        tag: assignment.id,
      });
      notifiedAssignmentsRef.current.add(assignment.id);
    };

    const evaluateAlarm = () => {
      const now = Date.now();
      const dueAssignment = mySchedule.find((assignment) => {
        if (!alarmSettings.enabled) return false;
        if (!assignment.alarmEnabled || !assignment.startTime || assignment.status === "done") return false;
        if (getStorageBoolean(`${ALARM_DISMISSED_PREFIX}${assignment.id}`)) return false;

        const snoozeUntil = getStorageNumber(`${ALARM_SNOOZE_PREFIX}${assignment.id}`);
        if (snoozeUntil && snoozeUntil > now) return false;

        const scheduledAt = parseAssignmentDateTime(assignment.assignedDate, assignment.startTime);
        if (!scheduledAt) return false;

        return now >= scheduledAt.getTime() && now <= scheduledAt.getTime() + ALARM_WINDOW_MS;
      });

      if (!dueAssignment) return;
      if (currentAlarm?.id === dueAssignment.id) return;

      stopAlarmRef.current?.();
      stopAlarmRef.current = startAlarmSound();
      maybeNotify(dueAssignment);
      setCurrentAlarm(dueAssignment);
    };

    evaluateAlarm();
    const interval = window.setInterval(evaluateAlarm, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [alarmSettings, currentAlarm?.id, mySchedule, notificationPermission]);

  useEffect(() => {
    return () => {
      stopAlarmRef.current?.();
    };
  }, []);

  if (!kitchenUser) return null;

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission !== "granted" || !kitchenUser || !supportsPushNotifications()) return;

    try {
      await syncBrowserPushSubscription(kitchenUser.id);
      toast.success("Background notifications enabled");
    } catch (error) {
      console.error("Failed to subscribe for push notifications", error);
      toast.error(error instanceof Error ? error.message : "Failed to enable background notifications.");
    }
  };

  const acknowledgeAlarm = () => {
    if (!currentAlarm) return;
    markAlarmDismissed(currentAlarm.id);
    stopAlarmRef.current?.();
    stopAlarmRef.current = null;
    setCurrentAlarm(null);
  };

  const snoozeAlarm = () => {
    if (!currentAlarm) return;
    setAlarmSnooze(currentAlarm.id, Date.now() + alarmSettings.snoozeMinutes * 60 * 1000);
    stopAlarmRef.current?.();
    stopAlarmRef.current = null;
    setCurrentAlarm(null);
  };

  const updateAlarmSettings = <Key extends keyof AlarmSettings>(key: Key, value: AlarmSettings[Key]) => {
    setAlarmSettings((current) => ({ ...current, [key]: value }));
  };

  const testAlarm = () => {
    const testAssignment: ScheduleEntry = {
      id: "test-alarm",
      assignedDate: format(new Date(), "yyyy-MM-dd"),
      startTime: "00:00:00",
      endTime: null,
      status: "pending",
      dutyName: "Alarm test",
      dutyDescription: "This is a sample alarm preview.",
      userName: kitchenUser.username,
      alarmEnabled: true,
    };
    stopAlarmRef.current?.();
    stopAlarmRef.current = startAlarmSound();
    setCurrentAlarm(testAssignment);
  };

  const nextAssignment = mySchedule.find((assignment) => {
    const scheduledAt = parseAssignmentDateTime(assignment.assignedDate, assignment.startTime);
    return scheduledAt ? scheduledAt.getTime() >= Date.now() : false;
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(80,210,165,0.18),transparent_24%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted))/0.75)]">
      <header className="border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold font-display">Kitchen Duty</h1>
                <span className="status-connected">
                  <Wifi className="h-3 w-3" />
                  Live
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Weekly schedule, due-time reminders, and quick completion tracking.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="h-9 gap-2 lg:hidden">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-2 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Signed in as</p>
              <p className="font-mono text-sm font-semibold">{kitchenUser.username}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={notificationPermission === "granted" ? "secondary" : "outline"}
                size="sm"
                onClick={requestNotifications}
                disabled={notificationPermission === "unsupported" || notificationPermission === "granted"}
                className="gap-2"
              >
                <BellRing className="h-4 w-4" />
                {notificationPermission === "granted"
                  ? "Alerts enabled"
                  : notificationPermission === "unsupported"
                    ? "Alerts unsupported"
                    : "Enable alerts"}
              </Button>
              <Button variant="ghost" size="sm" onClick={logout} className="hidden h-9 gap-2 lg:inline-flex">
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-border/70 bg-card/85 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <CalendarClock className="h-4 w-4 text-primary" />
                Next scheduled duty
              </CardTitle>
            </CardHeader>
            <CardContent>
              {nextAssignment ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-2xl font-semibold">{nextAssignment.dutyName}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(parseISO(nextAssignment.assignedDate), "EEEE")} at{" "}
                      {formatTimeRange(nextAssignment.startTime, nextAssignment.endTime)}
                    </p>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {nextAssignment.dutyDescription || "No extra notes for this duty."}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming duty is scheduled yet for your account.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <ShieldAlert className="h-4 w-4 text-secondary" />
                Reminder mode
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Keep this app installed and notifications enabled to get the strongest possible reminder flow on a web app.
              </p>
              <p>
                When a timed duty becomes due while the app is open, a full-screen alarm card appears until you acknowledge or snooze it.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Week of</p>
            <p className="text-lg font-semibold">{format(selectedWeekStart, "MMMM d, yyyy")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedWeekStart((current) => subWeeks(current, 1))}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedWeekStart(getWeekStart(new Date()))}>
              This week
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedWeekStart((current) => addWeeks(current, 1))}>
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>

        <Tabs defaultValue="published-week" className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-2xl bg-transparent p-0">
            <TabsTrigger value="published-week" className="rounded-full border border-border/70 bg-card px-4 py-2">
              Weekly table
            </TabsTrigger>
            <TabsTrigger value="my-week" className="rounded-full border border-border/70 bg-card px-4 py-2">
              My duties
            </TabsTrigger>
            <TabsTrigger value="settings" className="rounded-full border border-border/70 bg-card px-4 py-2">
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="published-week" className="space-y-4">
            <WeeklyScheduleBoard
              assignments={selectedWeekTeamSchedule}
              weekStart={selectedWeekStart}
              emptyLabel="No schedules published"
              title="Published weekly calendar"
            />
          </TabsContent>

          <TabsContent value="my-week" className="space-y-4">
            <WeeklyScheduleBoard
              assignments={selectedWeekMySchedule}
              weekStart={selectedWeekStart}
              emptyLabel="No duty booked"
              title="My weekly calendar"
            />

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display">My assignments</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : selectedWeekMySchedule.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No duties assigned to you yet.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedWeekMySchedule.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-base font-semibold">{assignment.dutyName}</p>
                          <p className="text-sm text-muted-foreground">
                            {assignment.assignedDate} • {formatTimeRange(assignment.startTime, assignment.endTime)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={assignment.status === "done" ? "status-connected" : "status-pending"}>
                            {assignment.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-display">
                  <Settings2 className="h-4 w-4 text-primary" />
                  User alarm settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-card/60 p-4">
                  <div>
                    <p className="text-sm font-semibold">Master alarm</p>
                    <p className="text-sm text-muted-foreground">
                      Keeps the due-time full-screen alert active for your account.
                    </p>
                  </div>
                  <Switch
                    checked={alarmSettings.enabled}
                    onCheckedChange={(checked) => updateAlarmSettings("enabled", checked)}
                  />
                </div>

                <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold">Alarm loudness</p>
                    </div>
                    <span className="text-sm font-mono text-muted-foreground">{alarmSettings.volume}%</span>
                  </div>
                  <Slider
                    value={[alarmSettings.volume]}
                    onValueChange={([value]) => updateAlarmSettings("volume", value)}
                    min={40}
                    max={100}
                    step={5}
                  />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Defaulted to maximum so every user gets a super loud alarm.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-card/60 p-4">
                    <div>
                      <p className="text-sm font-semibold">Vibration</p>
                      <p className="text-sm text-muted-foreground">
                        Uses device vibration during the alarm when the browser allows it.
                      </p>
                    </div>
                    <Switch
                      checked={alarmSettings.vibrate}
                      onCheckedChange={(checked) => updateAlarmSettings("vibrate", checked)}
                    />
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-card/60 p-4">
                    <div>
                      <p className="text-sm font-semibold">Voice prompt</p>
                      <p className="text-sm text-muted-foreground">
                        Repeats a spoken reminder with the alarm for extra urgency.
                      </p>
                    </div>
                    <Switch
                      checked={alarmSettings.voicePrompt}
                      onCheckedChange={(checked) => updateAlarmSettings("voicePrompt", checked)}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold">Snooze length</p>
                    <span className="text-sm font-mono text-muted-foreground">
                      {alarmSettings.snoozeMinutes} min
                    </span>
                  </div>
                  <Slider
                    value={[alarmSettings.snoozeMinutes]}
                    onValueChange={([value]) => updateAlarmSettings("snoozeMinutes", value)}
                    min={1}
                    max={15}
                    step={1}
                  />
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Alarm testing</p>
                    <p className="text-sm text-muted-foreground">
                      Start a full-volume test with your current settings, then stop it manually or acknowledge it from the alarm overlay.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button onClick={testAlarm} className="gap-2">
                      <BellRing className="h-4 w-4" />
                      Start alarm test
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        stopAlarmRef.current?.();
                        stopAlarmRef.current = null;
                        setCurrentAlarm(null);
                      }}
                    >
                      Stop test
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {currentAlarm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg border-destructive/30 shadow-2xl shadow-destructive/10">
            <CardHeader className="space-y-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <BellRing className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl font-display">Duty alarm</CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  Your scheduled duty is due now. Acknowledge it or snooze it for your chosen snooze length.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-xl font-semibold">{currentAlarm.dutyName}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {currentAlarm.assignedDate} • {formatTimeRange(currentAlarm.startTime, currentAlarm.endTime)}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button variant="outline" className="flex-1" onClick={snoozeAlarm}>
                  Snooze {alarmSettings.snoozeMinutes} min
                </Button>
                <Button className="flex-1" onClick={acknowledgeAlarm}>
                  Acknowledge
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
