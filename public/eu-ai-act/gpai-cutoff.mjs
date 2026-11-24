export function gpaiPlacementDay(question) {
  const match = /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+August\s+2025|August\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+2025|2025-08-(\d{2}))\b/i.exec(question);
  const day = Number(match?.slice(1).find(Boolean));
  return day >= 1 && day <= 31 ? day : null;
}
