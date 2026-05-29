/**
 * Explain overlap between meetings.csv (calendar) and concierge.csv (website funnel).
 */
export function computeChilipiperLinkage(meetings, funnel, conciergeIndex) {
  const calendarMeetings = meetings.length;
  let calendarWithWebsiteLog = 0;
  let conciergeOnCalendar = 0;
  let chilicalOnCalendar = 0;
  let handoffOnCalendar = 0;

  for (const m of meetings) {
    if (conciergeIndex.has(m.id)) calendarWithWebsiteLog++;
    if (m.meetingType === "concierge") conciergeOnCalendar++;
    else if (m.meetingType === "chilical") chilicalOnCalendar++;
    else if (m.meetingType === "handoff") handoffOnCalendar++;
  }

  return {
    calendarMeetings,
    conciergeOnCalendar,
    chilicalOnCalendar,
    handoffOnCalendar,
    calendarWithWebsiteLog,
    calendarWithoutWebsiteLog: calendarMeetings - calendarWithWebsiteLog,
    websiteSessionsTotal: funnel?.total ?? 0,
    websiteSessionsScheduled: funnel?.scheduled ?? 0,
    websiteSessionsOffered: funnel?.meetingOffered ?? 0,
    /** Website sessions that share MEETING_ID with a calendar row */
    websiteScheduledLinkedToCalendar: calendarWithWebsiteLog,
  };
}
