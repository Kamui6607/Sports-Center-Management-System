import type { Page } from "@playwright/test";
import fs from "node:fs";
const doc = JSON.parse(fs.readFileSync("docs/openapi.json", "utf8"));
export async function setup(page: Page, role = "STAFF", longText = false) {
  await page.addInitScript(() =>
    sessionStorage.setItem("pulse.access", "fixture-token"),
  );
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const coursePlanMatch = path.match(/^\/classes\/([^/]+)\/course-plan$/);
    if (coursePlanMatch && route.request().method() === "GET") {
      const classId = coursePlanMatch[1];
      const starts = [
        "2099-09-15T11:00:00Z",
        "2099-09-17T11:00:00Z",
        "2099-09-22T11:00:00Z",
        "2099-09-24T11:00:00Z",
      ];
      const weekdays = ["Thứ 2", "Thứ 4", "Thứ 2", "Thứ 4"];
      const slots = ["Thứ 2", "Thứ 4"].map((weekdayLabel, index) => ({
        weekday: index === 0 ? 1 : 3,
        weekdayLabel,
        startTime: "18:00",
        endTime: "19:00",
        durationMinutes: 60,
        roomId: "room-1",
        roomName: "Phòng Yoga 1",
        sessionCount: 2,
        firstSessionStart: starts[index],
        lastSessionStart: starts[index + 2],
        sessionIds: [`s${index + 1}`, `s${index + 3}`],
      }));
      return route.fulfill({
        json: {
          success: true,
          data: {
            course: {
              classId,
              className: "Yoga sáng",
              description: "Khóa Yoga thử nghiệm",
              classType: "REGULAR",
              areaType: "INDOOR",
              capacity: 10,
              sports: [{ id: "sport-1", name: "Yoga" }],
              totalSessions: 4,
              firstSessionStart: starts[0],
              lastSessionStart: starts[3],
              lastSessionEnd: "2099-09-24T12:00:00Z",
              weekdays: [1, 3],
              weekdayLabels: ["Thứ 2", "Thứ 4"],
              timeSlots: [
                { startTime: "18:00", endTime: "19:00", durationMinutes: 60 },
              ],
              rooms: [
                { id: "room-1", name: "Phòng Yoga 1", areaType: "INDOOR" },
              ],
              slots,
              availability: {
                minRemainingSlots: 3,
                fullSessionCount: 0,
                isFullyBookable: true,
              },
            },
            sessions: starts.map((startTime, index) => ({
              id: `s${index + 1}`,
              startTime,
              endTime: startTime.replace("11:00:00", "12:00:00"),
              durationMinutes: 60,
              weekday: index % 2 === 0 ? 1 : 3,
              weekdayLabel: weekdays[index],
              timeLabel: "18:00–19:00",
              status: "SCHEDULED",
              room: { id: "room-1", name: "Phòng Yoga 1", areaType: "INDOOR" },
              bookedCount: 7,
              remainingSlots: 3,
              isFull: false,
              isBookable: true,
              canBook: true,
              myEnrollmentId: null,
              myEnrollmentStatus: null,
              conflictWith: null,
            })),
            registration: {
              eligible: true,
              blockers: [],
              subscription: {
                tier: "MEMBERSHIP",
                endDate: "2099-12-31T00:00:00Z",
                planName: "Gói test",
              },
              quota: {
                tier: "MEMBERSHIP",
                limit: 3,
                used: 0,
                remaining: 3,
                alreadyHoldingClass: false,
              },
              penalty: null,
              registeredSessions: 0,
              remainingSessionsToRegister: 4,
              isFullyRegistered: false,
            },
          },
        },
      });
    }
    if (path === "/enrollments/bulk" && route.request().method() === "POST")
      return route.fulfill({
        status: 201,
        json: {
          success: true,
          message: "Whole course enrolled successfully",
          data: {
            classId: "c1",
            className: "Yoga sáng",
            summary: {
              totalSessions: 4,
              enrolledNow: 4,
              alreadyBooked: 0,
              totalRegistered: 4,
              firstSessionStart: "2099-09-15T11:00:00Z",
              lastSessionEnd: "2099-09-24T12:00:00Z",
            },
            quota: {
              tier: "MEMBERSHIP",
              limit: 3,
              used: 1,
              remaining: 2,
              alreadyHoldingClass: true,
            },
            sessions: [
              {
                scheduleId: "s1",
                startTime: "2099-09-15T11:00:00Z",
                endTime: "2099-09-15T12:00:00Z",
                roomId: "room-1",
                roomName: "Phòng Yoga 1",
                enrollmentId: "e1",
                status: "BOOKED",
              },
            ],
          },
        },
      });
    const template = Object.keys(doc.paths).find((p) =>
      new RegExp("^" + p.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(path),
    );
    const operation =
      template && doc.paths[template][route.request().method().toLowerCase()];
    if (!operation)
      return route.fulfill({
        status: 404,
        json: { success: false, message: "Missing fixture " + path },
      });
    const response: any = Object.entries(operation.responses).find(([code]) =>
      code.startsWith("2"),
    )?.[1];
    const resolved = response.$ref
      ? doc.components.responses[response.$ref.split("/").pop()]
      : response;
    const content = resolved.content?.["application/json"];
    // Current Swagger also uses inline responses and omits examples for these
    // collections. Keep explicit empty fixtures instead of dereferencing $ref.
    const emptyLists = [
      "/training-plans",
      "/notifications",
      "/attendance",
      "/chat/contacts",
      "/chat/conversations",
      "/chat/messages",
    ];
    const fallback = path.endsWith("/unread-count")
      ? { success: true, data: { unreadCount: 0 } }
      : emptyLists.includes(path)
        ? { success: true, data: [] }
        : undefined;
    const example = content?.schema?.example || content?.example || fallback;
    if (!example)
      return route.fulfill({
        status: 501,
        json: { success: false, message: "Missing response fixture " + path },
      });
    const payload = structuredClone(example);
    if (path === "/auth/me") payload.data.role = role;
    if (path === "/class-schedules")
      payload.data.forEach((r: any) => {
        r.startTime = "2099-09-15T07:00:00Z";
        r.endTime = "2099-09-15T08:00:00Z";
      });
    if (longText) {
      const expand = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        for (const [key, entry] of Object.entries(value)) {
          if (["name", "fullName"].includes(key) && typeof entry === "string")
            (value as Record<string, unknown>)[key] =
              "Hội viên với thông tin và tên lớp rất dài ".repeat(4);
          else if (key === "email" && typeof entry === "string")
            (value as Record<string, unknown>)[key] =
              "long".repeat(30) + "@example.test";
          else expand(entry);
        }
      };
      expand(payload.data);
    }
    await route.fulfill({ json: payload });
  });
}
