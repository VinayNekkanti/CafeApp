import { CafeHours } from '../types';

/**
 * Parses a time string in "HH:MM:SS" or "HH:MM" format and returns minutes since midnight.
 */
export function timeStringToMinutes(timeStr?: string | null): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0] ?? '0', 10);
  const minutes = parseInt(parts[1] ?? '0', 10);
  return (isNaN(hours) ? 0 : hours) * 60 + (isNaN(minutes) ? 0 : minutes);
}

/**
 * Converts minutes since midnight into a standard 12-hour AM/PM string (e.g., "7:30 PM", "9 PM").
 */
export function minutesToFormattedTime(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minStr = mins === 0 ? '' : `:${mins.toString().padStart(2, '0')}`;
  return `${hours12}${minStr} ${ampm}`;
}

interface OpenStatus {
  isOpen: boolean;
  statusText: string;
  badgeColor: string;
}

/**
 * Computes open/closed status for a café based on its hours list and current local time.
 */
export function getOpenStatus(hours: CafeHours[], testDate: Date = new Date()): OpenStatus {
  if (!hours || hours.length === 0) {
    return {
      isOpen: false,
      statusText: 'Hours unavailable',
      badgeColor: 'gray',
    };
  }

  // Get current local day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const currentDay = testDate.getDay();
  const currentMinutes = testDate.getHours() * 60 + testDate.getMinutes();

  // Find today's hours with valid opening and closing time strings
  const todaysHours = hours.find(
    (h) => h.day_of_week === currentDay && h.opening_time && h.closing_time
  );

  if (!todaysHours) {
    // Closed all day today. Let's find when it opens next (check tomorrow, etc.)
    return getNextOpeningStatus(hours, currentDay);
  }

  const openMin = timeStringToMinutes(todaysHours.opening_time);
  const closeMin = timeStringToMinutes(todaysHours.closing_time);

  if (currentMinutes >= openMin && currentMinutes < closeMin) {
    // Currently open
    const formattedClose = minutesToFormattedTime(closeMin);
    return {
      isOpen: true,
      statusText: `Open · Closes at ${formattedClose}`,
      badgeColor: 'success',
    };
  } else if (currentMinutes < openMin) {
    // Closed, but will open later today
    const formattedOpen = minutesToFormattedTime(openMin);
    return {
      isOpen: false,
      statusText: `Closed · Opens at ${formattedOpen}`,
      badgeColor: 'danger',
    };
  } else {
    // Closed, already past closing time today. Find next opening day/time.
    return getNextOpeningStatus(hours, currentDay);
  }
}

/**
 * Finds the next day the cafe opens and formats it (e.g. "Closed · Opens Monday at 7 AM").
 */
function getNextOpeningStatus(hours: CafeHours[], currentDay: number): OpenStatus {
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  // Look ahead up to 7 days
  for (let i = 1; i <= 7; i++) {
    const nextDay = (currentDay + i) % 7;
    const nextHours = hours.find((h) => h.day_of_week === nextDay && h.opening_time && h.closing_time);
    
    if (nextHours) {
      const openMin = timeStringToMinutes(nextHours.opening_time);
      const formattedOpen = minutesToFormattedTime(openMin);
      
      let dayPrefix = '';
      if (i === 1) {
        dayPrefix = 'tomorrow';
      } else {
        dayPrefix = daysOfWeek[nextDay] ?? '';
      }
      
      return {
        isOpen: false,
        statusText: `Closed · Opens ${dayPrefix} at ${formattedOpen}`,
        badgeColor: 'danger',
      };
    }
  }

  return {
    isOpen: false,
    statusText: 'Closed',
    badgeColor: 'danger',
  };
}

/**
 * Formats weekly hours list into a clean printable array.
 */
export function formatWeeklyHours(hours: CafeHours[]): { day: string; hoursStr: string }[] {
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  return daysOfWeek.map((dayName, index) => {
    const dayHours = hours.find((h) => h.day_of_week === index && h.opening_time && h.closing_time);
    if (!dayHours) {
      return { day: dayName, hoursStr: 'Closed' };
    }
    const open = minutesToFormattedTime(timeStringToMinutes(dayHours.opening_time));
    const close = minutesToFormattedTime(timeStringToMinutes(dayHours.closing_time));
    return { day: dayName, hoursStr: `${open} - ${close}` };
  });
}
