import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = window.VOTE_APP_CONFIG ?? {};

export const hasSupabaseConfig =
  Boolean(config.supabaseUrl) &&
  Boolean(config.supabaseAnonKey) &&
  !config.supabaseUrl.includes("YOUR_PROJECT") &&
  !config.supabaseAnonKey.includes("YOUR_SUPABASE_ANON_KEY");

export const supabase = hasSupabaseConfig
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

export function ensureSupabase() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error("Supabase 설정이 아직 완료되지 않았습니다.");
  }

  return supabase;
}

export function formatDateTime(dateValue) {
  if (!dateValue) {
    return "-";
  }

  const date = new Date(dateValue);

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDateTimeInput(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return offsetDate.toISOString().slice(0, 16);
}

export function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}
