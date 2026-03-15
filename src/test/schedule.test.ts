import { describe, expect, it } from "vitest";
import {
  buildWeeklyDutyRotation,
  compareScheduleEntries,
  getWorkingWeekDays,
  WEEKDAY_ROTATION_DAY_COUNT,
} from "@/lib/schedule";

describe("buildWeeklyDutyRotation", () => {
  it("assigns a different person to the same duty across the 5-day week", () => {
    const weekStart = new Date("2026-03-16T12:00:00");
    const users = ["u1", "u2", "u3", "u4", "u5", "u6"].map((id) => ({ id }));
    const duties = [{ id: "wash-plates" }, { id: "cook-rice" }];

    const assignments = buildWeeklyDutyRotation({
      weekStart,
      users,
      duties,
      participantCount: 5,
      startTime: "09:00:00",
      endTime: "10:00:00",
      alarmEnabled: true,
      status: "pending",
    });

    expect(assignments).toHaveLength(WEEKDAY_ROTATION_DAY_COUNT * duties.length);

    for (const duty of duties) {
      const userIds = assignments.filter((entry) => entry.duty_id === duty.id).map((entry) => entry.user_id);
      expect(new Set(userIds).size).toBe(WEEKDAY_ROTATION_DAY_COUNT);
    }

    expect(assignments.map((entry) => entry.assigned_date)).toEqual([
      "2026-03-16",
      "2026-03-16",
      "2026-03-17",
      "2026-03-17",
      "2026-03-18",
      "2026-03-18",
      "2026-03-19",
      "2026-03-19",
      "2026-03-20",
      "2026-03-20",
    ]);
  });

  it("throws when there are not enough people for a no-repeat weekday rotation", () => {
    expect(() =>
      buildWeeklyDutyRotation({
        weekStart: getWorkingWeekDays(new Date("2026-03-16T12:00:00"))[0],
        users: [{ id: "u1" }, { id: "u2" }, { id: "u3" }, { id: "u4" }],
        duties: [{ id: "wash-plates" }],
        participantCount: 4,
        startTime: "09:00:00",
        endTime: "10:00:00",
        alarmEnabled: true,
        status: "pending",
      }),
    ).toThrow("Choose at least 5 people");
  });

  it("sorts same-day assignments by duty title so each column stays aligned", () => {
    const entries = [
      {
        id: "2",
        assignedDate: "2026-03-16",
        startTime: "09:00:00",
        endTime: "10:00:00",
        status: "pending",
        dutyName: "Tigang",
        userName: "hero",
      },
      {
        id: "1",
        assignedDate: "2026-03-16",
        startTime: "09:00:00",
        endTime: "10:00:00",
        status: "pending",
        dutyName: "Hugas",
        userName: "angel",
      },
    ];

    expect(entries.sort(compareScheduleEntries).map((entry) => entry.dutyName)).toEqual(["Hugas", "Tigang"]);
  });
});
