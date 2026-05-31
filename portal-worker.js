var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

const JSON_HEADERS = { "Content-Type": "application/json" };
const CF_TEAM_DOMAIN = "thereelrecipe.cloudflareaccess.com";
const CF_AUD = "524efff41b966b23e68c87cfbfdb998d406b40859f214b085e0a24db9f85eb10";

/* ── JWT verification ── */

function b64url(str) {
  return str.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    str.length + (4 - (str.length % 4)) % 4, "="
  );
}

async function verifyAccessJWT(jwt) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("malformed jwt");

  const [headerB64, payloadB64, sigB64] = parts;
  const header  = JSON.parse(atob(b64url(headerB64)));
  const payload = JSON.parse(atob(b64url(payloadB64)));

  // Expiry
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("jwt expired");
  }

  // Audience — must match this exact Access app
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(CF_AUD)) throw new Error("invalid aud");

  // Fetch Cloudflare's public keys (cached 1h at edge)
  const certsResp = await fetch(
    `https://${CF_TEAM_DOMAIN}/cdn-cgi/access/certs`,
    { cf: { cacheTtl: 3600, cacheEverything: true } }
  );
  if (!certsResp.ok) throw new Error("could not fetch certs");
  const certs = await certsResp.json();

  // Match by kid, fall back to first key
  const jwk = certs.keys?.find(k => k.kid === header.kid) ?? certs.keys?.[0];
  if (!jwk) throw new Error("no matching key");

  // Import public key and verify signature
  const cryptoKey = await crypto.subtle.importKey(
    "jwk", jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["verify"]
  );
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature    = Uint8Array.from(atob(b64url(sigB64)), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", cryptoKey, signature, signingInput
  );
  if (!valid) throw new Error("invalid signature");

  if (!payload.email) throw new Error("no email in token");
  return payload.email;
}

async function getAuthEmail(request, env) {
  const jwt = request.headers.get("CF-Access-Jwt-Assertion");
  // Dev fallback — only used when no JWT is present (local testing)
  if (!jwt) return env.DEV_EMAIL ?? null;
  return verifyAccessJWT(jwt);
}
__name(getAuthEmail, "getAuthEmail");

async function requireAdmin(request, env) {
  const email = await getAuthEmail(request, env);
  if (!email) return null;
  const list = (env.ADMIN_EMAILS ?? "")
    .toLowerCase()
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return list.includes(email.toLowerCase()) ? email : null;
}
__name(requireAdmin, "requireAdmin");

function isSuperAdmin(email, env) {
  if (!email) return false;
  const list = (env.SUPER_ADMIN_EMAILS ?? "")
    .toLowerCase()
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
__name(isSuperAdmin, "isSuperAdmin");

/* ── Router ── */

var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/me" && request.method === "GET") {
      return handleGetMe(request, env);
    }
    if (url.pathname === "/api/deliverables" && request.method === "GET") {
      return handleGetDeliverables(request, env);
    }
    const decisionMatch = url.pathname.match(/^\/api\/deliverables\/([^/]+)\/decision$/);
    if (decisionMatch && request.method === "POST") {
      return handleDecision(request, env, decisionMatch[1]);
    }
    if (url.pathname === "/api/admin/clients" && request.method === "GET") {
      return handleAdminClients(request, env);
    }
    if (url.pathname === "/api/admin/deliverables" && request.method === "GET") {
      return handleAdminDeliverables(request, env);
    }
    if (url.pathname.startsWith("/api/")) {
      return jsonError("Not found", 404);
    }

    // Root and /index.html: route admins to admin.html, everyone else to client.html.
    if (url.pathname === "/" || url.pathname === "/index.html") {
      let isAdmin = false;
      try {
        const email = await getAuthEmail(request, env);
        const admins = (env.ADMIN_EMAILS ?? "")
          .toLowerCase()
          .split(",")
          .map(s => s.trim())
          .filter(Boolean);
        isAdmin = !!email && admins.includes(email.toLowerCase());
      } catch {
        // JWT problems mean we treat the caller as a non-admin client.
      }
      const target = new URL(request.url);
      target.pathname = isAdmin ? "/admin.html" : "/client.html";
      return env.ASSETS.fetch(new Request(target, request));
    }

    return env.ASSETS.fetch(request);
  }
};

/* ── Handlers ── */

async function handleGetMe(request, env) {
  let email;
  try { email = await getAuthEmail(request, env); } catch { return jsonError("Unauthorized", 401); }
  if (!email) return jsonError("Unauthorized", 401);

  try {
    const client = await fetchClientByEmail(email, env);
    if (!client) return jsonError("Client record not found", 404);
    return jsonOk({
      name:         client.fields["Clients "] ?? client.fields.name ?? null,
      email:        client.fields["Client Email"] ?? null,
      status:       client.fields["Client Status"]?.name ?? null,
      company_logo: client.fields["Logo"]?.[0]?.url ?? null
    });
  } catch {
    return jsonError("Internal error", 500);
  }
}
__name(handleGetMe, "handleGetMe");

async function handleGetDeliverables(request, env) {
  let email;
  try { email = await getAuthEmail(request, env); } catch { return jsonError("Unauthorized", 401); }
  if (!email) return jsonError("Unauthorized", 401);

  try {
    const formula = [
      "AND(",
      `FIND(LOWER("${escAirtable(email)}"),LOWER(ARRAYJOIN({Client Email (from Client)},",")))`,
      `,FIND("active",LOWER(ARRAYJOIN({Client Status (from Client)},",")))`,
      `,YEAR({Posting Date})=2026`,
      ")"
    ].join("");

    const fieldParams = [
      "fields[]=Card Name",
      "fields[]=Posting Date",
      "fields[]=Master Stage",
      "fields[]=Month",
      "fields[]=Script",
      "fields[]=Backup Link AM",
      "fields[]=Client Comment",
      "fields[]=Client Feedback Status"
    ].join("&");

    const reelParams = `?filterByFormula=${enc(formula)}&${fieldParams}&sort[0][field]=Posting Date&sort[0][direction]=asc`;

    const [reels, monthsData] = await Promise.all([
      airtableGetAll(env, "Reels", reelParams),
      airtableGet(env, "Months", "?fields[]=Month Name&fields[]=Order&sort[0][field]=Order&sort[0][direction]=asc")
    ]);

    const monthMap = {};
    for (const r of monthsData.records ?? []) {
      monthMap[r.id] = {
        label: r.fields["Month Name"] ?? r.id,
        order: r.fields["Order"] ?? 999
      };
    }

    const grouped = new Map();
    for (const r of reels) {
      const monthIds = r.fields["Month"] ?? [];
      const monthId  = monthIds[0] ?? "unknown";
      const monthInfo = monthMap[monthId] ?? { label: "Other", order: 999 };
      if (!grouped.has(monthId)) {
        grouped.set(monthId, { label: monthInfo.label, order: monthInfo.order, reels: [] });
      }
      grouped.get(monthId).reels.push({
        id:                   r.id,
        title:                r.fields["Card Name"] ?? "",
        date:                 r.fields["Posting Date"] ?? null,
        stage:                r.fields["Master Stage"] ?? "",
        script:               r.fields["Script"] ?? "",
        driveLink:            r.fields["Backup Link AM"] ?? null,
        clientComment:        r.fields["Client Comment"] ?? null,
        clientFeedbackStatus: r.fields["Client Feedback Status"] ?? null
      });
    }

    const months = [...grouped.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, m]) => ({ key: id, label: m.label, reels: m.reels }));

    return jsonOk({ months });
  } catch {
    return jsonError("Internal error", 500);
  }
}
__name(handleGetDeliverables, "handleGetDeliverables");

async function handleDecision(request, env, recordId) {
  let email;
  try { email = await getAuthEmail(request, env); } catch { return jsonError("Unauthorized", 401); }
  if (!email) return jsonError("Unauthorized", 401);

  let body;
  try { body = await request.json(); } catch { return jsonError("Invalid JSON body", 400); }

  const { status, comment } = body;
  if (!["approved", "rejected"].includes(status)) {
    return jsonError('status must be "approved" or "rejected"', 400);
  }

  try {
    const client = await fetchClientByEmail(email, env);
    if (!client) return jsonError("Client record not found", 404);
    const clientEmail = client.fields["Client Email"] ?? null;

    let record;
    try { record = await airtableGet(env, `Reels/${encodeURIComponent(recordId)}`); }
    catch { return jsonError("Record not found", 404); }

    // Ownership check — verified email must match record's client email
    const recordEmails = (record.fields?.["Client Email (from Client)"] ?? [])
      .map(v => String(v).toLowerCase());
    if (!recordEmails.includes((clientEmail ?? "").toLowerCase())) {
      return jsonError("Forbidden", 403);
    }

    await airtablePatch(env, `Reels/${encodeURIComponent(recordId)}`, {
      "Client Feedback Status": status === "approved" ? "Client Approved" : "Client Rejected",
      "Client Comment":         comment ?? ""
    });
    return jsonOk({ success: true });
  } catch {
    return jsonError("Internal error", 500);
  }
}
__name(handleDecision, "handleDecision");

/* ── Admin handlers ── */

async function handleAdminClients(request, env) {
  let admin;
  try { admin = await requireAdmin(request, env); } catch { return jsonError("Unauthorized", 401); }
  if (!admin) return jsonError("Forbidden", 403);

  const superAdmin = isSuperAdmin(admin, env);

  try {
    let allowedClientIds = null; // null = unrestricted (super admin)

    if (!superAdmin) {
      // AM scope: collect distinct Client IDs from reels assigned to this AM.
      const amFormula = `FIND(LOWER("${escAirtable(admin)}"),LOWER(ARRAYJOIN({Email (from AM Email)},",")))`;
      const reels = await airtableGetAll(env, "Reels", `?filterByFormula=${enc(amFormula)}&fields[]=Client`);

      allowedClientIds = new Set();
      for (const r of reels) {
        const linked = r.fields["Client"] ?? [];
        for (const id of linked) allowedClientIds.add(id);
      }
      if (allowedClientIds.size === 0) return jsonOk({ clients: [] });
    }

    const fieldsParam = ["Clients ", "Client Email", "Client Status"]
      .map(f => `fields[]=${enc(f)}`)
      .join("&");
    const data = await airtableGet(env, "Clients", `?${fieldsParam}&sort[0][field]=${enc("Clients ")}`);

    const clients = (data.records ?? [])
      .filter(r => allowedClientIds === null || allowedClientIds.has(r.id))
      .map(r => ({
        id:     r.id,
        name:   r.fields["Clients "] ?? null,
        email:  r.fields["Client Email"] ?? null,
        status: r.fields["Client Status"]?.name ?? null
      }))
      .filter(c => c.email);

    return jsonOk({ clients });
  } catch {
    return jsonError("Internal error", 500);
  }
}
__name(handleAdminClients, "handleAdminClients");

async function handleAdminDeliverables(request, env) {
  let admin;
  try { admin = await requireAdmin(request, env); } catch { return jsonError("Unauthorized", 401); }
  if (!admin) return jsonError("Forbidden", 403);

  const url = new URL(request.url);
  const targetEmail = url.searchParams.get("email");
  const yearParam   = url.searchParams.get("year");
  if (!targetEmail) return jsonError("Missing email parameter", 400);

  let year = null;
  if (yearParam) {
    year = parseInt(yearParam, 10);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return jsonError("Invalid year parameter", 400);
    }
  }

  try {
    const conditions = [
      `FIND(LOWER("${escAirtable(targetEmail)}"),LOWER(ARRAYJOIN({Client Email (from Client)},",")))`
    ];
    if (!isSuperAdmin(admin, env)) {
      conditions.push(`FIND(LOWER("${escAirtable(admin)}"),LOWER(ARRAYJOIN({Email (from AM Email)},",")))`);
    }
    if (year !== null) conditions.push(`YEAR({Posting Date})=${year}`);
    const formula = `AND(${conditions.join(",")})`;

    const fieldParams = [
      "fields[]=Card Name",
      "fields[]=Posting Date",
      "fields[]=Master Stage",
      "fields[]=Month",
      "fields[]=Script",
      "fields[]=Backup Link AM",
      "fields[]=Client Comment",
      "fields[]=Client Feedback Status"
    ].join("&");

    const reelParams = `?filterByFormula=${enc(formula)}&${fieldParams}&sort[0][field]=Posting Date&sort[0][direction]=asc`;

    const [reels, monthsData] = await Promise.all([
      airtableGetAll(env, "Reels", reelParams),
      airtableGet(env, "Months", "?fields[]=Month Name&fields[]=Order&sort[0][field]=Order&sort[0][direction]=asc")
    ]);

    const monthMap = {};
    for (const r of monthsData.records ?? []) {
      monthMap[r.id] = {
        label: r.fields["Month Name"] ?? r.id,
        order: r.fields["Order"] ?? 999
      };
    }

    const grouped = new Map();
    for (const r of reels) {
      const monthIds  = r.fields["Month"] ?? [];
      const monthId   = monthIds[0] ?? "unknown";
      const monthInfo = monthMap[monthId] ?? { label: "Other", order: 999 };
      if (!grouped.has(monthId)) {
        grouped.set(monthId, { label: monthInfo.label, order: monthInfo.order, reels: [] });
      }
      grouped.get(monthId).reels.push({
        id:                   r.id,
        title:                r.fields["Card Name"] ?? "",
        date:                 r.fields["Posting Date"] ?? null,
        stage:                r.fields["Master Stage"] ?? "",
        script:               r.fields["Script"] ?? "",
        driveLink:            r.fields["Backup Link AM"] ?? null,
        clientComment:        r.fields["Client Comment"] ?? null,
        clientFeedbackStatus: r.fields["Client Feedback Status"] ?? null
      });
    }

    const months = [...grouped.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, m]) => ({ key: id, label: m.label, reels: m.reels }));

    return jsonOk({ months });
  } catch {
    return jsonError("Internal error", 500);
  }
}
__name(handleAdminDeliverables, "handleAdminDeliverables");

/* ── Airtable helpers ── */

async function fetchClientByEmail(email, env) {
  const formula = `LOWER({Client Email})=LOWER("${escAirtable(email)}")`;
  const data = await airtableGet(env, "Clients", `?filterByFormula=${enc(formula)}&maxRecords=1`);
  return data.records?.[0] ?? null;
}
__name(fetchClientByEmail, "fetchClientByEmail");

async function airtableGetAll(env, table, params = "") {
  const records = [];
  let offset = "";
  do {
    const sep      = params.includes("?") ? "&" : "?";
    const paginated = offset ? `${params}${sep}offset=${offset}` : params;
    const data     = await airtableGet(env, table, paginated);
    records.push(...data.records ?? []);
    offset = data.offset ?? "";
  } while (offset);
  return records;
}
__name(airtableGetAll, "airtableGetAll");

async function airtableGet(env, path, params = "") {
  const url  = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${path}${params}`;
  const resp = await fetch(url, { headers: airtableHeaders(env) });
  if (!resp.ok) throw new Error(`Airtable GET ${resp.status}: ${path}`);
  return resp.json();
}
__name(airtableGet, "airtableGet");

async function airtablePatch(env, path, fields) {
  const url  = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${path}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: airtableHeaders(env),
    body: JSON.stringify({ fields })
  });
  if (!resp.ok) throw new Error(`Airtable PATCH ${resp.status}: ${path}`);
  return resp.json();
}
__name(airtablePatch, "airtablePatch");

function airtableHeaders(env) {
  return { "Authorization": `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" };
}
__name(airtableHeaders, "airtableHeaders");

/* ── Utilities ── */

function escAirtable(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
__name(escAirtable, "escAirtable");

function enc(str) { return encodeURIComponent(str); }
__name(enc, "enc");

function jsonOk(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS });
}
__name(jsonOk, "jsonOk");

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS });
}
__name(jsonError, "jsonError");

export { src_default as default };
