// ============================================================
// 3.2.0 글자 크기 — 전자칠판에서 멀리서도 보이게 앱 전체 글자를 키움
//   보통(1) · 크게(1.15, 기본) · 아주 크게(1.3)
//   배율은 <html> 의 CSS 변수 --sb-fs 로 들어가고,
//   tailwind.config.js 의 글자 크기(text-sm 등)와 aurora.css·panels.css 의 글자 크기가 이 값을 곱해 씀.
//   판서·알림장 본문 글자(도구줄에서 고르는 px 크기)와 큰 숫자(시계·타이머)는 따로 정해서 이 배율과 무관.
//   저장 키: sb.fontScale ("normal" | "large" | "xlarge")
// ============================================================
import { storage } from "./storage";

export type FontScale = "normal" | "large" | "xlarge";
const KEY = "sb.fontScale";
const VALUES: Record<FontScale, number> = { normal: 1, large: 1.15, xlarge: 1.3 };
const DEFAULT: FontScale = "large";

export function getFontScale(): FontScale {
  const v = storage.getItem(KEY) as FontScale | null;
  return v && v in VALUES ? v : DEFAULT;
}

function renderControls(s: FontScale) {
  document.querySelectorAll<HTMLElement>("[data-fs-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fsSet === s)));
}

export function applyFontScale() {
  const s = getFontScale();
  const root = document.documentElement;
  root.dataset.fs = s;
  root.style.setProperty("--sb-fs", String(VALUES[s]));
  renderControls(s);
}

export function setFontScale(s: FontScale) {
  if (!(s in VALUES)) return;
  storage.setItem(KEY, s);
  applyFontScale();
  // Dock 너비 맞춤·떠 있는 창 위치 등이 다시 계산되게
  window.dispatchEvent(new Event("resize"));
}

export function initFontScale() {
  applyFontScale();
  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-fs-set]");
    if (b) setFontScale(b.dataset.fsSet as FontScale);
  });
}

declare global { interface Window { fontScale: { get: typeof getFontScale; set: typeof setFontScale } } }
window.fontScale = { get: getFontScale, set: setFontScale };
