const RAW_EMAIL_KEYS = new Set([
  "PRIMARY_GUEST_EMAIL",
  "HOST_EMAIL",
  "BOOKER_EMAIL",
  "GUEST_EMAIL",
]);

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function trim(v) {
  return (v ?? "").trim();
}

const HIBOB_DOMAINS = new Set(
  (process.env.HIBOB_EMAIL_DOMAINS ?? "hibob.io,hibob.com")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
);

export function isHibobEmail(email) {
  const e = trim(email).toLowerCase();
  if (!e.includes("@")) return false;
  return HIBOB_DOMAINS.has(e.split("@").pop());
}

export function looksLikeEmail(value) {
  const s = trim(value);
  return s.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Remove email addresses embedded in free text (e.g. meeting titles). */
export function stripEmailsFromText(value) {
  if (value == null || value === "") return value;
  const cleaned = String(value).replace(EMAIL_RE, "").replace(/\s*\+\s*$/, "").trim();
  return cleaned || null;
}

function redactTextField(value) {
  if (value == null || value === "") return value;
  if (looksLikeEmail(value)) return null;
  return stripEmailsFromText(value);
}

/** Remove all emails from data sent to the browser. */
export function redactEmail(_email) {
  return null;
}

function redactPersonName(name) {
  if (!name) return null;
  if (looksLikeEmail(name)) return null;
  return stripEmailsFromText(name);
}

function redactUser(user) {
  if (!user) return null;
  const { email: _e, ...rest } = user;
  rest.name = redactPersonName(rest.name);
  if (!rest.name && !rest.id) return null;
  return { ...rest, email: null };
}

function redactMeeting(m) {
  m.email = null;
  m.bdr = null;
  m.ae = null;
  m.title = redactTextField(m.title);
  m.company = redactTextField(m.company);
  m.assignedUser = redactUser(m.assignedUser);
  m.hostUser = redactUser(m.hostUser);
  m.bookerUser = redactUser(m.bookerUser);
  delete m.raw;
}

function redactRepRow(r) {
  if (!r) return;
  r.email = null;
  r.name = redactPersonName(r.name);
}

/** Strip emails before sending meetings to the browser. */
export function redactMeetingsPayload(payload) {
  if (!payload?.meetings) return payload;
  for (const m of payload.meetings) {
    redactMeeting(m);
  }
  if (payload.filterOptions?.reps) {
    for (const r of payload.filterOptions.reps) {
      redactRepRow(r);
    }
  }
  if (payload.handoffDistribution?.reps) {
    for (const r of payload.handoffDistribution.reps) {
      redactRepRow(r);
    }
  }
  payload.meta = { ...payload.meta, piiRedacted: true, emailsRemoved: true };
  return payload;
}
