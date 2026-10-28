// Local stand-in for Meta's Instagram endpoints (e2e tests only).
// Records every call so tests can assert what the app sent.
import http from "node:http";

const PORT = Number(process.env.MOCK_META_PORT ?? 3299);
const IG_USER_ID = "17841400000000001";
const LONG = "LONG_TOKEN_e2e";
let calls = [];

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const p = url.pathname;
      const authz = req.headers.authorization ?? "";
      if (p === "/__calls") {
        if (req.method === "DELETE") calls = [];
        return json(res, 200, calls);
      }
      calls.push({ method: req.method, path: p, query: Object.fromEntries(url.searchParams), body: raw, auth: authz ? "bearer" : "" });

      if (p === "/oauth/authorize") {
        // The user approves: back to the app with a code and the same state.
        const back = new URL(url.searchParams.get("redirect_uri"));
        if (url.searchParams.get("state")) back.searchParams.set("state", url.searchParams.get("state"));
        back.searchParams.set("code", "mock-code");
        res.writeHead(302, { location: back.toString() });
        return res.end();
      }
      if (p === "/oauth/access_token" && req.method === "POST") {
        const f = new URLSearchParams(raw);
        if (f.get("code") !== "mock-code" || !f.get("client_secret")) return json(res, 400, { error: { code: 100 } });
        return json(res, 200, { access_token: "SHORT_TOKEN", user_id: 1234, permissions: ["instagram_business_basic"] });
      }
      if (p === "/access_token") return json(res, 200, { access_token: LONG, token_type: "bearer", expires_in: 5183944 });
      if (p === "/refresh_access_token") return json(res, 200, { access_token: LONG, token_type: "bearer", expires_in: 5183944 });
      if (authz !== `Bearer ${LONG}`) return json(res, 401, { error: { code: 190 } });

      const v = p.replace(/^\/v[0-9.]+/, "");
      if (v === "/me") return json(res, 200, { user_id: IG_USER_ID, username: "mock.shop" });
      if (v === `/${IG_USER_ID}/subscribed_apps`) return json(res, 200, { success: true });
      if (v === "/me/media")
        return json(res, 200, {
          data: [
            { id: "18000000000000001", caption: "عطر الياسمين الجديد", media_type: "VIDEO", timestamp: "2026-10-20T10:00:00+0000", comments_count: 12 },
            { id: "18000000000000002", caption: "عرض نهاية الأسبوع", media_type: "IMAGE", timestamp: "2026-10-18T10:00:00+0000", comments_count: 4 },
          ],
        });
      if (/^\/[^/]+\/replies$/.test(v) && req.method === "POST") return json(res, 200, { id: "reply-1" });
      if (v === `/${IG_USER_ID}/messages` && req.method === "POST") {
        const b = JSON.parse(raw || "{}");
        if (String(b?.recipient?.comment_id ?? "").includes("dmfail")) return json(res, 400, { error: { code: 10, error_subcode: 2534022 } });
        return json(res, 200, { recipient_id: "igsid", message_id: "mid" });
      }
      return json(res, 404, { error: { code: 803 } });
    });
  })
  .listen(PORT, "127.0.0.1");
