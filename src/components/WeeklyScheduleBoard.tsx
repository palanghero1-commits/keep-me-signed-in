import { format, isToday } from "date-fns";
import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  compareScheduleEntries,
  type ScheduleEntry,
  formatDayLabel,
  formatDayNumber,
  formatTimeRange,
  getWeekDays,
  isAssignmentOnDay,
} from "@/lib/schedule";

interface WeeklyScheduleBoardProps {
  assignments: ScheduleEntry[];
  weekStart: Date;
  emptyLabel: string;
  title: string;
}

export function WeeklyScheduleBoard({
  assignments,
  weekStart,
  emptyLabel,
  title,
}: WeeklyScheduleBoardProps) {
  const weekDays = getWeekDays(weekStart);

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base font-display">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {format(weekStart, "MMM d")} - {format(weekDays[6], "MMM d")}
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground sm:inline-flex">
          <CalendarClock className="h-3.5 w-3.5" />
          Weekly view
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {weekDays.map((day) => {
            const dayAssignments = assignments
              .filter((entry) => isAssignmentOnDay(entry, day))
              .sort(compareScheduleEntries);

            return (
              <section
                key={day.toISOString()}
                className={cn(
                  "flex min-h-[13rem] flex-col rounded-2xl border border-border/70 bg-background/80 p-3",
                  isToday(day) && "border-primary/50 bg-accent/40",
                )}
              >
                <header className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                      {formatDayLabel(day)}
                    </p>
                    <p className="text-2xl font-semibold">{formatDayNumber(day)}</p>
                  </div>
                  {isToday(day) ? (
                    <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                      Today
                    </span>
                  ) : null}
                </header>
                <div className="space-y-2">
                  {dayAssignments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/80 px-3 py-5 text-center text-sm text-muted-foreground">
                      {emptyLabel}
                    </div>
                  ) : (
                    dayAssignments.map((assignment) => (
                      <article
                        key={assignment.id}
                        className="rounded-xl border border-border/80 bg-card px-3 py-2 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{assignment.dutyName}</p>
                            {assignment.userName ? (
                              <p className="text-xs text-muted-foreground">{assignment.userName}</p>
                            ) : null}
                          </div>
                          <span className={assignment.status === "done" ? "status-connected" : "status-pending"}>
                            {assignment.status}
                          </span>
                        </div>
                        <p className="mt-2 text-xs font-mono text-muted-foreground">
                          {formatTimeRange(assignment.startTime, assignment.endTime)}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
