import {
  addDays,
  format,
  isSameDay,
  parse,
  parseISO,
  startOfWeek,
} from "date-fns";

export interface ScheduleEntry {
  id: string;
  assignedDate: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  dutyName: string;
  dutyDescription?: string | null;
  userName?: string | null;
  alarmEnabled?: boolean;
}

export interface RotationUser {
  id: string;
}

export interface RotationDuty {
  id: string;
}

export interface WeeklyDutyRotationEntry {
  duty_id: string;
  user_id: string;
  assigned_date: string;
  start_time: string | null;
  end_time: string | null;
  alarm_enabled: boolean;
  status: string;
}

export const WEEKDAY_ROTATION_DAY_COUNT = 5;

export function getWeekStart(date: Date) {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export function getWeekDays(weekStart: Date, numberOfDays = 7) {
  return Array.from({ length: numberOfDays }, (_, index) => addDays(weekStart, index));
}

export function getWorkingWeekDays(weekStart: Date) {
  return getWeekDays(weekStart, WEEKDAY_ROTATION_DAY_COUNT);
}

interface BuildWeeklyDutyRotationOptions {
  weekStart: Date;
  users: RotationUser[];
  duties: RotationDuty[];
  participantCount: number;
  startTime: string | null;
  endTime: string | null;
  alarmEnabled: boolean;
  status: string;
}

export function buildWeeklyDutyRotation({
  weekStart,
  users,
  duties,
  participantCount,
  startTime,
  endTime,
  alarmEnabled,
  status,
}: BuildWeeklyDutyRotationOptions): WeeklyDutyRotationEntry[] {
  const workingDays = getWorkingWeekDays(weekStart);

  if (participantCount < workingDays.length) {
    throw new Error(`Choose at least ${workingDays.length} people for a 5-day no-repeat duty rotation.`);
  }

  const participants = users.slice(0, participantCount);
  if (participants.length < workingDays.length) {
    throw new Error(`Only ${participants.length} people are available for this 5-day rotation.`);
  }

  return workingDays.flatMap((day, dayIndex) =>
    duties.map((duty, dutyIndex) => ({
      duty_id: duty.id,
      user_id: participants[(dayIndex + dutyIndex) % participants.length].id,
      assigned_date: format(day, "yyyy-MM-dd"),
      start_time: startTime,
      end_time: endTime,
      alarm_enabled: alarmEnabled,
      status,
    })),
  );
}

export function parseAssignmentDateTime(assignedDate: string, time: string | null) {
  if (!time) return null;
  return parse(`${assignedDate} ${time}`, "yyyy-MM-dd HH:mm:ss", new Date());
}

export function parseDateInput(value: string) {
  return parseISO(`${value}T12:00:00`);
}

export function isAssignmentInWeek(entry: ScheduleEntry, weekStart: Date) {
  return getWeekDays(weekStart).some((day) => isSameDay(parseISO(entry.assignedDate), day));
}

export function isAssignmentOnDay(entry: ScheduleEntry, day: Date) {
  return isSameDay(parseISO(entry.assignedDate), day);
}

export function formatDayLabel(day: Date) {
  return format(day, "EEE");
}

export function formatDayNumber(day: Date) {
  return format(day, "d");
}

export function formatReadableDate(day: Date) {
  return format(day, "EEE, MMM d");
}

export function formatTimeValue(value: string | null) {
  if (!value) return "Any time";
  return format(parse(value, "HH:mm:ss", new Date()), "h:mm a");
}

export function formatTimeRange(startTime: string | null, endTime: string | null) {
  if (!startTime && !endTime) return "Any time";
  if (!endTime) return formatTimeValue(startTime);
  return `${formatTimeValue(startTime)} - ${formatTimeValue(endTime)}`;
}

export function compareScheduleEntries(left: ScheduleEntry, right: ScheduleEntry) {
  const dutyCompare = left.dutyName.localeCompare(right.dutyName);
  if (dutyCompare !== 0) return dutyCompare;

  const startCompare = (left.startTime ?? "99:99:99").localeCompare(right.startTime ?? "99:99:99");
  if (startCompare !== 0) return startCompare;

  return (left.userName ?? "").localeCompare(right.userName ?? "");
}
