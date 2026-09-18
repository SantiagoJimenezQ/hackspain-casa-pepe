import { localeTags, type Locale } from "@/lib/i18n";

export function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(localeTags[locale]).format(value);
}

export function formatDate(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(localeTags[locale], {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(".", "");
}

export function formatTime(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(localeTags[locale], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
