import { config } from '../config/index.js';

/**
 * Returns the start and end of the current day in UTC, computed according to the configured timezone (e.g. Africa/Addis_Ababa)
 */
export function getDailyBounds(date = new Date(), timeZone = config.timezone) {
  // Format the date in the target timezone as YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const dateString = formatter.format(date); // e.g. "2026-11-05"
  const [year, month, day] = dateString.split('-').map(Number);

  // Timezone offset for Addis Ababa is UTC+3 (no DST)
  // 00:00:00 in Africa/Addis_Ababa is previous day 21:00:00 UTC
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  // Adjust for Addis Ababa +3 hours (offset: -3 hours in UTC)
  startOfDay.setUTCHours(startOfDay.getUTCHours() - 3);

  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

  return { startOfDay, endOfDay, dateString };
}

