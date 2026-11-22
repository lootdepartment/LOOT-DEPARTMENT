const SESSION_COOKIE = "__Host-loot_staff";
const SESSION_SECONDS = 8 * 60 * 60;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

async function createSession(secret) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    aud: "loot-staff",
  })));
  const signature = base64url(await sign(payload, secret));
  return payload + "." + signature;
}

async function validSession(request, secret) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(SESSION_COOKIE + "="));
  if (!match) return false;
  const token = match.slice(SESSION_COOKIE.length + 1);
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  try {
    const expected = await sign(payload, secret);
    const supplied = fromBase64url(signature);
    if (expected.length !== supplied.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ supplied[i];
    if (diff !== 0) return false;
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    return data.aud === "loot-staff" && Number.isInteger(data.exp) && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function loginPage(message = "") {
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#080b10"><title>Staff access — LOOT DEPARTMENT</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 50% 0%,#241b3d 0%,#080b10 58%);color:#f5f0e7;font-family:Arial,sans-serif}.panel{width:min(430px,100%);padding:38px;border:1px solid rgba(227,153,10,.35);background:rgba(16,21,28,.94);box-shadow:0 24px 80px #0008}.eyebrow{font-size:10px;letter-spacing:.25em;text-transform:uppercase;color:#e3990a;font-weight:bold}.brand{font:500 34px Georgia,serif;margin:16px 0 8px}.sub{font-size:12px;line-height:1.7;color:#aaa39a}.field{display:grid;gap:8px;margin:26px 0 14px}.field label{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#c4b69b}.field input{width:100%;padding:14px;background:#090e15;border:1px solid #ffffff28;color:#fff;font-size:15px;outline:none}.field input:focus{border-color:#e3990a}button{width:100%;padding:14px;border:1px solid #e3990a;background:linear-gradient(135deg,#f0c36a,#c98208);color:#1b1425;font-weight:bold;font-size:10px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer}.error{min-height:18px;color:#e5a29c;font-size:11px;margin:10px 0}.back{display:block;margin-top:24px;text-align:center;color:#a9a39a;text-decoration:none;font-size:10px;letter-spacing:.1em}
</style></head><body><main class="panel"><div class="eyebrow">LOOT DEPARTMENT / Private area</div><h1 class="brand">Staff access.</h1><p class="sub">The department's private editorial command desk. Authorised team members only.</p><form method="post" action="/api/login"><div class="field"><label for="password">Access password</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus></div><div class="error" role="alert">${message}</div><button type="submit">Enter the department</button></form><a class="back" href="/">← Return to the house</a></main></body></html>`, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" },
  });
}

function cookieHeader(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function sameOrigin(request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");

  // Accept a request only when at least one browser-supplied origin signal
  // proves it came from this exact Worker origin. If both are present,
  // reject only when neither matches.
  let originMatches = false;
  let refererMatches = false;

  if (origin && origin !== "null") {
    try { originMatches = new URL(origin).origin === requestOrigin; } catch {}
  }
  if (referer) {
    try { refererMatches = new URL(referer).origin === requestOrigin; } catch {}
  }

  if (origin || referer) return originMatches || refererMatches;
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const isStaffRoute = path === "/staff-login" || path === "/staff-login/" || path === "/x-planner.html" || path.startsWith("/api/");
    if (isStaffRoute && (!env.ADMIN_PASSWORD || !env.SESSION_SECRET)) {
      return new Response("Staff access is not configured yet. Add ADMIN_PASSWORD and SESSION_SECRET in Worker settings.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (path === "/staff-login" || path === "/staff-login/") {
      if (await validSession(request, env.SESSION_SECRET)) return Response.redirect(new URL("/x-planner.html", url), 302);
      return loginPage();
    }

    if (path === "/api/login" && request.method === "POST") {
      if (!sameOrigin(request)) return json({ error: "Invalid origin" }, 403);
      let password = "";
      const contentType = request.headers.get("content-type") || "";
      try {
        if (contentType.includes("application/json")) {
          const body = await request.json();
          password = String(body.password || "");
        } else {
          const body = await request.formData();
          password = String(body.get("password") || "");
        }
      } catch {
        return loginPage("Please enter your password.");
      }
      const supplied = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
      const expected = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.ADMIN_PASSWORD));
      const a = new Uint8Array(supplied), b = new Uint8Array(expected);
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      if (!password || diff !== 0) return loginPage("That password wasn't recognised. Try again.");
      const token = await createSession(env.SESSION_SECRET);
      return new Response(null, { status: 303, headers: { "location": new URL("/x-planner.html", url).toString(), "set-cookie": cookieHeader(token, SESSION_SECONDS), "cache-control": "no-store" } });
    }

    if (path === "/api/logout" && request.method === "POST") {
      if (!sameOrigin(request)) return json({ error: "Invalid origin" }, 403);
      return new Response(null, { status: 303, headers: { "location": new URL("/staff-login", url).toString(), "set-cookie": cookieHeader("", 0), "cache-control": "no-store" } });
    }

    if (path === "/x-planner.html" || path.startsWith("/api/")) {
      if (!(await validSession(request, env.SESSION_SECRET))) {
        if (path.startsWith("/api/")) return json({ error: "Authentication required" }, 401);
        return Response.redirect(new URL("/staff-login", url), 302);
      }
      if (path === "/api/session" && request.method === "GET") return json({ authenticated: true });
      if (path.startsWith("/api/")) return json({ error: "API endpoint not implemented yet" }, 501);
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set("cache-control", "private, no-store");
      headers.set("x-robots-tag", "noindex, nofollow, noarchive");
      headers.set("x-content-type-options", "nosniff");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }

    return env.ASSETS.fetch(request);
  },
};
