export const BASE = "http://localhost:3000";
export function agent() {
  let cookie = "";
  const call = async (path, { method, body } = {}) => {
    const r = await fetch(BASE + path, { method: method ?? (body ? "POST" : "GET"), headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.get("set-cookie"); if (set) cookie = set.split(";")[0];
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  };
  const must = async (p, o) => { const r = await call(p, o); if (!r.ok) throw new Error(`${p} -> ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
  must.raw = call; return must;
}
