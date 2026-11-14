import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Ghana is GMT all year, so this is 10:00 local: inside the 08:00 to 20:00 hours that
// scheduled SMS keep to. Nothing else sends scheduled SMS.
crons.daily(
  "send due reminders",
  { hourUTC: 10, minuteUTC: 0 },
  internal.system.reminders.sendDue,
  {},
);

export default crons;
