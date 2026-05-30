/**
 * Summarize meeting mix from the unified Chili Piper export.
 */
export function computeChilipiperLinkage(meetings, funnel) {
  const calendarMeetings = meetings.length;
  let calendarWithRouting = 0;
  let conciergeOnCalendar = 0;
  let chilicalOnCalendar = 0;
  let handoffOnCalendar = 0;

  for (const m of meetings) {
    if (m.routingRuleId) calendarWithRouting++;
    if (m.meetingType === "concierge") conciergeOnCalendar++;
    else if (m.meetingType === "chilical") chilicalOnCalendar++;
    else if (m.meetingType === "handoff") handoffOnCalendar++;
  }

  return {
    calendarMeetings,
    conciergeOnCalendar,
    chilicalOnCalendar,
    handoffOnCalendar,
    calendarWithWebsiteLog: conciergeOnCalendar,
    calendarWithoutWebsiteLog: calendarMeetings - conciergeOnCalendar,
    calendarWithRouting,
    websiteSessionsTotal: funnel?.total ?? 0,
    websiteSessionsScheduled: funnel?.scheduled ?? 0,
    websiteSessionsOffered: funnel?.meetingOffered ?? 0,
    websiteScheduledLinkedToCalendar: funnel?.scheduled ?? 0,
  };
}
