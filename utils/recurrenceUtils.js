// Generates occurrence dates from a recurrence rule + date range
export function generateOccurrences(rule, rangeStart, rangeEnd) {
  // Parse as local date, not UTC, to avoid timezone shift
  const parseLocalDate = (val) => {
    if (val instanceof Date) {
      return new Date(val.getFullYear(), val.getMonth(), val.getDate());
    }
    const [year, month, day] = String(val).split("-").map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  };

  const start = parseLocalDate(rangeStart);
  const end = parseLocalDate(rangeEnd);

  if (isNaN(start) || isNaN(end)) {
    throw new Error("rangeStart and rangeEnd must be valid dates");
  }
  if (start > end) {
    throw new Error("rangeStart must be before or equal to rangeEnd");
  }

  switch (rule.type) {
    case "weekly":
      return generateWeekly(rule, start, end);
    case "monthly_date":
      return generateMonthlyDate(rule, start, end);
    case "monthly_day":
      return generateMonthlyDay(rule, start, end);
    default:
      throw new Error(`Unknown recurrence type: "${rule.type}"`);
  }
}

// Strips hours/minutes/seconds/ms from a Date
function stripTime(d) {
  // Parse date parts directly to avoid UTC→local shift
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Weekly recurrence
function generateWeekly(rule, start, end) {
  if (!Array.isArray(rule.days) || rule.days.length === 0) {
    throw new Error("weekly rule requires a non-empty `days` array");
  }
  const daySet = new Set(rule.days);
  const dates = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    if (daySet.has(cursor.getDay())) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// Monthly recurrence
function generateMonthlyDate(rule, start, end) {
  if (!rule.monthDay || rule.monthDay < 1 || rule.monthDay > 31) {
    throw new Error("monthly_date rule requires `monthDay` between 1 and 31");
  }
  const dates = [];
  let year = start.getFullYear();
  let month = start.getMonth();

  while (true) {
    const candidate = new Date(year, month, rule.monthDay);
    // new Date(year, month, 32) rolls over — detect that
    if (candidate.getMonth() !== month) {
      // This month doesn't have that day — skip
    } else if (candidate >= start && candidate <= end) {
      dates.push(candidate);
    } else if (candidate > end) {
      break;
    }

    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
    // Safety: stop if we've gone more than a year past end
    if (year > end.getFullYear() + 1) break;
  }
  return dates;
}

//
