"use client";

import { useI18n } from "@/components/i18n/locale-provider";
import { messageKey } from "@/lib/i18n";

export function useMessage() {
  const { t } = useI18n();
  return (
    key: string | undefined,
    vars?: Record<string, string | number>,
  ) => {
    if (!key) return "";
    const resolved = messageKey(key);
    return resolved ? t(resolved, vars) : key;
  };
}

