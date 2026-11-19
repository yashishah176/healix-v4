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
