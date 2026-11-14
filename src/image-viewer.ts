// ============================================================
// 사진 크게 보기 (2.6.0)
//  - 판서·알림의 사진이나 보관 기록 보기의 사진을 두 번 누르면(또는 사진 도구의 '크게 보기') 화면 가득 보여 줌
//  - 아무 곳이나 누르거나 ESC 를 누르면 닫힘
// ============================================================
import "./image-viewer.css";

let overlay: HTMLElement | null = null;

function close() {
  if (!overlay) return;
  const el = overlay;
  overlay = null;
  el.dispatchEvent(new Event("remove-fit"));
  el.classList.add("closing");
  window.setTimeout(() => el.remove(), 150);
  document.removeEventListener("keydown", onKey, true);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
}

export function openImageViewer(src: string) {
  if (!src) return;
  close();
  const el = document.createElement("div");
  el.id = "sb-image-viewer";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "사진 크게 보기");
  const img = document.createElement("img");
  img.src = src;
  img.alt = "크게 본 사진";
  img.draggable = false;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sb-iv-close";
  btn.title = "닫기 (ESC)";
  btn.textContent = "✕";
  const hint = document.createElement("div");
  hint.className = "sb-iv-hint";
  hint.textContent = "아무 곳이나 누르면 닫힙니다";
  el.append(img, btn, hint);
  el.addEventListener("click", close);
  document.body.appendChild(el);
  document.addEventListener("keydown", onKey, true);
  overlay = el;
  // 작은 사진도 화면에 꽉 차게 키움 (가로 96%, 세로 90% 안에서 비율 유지)
  const fit = () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h || overlay !== el) return;
    const s = Math.min((window.innerWidth * 0.96) / w, (window.innerHeight * 0.9) / h);
    img.style.width = Math.round(w * s) + "px";
    img.style.height = Math.round(h * s) + "px";
  };
  if (img.complete) fit(); else img.addEventListener("load", fit, { once: true });
  window.addEventListener("resize", fit);
  el.addEventListener("remove-fit", () => window.removeEventListener("resize", fit));
}

/** 판서·알림 편집기와 보관 기록 보기의 사진을 두 번 누르면 크게 보기 */
document.addEventListener("dblclick", (e) => {
  const img = (e.target as HTMLElement | null)?.closest?.("#notepad-editor img, #viewer-content img") as HTMLImageElement | null;
  if (!img?.src) return;
  e.preventDefault();
  openImageViewer(img.currentSrc || img.src);
});

declare global {
  interface Window { openImageViewer: typeof openImageViewer }
}
window.openImageViewer = openImageViewer;
