const HIBOB_DOMAINS = new Set(
  (process.env.HIBOB_EMAIL_DOMAINS ?? "hibob.io,hibob.com")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
);

const RAW_EMAIL_KEYS = new Set([
  "PRIMARY_GUEST_EMAIL",
  "HOST_EMAIL",
  "BOOKER_EMAIL",
  "GUEST_EMAIL",
]);

function trim(v) {
  return (v ?? "").trim();
}

export function isHibobEmail(email) {
  const e = trim(email).toLowerCase();
  if (!e.includes("@")) return false;
  const domain = e.split("@").pop();
  return HIBOB_DOMAINS.has(domain);
}

/** Keep hibob emails; remove others from API/static payloads. */
export function redactEmail(email) {
  const e = trim(email);
  if (!e) return null;
  return isHibobEmail(e) ? e : null;
}

function redactUser(user) {
  if (!user) return null;
  const email = redactEmail(user.email);
  if (!email && !user.name && !user.id) return null;
  return { ...user, email };
}

function redactMeeting(m) {
  m.email = redactEmail(m.email);
  m.bdr = redactEmail(m.bdr);
  m.ae = redactEmail(m.ae);
  m.assignedUser = redactUser(m.assignedUser);
  m.hostUser = redactUser(m.hostUser);
  m.bookerUser = redactUser(m.bookerUser);

  if (m.raw) {
    for (const key of RAW_EMAIL_KEYS) {
      if (key in m.raw) m.raw[key] = redactEmail(m.raw[key]) ?? "";
    }
    delete m.raw;
  }
}

/** Strip non-hibob emails before sending meetings to the browser. */
export function redactMeetingsPayload(payload) {
  if (!payload?.meetings) return payload;
  for (const m of payload.meetings) {
    redactMeeting(m);
  }
  payload.meta = { ...payload.meta, piiRedacted: true };
  return payload;
}
