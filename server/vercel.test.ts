import { describe, expect, it } from "vitest";
import { createVercelFetch, type SharedStore } from "./vercel";

function memoryStore(): SharedStore {
  let saved: { version: string; text: string } | null = null;
  let counter = 0;
  return {
    async read(known) {
      if (!saved) return null;
      return known === saved.version ? "unchanged" : saved;
    },
    async write(text) {
      counter += 1;
      saved = { version: `v${counter}`, text };
      return saved.version;
    },
  };
}

const env = { AUTH_CODE: "424242", HEALIX_TOKEN_SECRET: "test-secret-1234567890" };
const call = (handle: (request: Request) => Promise<Response>, path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
  handle(
    new Request(`https://healix.test/api?__healix_path=${encodeURIComponent(path)}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    }),
  );

describe("Vercel: several server copies", () => {
  it("with a shared store, every copy sees the same accounts, family members and sign-ins", async () => {
    const store = memoryStore();
    const copyA = createVercelFetch(env, store);
    const copyB = createVercelFetch(env, store);

    const asha = (await (await call(copyA, "auth/register", { body: { phone: "9811111111", otp: "424242", name: "Asha Rao" } })).json()) as { access_token: string; user: { id: string } };
    const ravi = (await (await call(copyB, "auth/register", { body: { phone: "9822222222", otp: "424242", name: "Ravi Iyer" } })).json()) as { access_token: string; user: { id: string } };
    expect(asha.user.id).not.toBe(ravi.user.id);

    const me = (await (await call(copyB, "me", { token: asha.access_token })).json()) as { profiles: Array<{ name: string }> };
    expect(me.profiles[0]?.name).toBe("Asha Rao");

    const again = await call(copyB, "auth/login", { body: { phone: "9811111111", otp: "424242" } });
    expect(again.status).toBe(200);

    await call(copyA, "profiles", { token: asha.access_token, body: { name: "Kamla Rao", relation: "mother", age: 70, sex: "female", conditions: [], language: "en", elder_mode: true } });
    const family = (await (await call(copyB, "me", { token: asha.access_token })).json()) as { profiles: Array<{ name: string }> };
    expect(family.profiles.map((profile) => profile.name)).toContain("Kamla Rao");
  });

  it("without a shared store, a copy that does not know you says so, and never shows someone else's account", async () => {
    const copyA = createVercelFetch(env, null);
    const copyB = createVercelFetch(env, null);
    const asha = (await (await call(copyA, "auth/register", { body: { phone: "9811111111", otp: "424242", name: "Asha Rao" } })).json()) as { access_token: string };
    await call(copyB, "auth/register", { body: { phone: "9822222222", otp: "424242", name: "Ravi Iyer" } });
    const me = await call(copyB, "me", { token: asha.access_token });
    expect(me.status).toBe(401);
  });

  it("rejects forged and unsigned tokens", async () => {
    const copy = createVercelFetch(env, memoryStore());
    const asha = (await (await call(copy, "auth/register", { body: { phone: "9811111111", otp: "424242", name: "Asha Rao" } })).json()) as { user: { id: string } };
    expect((await call(copy, "me", { token: `mock.${asha.user.id}` })).status).toBe(401);
    expect((await call(copy, "me", { token: "mock.pat_sunita" })).status).toBe(401);
  });

  it("still serves the demo account with the shown demo code", async () => {
    const copy = createVercelFetch(env, memoryStore());
    const login = await call(copy, "auth/login", { body: { phone: "9876500001", otp: "424242" } });
    expect(login.status).toBe(200);
    const meta = (await (await call(copy, "meta")).json()) as { demo_hint?: { code: string } };
    expect(meta.demo_hint?.code).toBe("424242");
  });
});

describe("Vercel: every main feature works when requests alternate between two server copies", () => {
  it("sign-up, family, triage, doctors, booking, token, reports, chatbot, community, emergency and the hospital dashboard", async () => {
    const store = memoryStore();
    const copies = [createVercelFetch(env, store), createVercelFetch(env, store)];
    let turn = 0;
    const next = () => copies[turn++ % 2] as (request: Request) => Promise<Response>;
    const send = async (path: string, init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}) => {
      const [route = "", query = ""] = path.split("?");
      const response = await next()(
        new Request(`https://healix.test/api?__healix_path=${encodeURIComponent(route)}${query ? `&${query}` : ""}`, {
          method: init.method ?? (init.body ? "POST" : "GET"),
          headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...init.headers },
          body: init.body ? JSON.stringify(init.body) : undefined,
        }),
      );
      const text = await response.text();
      const json: unknown = (() => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return text;
        }
      })();
      return { status: response.status, json: json as Record<string, unknown> & Record<string, never>, text };
    };
    const ok = (label: string, result: { status: number; text: string }) => expect(result.status, `${label}: ${result.text.slice(0, 160)}`).toBeLessThan(400);

    const signup = await send("auth/register", { body: { phone: "9833333333", otp: "424242", name: "Meena Joshi" } });
    ok("register", signup);
    const token = signup.json.access_token as unknown as string;
    const profileId = (signup.json.user as unknown as { profiles: Array<{ id: string }> }).profiles[0]?.id ?? "";
    for (const purpose of ["triage", "reports", "location", "voice"]) ok(`consent ${purpose}`, await send("consent", { token, body: { purpose, granted: true } }));
    ok("add family member", await send("profiles", { token, body: { name: "Ramesh Joshi", relation: "father", age: 72, sex: "male", conditions: [], language: "en", elder_mode: true } }));
    const me = await send("me", { token });
    expect((me.json.profiles as unknown as Array<{ name: string }>).map((profile) => profile.name)).toEqual(expect.arrayContaining(["Meena Joshi", "Ramesh Joshi"]));

    const triage = await send("ai/triage", { token, body: { text: "Do din se pet mein jalan ho rahi hai", age: 40, sex: "female" } });
    ok("triage", triage);
    const headache = await send("ai/triage", { token, body: { text: "I have a headache", age: 40, sex: "female", language: "en" } });
    ok("headache triage", headache);
    const question = (headache.json.follow_up_questions as unknown as Array<{ question: string; options: string[] }>)[0];
    expect(question).toBeDefined();
    const answered = await send("ai/triage/answer", { token, body: { session_id: headache.json.session_id, answers: [{ question: question?.question ?? "", answer: question?.options.at(-1) ?? "" }] } });
    ok("headache follow-up answered on the other copy", answered);
    expect(answered.json.specialty).toBeDefined();
    const match = await send("match", { token, body: { specialty: triage.json.specialty, urgency: "soon", lat: 18.5, lng: 73.8077, language: "en" } });
    ok("match", match);
    const doctorId = (match.json.items as unknown as Array<{ doctor: { id: string } }>)[0]?.doctor.id ?? "";
    expect(doctorId).not.toBe("");
    const slots = await send(`doctors/${doctorId}/slots`, { token });
    ok("slots", slots);
    const free = (slots.json.days as unknown as Array<{ slots: Array<{ start: string; available: boolean }> }>).flatMap((day) => day.slots).find((slot) => slot.available);
    expect(free).toBeDefined();
    const booking = await send("bookings", { token, body: { doctor_id: doctorId, profile_id: profileId, slot_start: free?.start }, headers: { "idempotency-key": "key-cross-copy-1" } });
    ok("booking", booking);
    const issued = await send("tokens", { token, body: { booking_id: booking.json.booking_id } });
    ok("token", issued);
    const mine = await send("tokens/mine", { token });
    ok("my tokens", mine);
    expect((mine.json.tokens as unknown as unknown[]).length).toBeGreaterThan(0);

    const upload = await send("reports", { token, body: { profile_id: profileId, file_name: "report.png", mime_type: "image/png" } });
    ok("report upload", upload);
    const reportId = upload.json.report_id as unknown as string;
    const job = await send("ai/reports/process", { token, body: { report_id: reportId } });
    ok("report process", job);
    let status = "";
    for (let attempt = 0; attempt < 30 && status !== "ready_for_review"; attempt += 1) {
      await new Promise((done) => setTimeout(done, 120));
      const polled = await send(`ai/jobs/${job.json.job_id as unknown as string}`, { token });
      ok("job poll", polled);
      status = polled.json.status as unknown as string;
    }
    expect(status).toBe("ready_for_review");
    const report = await send(`reports/${reportId}`, { token });
    ok("report", report);
    expect(report.json.status).toBe("ready_for_review");
    expect((report.json.observations as unknown as unknown[]).length).toBeGreaterThan(0);
    ok("confirm", await send(`reports/${reportId}/confirm`, { token, body: { observations: [] } }));
    ok("explain", await send(`ai/reports/${reportId}/explain?language=en`, { token }));
    const list = await send(`reports?profile_id=${profileId}`, { token });
    expect((list.json.reports as unknown as Array<{ id: string }>).some((item) => item.id === reportId)).toBe(true);

    const chat = await send("ai/assistant/chat", { token, body: { message: "hi", language: "en" } });
    ok("chat", chat);
    const said = chat.text
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => (JSON.parse(line.slice(6)) as { text?: string }).text ?? "")
      .join("");
    expect(said).toContain("Healix AI");

    const post = await send("community/posts", { token, body: { topic_id: "diabetes", title: "Walking after dinner helps me", body: "A short walk after dinner keeps my sugar steadier." } });
    ok("community post", post);
    const postId = post.json.id as unknown as string;
    ok("read post", await send(`community/posts/${postId}`, { token }));
    ok("reply", await send(`community/posts/${postId}/comments`, { token, body: { body: "Thank you, I will try this." } }));
    ok("vote", await send(`community/posts/${postId}/vote`, { token, body: { value: 1 } }));

    ok("emergency", await send("emergency", { token, body: { lat: 18.5, lng: 73.8077, profile_id: profileId, summary: "chest pain and sweating" } }));
    const staff = await send("auth/login", { body: { phone: "9000000001", otp: "424242" } });
    ok("staff login", staff);
    const staffToken = staff.json.access_token as unknown as string;
    const alerts = await send("dashboard/pre-alerts", { token: staffToken });
    ok("pre-alerts", alerts);
    expect(alerts.text).toContain("chest pain and sweating");
    ok("walk-in", await send("dashboard/doctors/doc_meera/walk-in", { token: staffToken, body: {} }));
    ok("overview", await send("dashboard/overview", { token: staffToken }));
    ok("analytics", await send("dashboard/analytics", { token: staffToken }));

    const again = await send("auth/login", { body: { phone: "9833333333", otp: "424242" } });
    ok("same number signs in again", again);
    expect((again.json.user as unknown as { profiles: Array<{ name: string }> }).profiles.map((profile) => profile.name)).toContain("Ramesh Joshi");
  });
});
