// ============================================================
// PC 를 켜면 자동 실행 (2.8.0) — 환경설정 → 앱 시작
//  tauri-plugin-autostart: 윈도우는 사용자 레지스트리 Run 항목에 앱 경로를 등록/삭제
//  (설치 위치가 바뀌지 않으므로 업데이트 뒤에도 그대로 동작). 처음에는 꺼져 있음
// ============================================================
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { isTauri } from "./storage";

const toggle = () => document.getElementById("toggle-autostart") as HTMLInputElement | null;

/** 환경설정을 열 때: 지금 등록돼 있는지 체크 상자에 반영 */
export async function refreshAutostart() {
  const el = toggle(); if (!el) return;
  if (!isTauri()) { el.checked = false; el.disabled = true; return; }
  try { el.checked = await isEnabled(); } catch (e) { console.warn("자동 실행 상태 확인 실패:", e); }
}

export async function setAutostart(on: boolean) {
  if (!isTauri()) return;
  try {
    if (on) await enable(); else await disable();
  } catch (e) {
    alert("자동 실행 설정을 바꾸지 못했습니다.\n" + e);
  }
  await refreshAutostart();
}

declare global {
  interface Window { appAutostart: { refresh: typeof refreshAutostart; set: typeof setAutostart; isEnabled: () => Promise<boolean> } }
}
window.appAutostart = { refresh: refreshAutostart, set: setAutostart, isEnabled: () => (isTauri() ? isEnabled() : Promise.resolve(false)) };
