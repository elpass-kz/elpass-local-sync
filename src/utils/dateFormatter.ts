/**
 * Format date for Hikvision terminals (ISO 8601 format)
 * Example: "2024-01-12T00:00:00"
 */
export function formatDateForHik(date: Date | string): string {
  const d = new Date(date);
  return d.toISOString().slice(0, 19);
}

/**
 * Get today at midnight
 */
export function getTodayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get default start time (today at midnight + 5 hours timezone offset)
 */
export function getDefaultStartTime(): Date {
  const d = getTodayMidnight();
  d.setTime(d.getTime() + 5 * 60 * 60 * 1000);
  return d;
}

/**
 * Get default end time (10 years from start time)
 */
export function getDefaultEndTime(startTime?: Date): Date {
  const start = startTime || getDefaultStartTime();
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 10);
  return end;
}

/**
 * Format date for Dahua terminals
 * Example: "20240112 000000"
 */
export function formatDateForDahua(date: Date | string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const seconds = d.getSeconds().toString().padStart(2, "0");
  return `${year}${month}${day} ${hours}${minutes}${seconds}`;
}

export function formatDate(date: Date | string) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const seconds = d.getSeconds().toString().padStart(2, "0");
  return `${year}${month}${day} ${hours}${minutes}${seconds}`;
}
