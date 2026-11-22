// ============================================================
// 3.0.0 하루이음 Aurora 화면 동작 (뼈대는 index.html, 모양은 src/aurora.css)
//  - 지금 수업 상태: 상단 바 가운데 알약 + 왼쪽 '지금' 카드 (몇 교시 · 몇 분 남음 · 진행 막대)
//  - 판서/알림장 전환 버튼 (기능 코드의 toggleBoardMode 를 그대로 씀)
//  - 빠른 설정: 음량 · 수업 종 · 항상 위 · 전체 화면 · PC 켜면 실행 · 디자인 테마
//  - 활동 개요: 열린 화면(판서·알림장·지난 기록) + 모든 도구 + 검색
//  - 집중 모드: 판서만 크게 (사이드바·위젯·Dock 숨김, '도구 모음' 버튼으로 잠깐 꺼내기)
//  - Dock: 열려 있는 도구 아래에 점 표시
//  - 오른쪽 위젯: 오늘 급식, 다가오는 학사일정
// 기능 코드(legacy-app.js)의 함수는 window 에 있으므로 이름으로 부름
// ============================================================
import { storage } from "./storage";
import { SKINS, currentSkin } from "./skins";
import type { WidgetMeal } from "./lunch";

const W = window as any;
const $ = (id: string) => document.getElementById(id);
const call = (name: string, ...args: unknown[]) => { const f = W[name]; if (typeof f === "function") return f(...args); console.warn(`${name} 함수가 없습니다`); };
const icons = () => W.lucide?.createIcons();
const esc = (v: string) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const anyModalOpen = () => !!document.querySelector(".modal.active");

// ---------------------------------------------------------------- 지금 수업 상태
interface Slot { name: string; subject: string; start: number; end: number; startStr: string; endStr: string }
const toMin = (s?: string) => { const [h, m] = String(s || "").split(":").map(Number); return h * 60 + m; };

function readSlots(): Slot[] {
  return Array.from(document.querySelectorAll<HTMLElement>("#timetable-container .timetable-slot"))
    .map((el) => ({
      name: el.querySelector(".slot-name")?.textContent?.trim() || "",
      subject: (el.querySelector<HTMLInputElement>(".slot-subject")?.value || "").trim(),
      start: toMin(el.dataset.start), end: toMin(el.dataset.end),
      startStr: el.dataset.start || "", endStr: el.dataset.end || "",
    }))
    .filter((s) => !isNaN(s.start) && !isNaN(s.end));
}

interface Status { badge: string; title: string; sub: string; progress: number; live: boolean }
const label = (s: Slot) => (s.name === "점심" ? "점심시간" : `${s.name}${s.subject ? " " + s.subject : ""}`);

export function computeStatus(now = new Date()): Status {
  const dow = now.getDay();
  if (dow === 0 || dow === 6) return { badge: "주말", title: "주말이에요", sub: "푹 쉬고 월요일에 만나요", progress: 0, live: false };
  const holiday = W.schoolCalendar?.holidayOn?.(now) as string | null | undefined;
  const all = readSlots();
  if (holiday && !all.length) return { badge: "쉬는 날", title: "오늘은 쉬는 날", sub: holiday, progress: 0, live: false };
  // 과목이 비어 있는 칸은 수업이 아님 (점심은 과목이 없어도 점심시간)
  const slots = all.filter((s) => s.subject || s.name === "점심");
  if (!slots.length) return { badge: "오늘", title: "오늘 수업이 없어요", sub: "시간표에서 과목을 적어 주세요", progress: 0, live: false };
  const t = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const minute = Math.floor(t);
  // 기능 코드(updateTimetableHighlight)와 같게: 끝나는 분(예: 10:30)까지는 그 교시
  const cur = slots.find((s) => minute >= s.start && minute <= s.end);
  if (cur) {
    const left = Math.ceil(cur.end - t);
    const span = Math.max(1, cur.end - cur.start);
    return {
      badge: cur.name === "점심" ? "점심" : "수업 중",
      title: label(cur),
      sub: left > 0 ? `${cur.endStr}까지 ${left}분` : "곧 끝나요",
      progress: Math.min(1, Math.max(0, (t - cur.start) / span)),
      live: true,
    };
  }
  const next = slots.find((s) => s.start > t);
  const prev = [...slots].reverse().find((s) => s.end < t);
  if (next && prev) {
    const left = Math.ceil(next.start - t);
    const span = Math.max(1, next.start - prev.end);
    return { badge: "쉬는 시간", title: "쉬는 시간", sub: `${label(next)} · ${left}분 뒤`, progress: Math.min(1, Math.max(0, (t - prev.end) / span)), live: true };
  }
  if (next) {
    const left = Math.ceil(next.start - t);
    return { badge: "수업 전", title: "수업 전", sub: left <= 60 ? `${label(next)} · ${left}분 뒤` : `${label(next)} · ${next.startStr} 시작`, progress: 0, live: false };
  }
  return { badge: "방과 후", title: "오늘 수업 끝", sub: "오늘도 수고하셨어요", progress: 1, live: false };
}

let lastStatusKey = "";
function renderStatus() {
  const st = computeStatus();
  const key = JSON.stringify(st);
  if (key === lastStatusKey) return;
  lastStatusKey = key;
  const set = (id: string, v: string) => { const e = $(id); if (e && e.textContent !== v) e.textContent = v; };
  set("sb-live-title", st.title);
  set("sb-live-sub", st.sub);
  set("sb-now-title", st.title);
  set("sb-now-remain", st.sub);
  const badge = $("sb-now-badge");
  if (badge) { badge.textContent = st.badge; badge.hidden = false; badge.dataset.live = String(st.live); }
  const arc = $("sb-live-arc");
  if (arc) arc.setAttribute("stroke-dasharray", `${(56.55 * st.progress).toFixed(2)} 56.55`);
  const bar = $("sb-now-progress");
  if (bar) bar.style.width = (st.progress * 100).toFixed(1) + "%";
  $("sb-live")?.classList.toggle("is-live", st.live);
  document.body.dataset.classState = st.live ? "live" : "idle";
}

// ---------------------------------------------------------------- 판서 / 알림장
function syncBoardMode() {
  const mode = typeof W.getBoardMode === "function" ? W.getBoardMode() : "board";
  $("seg-board")?.setAttribute("aria-pressed", String(mode === "board"));
  $("seg-notice")?.setAttribute("aria-pressed", String(mode === "notice"));
  const b = $("sb-board");
  if (b) { b.dataset.mode = mode; b.setAttribute("aria-label", mode === "notice" ? "알림장" : "판서"); }
}
export function setBoardMode(mode: "board" | "notice") {
  const ok = call("setBoardMode", mode);
  // 전환 효과 중이면 끝난 뒤 한 번 더
  if (ok === false) window.setTimeout(() => setBoardMode(mode), 260);
  window.setTimeout(syncBoardMode, 200);
}

// ---------------------------------------------------------------- 빠른 설정
function setTile(id: string, on: boolean, stateId: string) {
  $(id)?.setAttribute("aria-pressed", String(on));
  const s = $(stateId); if (s) s.textContent = on ? "켜짐" : "꺼짐";
}
function syncBell() {
  const on = typeof W.isBellEnabled === "function" ? !!W.isBellEnabled() : true;
  setTile("qs-bell", on, "qs-bell-state");
  document.body.classList.toggle("sb-bell-off", !on);
}
function syncFullscreen() { setTile("qs-fullscreen", !!document.fullscreenElement, "qs-full-state"); }
async function syncAutostart() {
  try { setTile("qs-autostart", !!(await W.appAutostart?.isEnabled?.()), "qs-auto-state"); } catch { /* 브라우저 */ }
}
function renderSkinSwatches() {
  const box = $("qs-skins"); if (!box) return;
  const cur = currentSkin();
  box.innerHTML = SKINS.map((k) => `<button type="button" class="sb-swatch" data-skin-id="${k.id}" aria-pressed="${k.id === cur}" title="${esc(k.name)} — ${esc(k.desc)}" aria-label="${esc(k.name)}${k.id === cur ? " (사용 중)" : ""}"><span style="background:${k.preview.page};box-shadow:inset -0.55rem -0.55rem 0 ${k.preview.accent}"></span></button>`).join("");
}

export function toggleQuick(force?: boolean) {
  const box = $("sb-quick"); if (!box) return;
  const open = force ?? Boolean(box.hidden);
  if (open) { toggleOverview(false); syncBell(); syncFullscreen(); void syncAutostart(); renderSkinSwatches(); }
  box.hidden = !open;
  $("btn-quick-settings")?.setAttribute("aria-expanded", String(open));
}
export function toggleBell() { call("setBellEnabled", !(W.isBellEnabled?.() ?? true)); syncBell(); }
export async function toggleAutostart() {
  if (!W.appAutostart) return;
  const on = !!(await W.appAutostart.isEnabled().catch(() => false));
  await W.appAutostart.set(!on);
  await syncAutostart();
}

// ---------------------------------------------------------------- 활동 개요
interface Tool { key: string; label: string; icon: string; tone: string; words: string; run: () => void }
const openSettingsAt = (id: string) => { call("openSettingsModal"); window.setTimeout(() => $(id)?.scrollIntoView({ block: "start", behavior: "smooth" }), 120); };
const TOOLS: Tool[] = [
  { key: "picker", label: "뽑기", icon: "dices", tone: "plum", words: "뽑기 랜덤 학생 번호 이름 발표 순서 추첨", run: () => call("pickRandomNumber") },
  { key: "timer", label: "타이머", icon: "timer", tone: "orange", words: "타이머 시간 초시계 스톱워치 미리 알림", run: () => call("toggleTimerPopup") },
  { key: "noise", label: "소음 측정", icon: "audio-lines", tone: "teal", words: "소음 측정 조용 소리 마이크 시끄러움", run: () => call("toggleNoiseMeter") },
  { key: "attention", label: "주목!", icon: "megaphone", tone: "amber", words: "주목 집중 박수 신호 종", run: () => call("playAttentionBell") },
  { key: "youtube", label: "유튜브", icon: "youtube", tone: "red", words: "유튜브 영상 동영상 노래 youtube", run: () => call("openYouTube") },
  { key: "tinkerbell", label: "팅커벨", icon: "sparkles", tone: "violet", words: "팅커벨 사이트 학습 퀴즈", run: () => call("openExternalSite", "tinkerbell") },
  { key: "iscream", label: "아이스크림", icon: "ice-cream-cone", tone: "pink", words: "아이스크림 사이트 학습 수업자료", run: () => call("openExternalSite", "iscream") },
  { key: "lunch", label: "급식", icon: "utensils", tone: "green", words: "급식 점심 식단 메뉴 알레르기 칼로리 학교", run: () => call("openLunchModal") },
  { key: "popupnote", label: "팝업 노트", icon: "sticky-note", tone: "gold", words: "팝업 노트 메모 쪽지", run: () => call("togglePopupNote") },
  { key: "qr", label: "QR 코드", icon: "qr-code", tone: "slate", words: "qr 큐알 코드 링크 주소", run: () => W.qr?.open?.() },
  { key: "weather", label: "날씨", icon: "sun", tone: "sky", words: "날씨 미세먼지 기온 비 눈 지역", run: () => call("openWeather") },
  { key: "calendar", label: "학사일정", icon: "calendar-days", tone: "rose", words: "학사일정 달력 휴일 방학 행사 쉬는 날", run: () => call("openCalendar") },
  { key: "saved", label: "지난 기록", icon: "folder-open", tone: "aubergine", words: "지난 기록 보관 판서 알림장 불러오기 목록", run: () => call("openSavedBoards") },
  { key: "save", label: "지금 보관", icon: "archive", tone: "aubergine", words: "보관 저장 기록 남기기", run: () => call("saveBoard") },
  { key: "focus", label: "집중 모드", icon: "maximize-2", tone: "ink", words: "집중 모드 크게 전체 판서만", run: () => toggleFocus(true) },
  { key: "bells", label: "교시 알람", icon: "bell-ring", tone: "orange", words: "교시 알람 종소리 수업 종 쉬는 시간 멜로디", run: () => call("openAlarmSettingsModal") },
  { key: "time", label: "시간·지정 알람", icon: "alarm-clock", tone: "orange", words: "시간 지정 알람 시계 24시간 퇴근", run: () => call("openTimeSettingsModal") },
  { key: "tools", label: "도구 설정", icon: "settings-2", tone: "graphite", words: "도구 설정 dock 숨기기 학생 명렬표 뽑기 번호 위치", run: () => call("openToolSettings") },
  { key: "backup", label: "데이터 백업", icon: "database", tone: "graphite", words: "데이터 백업 복원 저장 옮기기 새 pc", run: () => openSettingsAt("settings-backup") },
  { key: "theme", label: "디자인 테마", icon: "palette", tone: "orange", words: "디자인 테마 스킨 색 배경 오로라 다크 칠판", run: () => openSettingsAt("skin-cards") },
  { key: "settings", label: "환경 설정", icon: "settings", tone: "graphite", words: "환경 설정 시간표 과목 학교 업데이트", run: () => call("openSettingsModal") },
  { key: "about", label: "버전 정보", icon: "info", tone: "slate", words: "버전 정보 업데이트 만든 사람", run: () => call("showVersionInfo") },
];
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

function htmlLines(html: string, max = 4): string[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = Array.from(doc.body.querySelectorAll("p, li, h1, h2, h3, td"));
  const lines = (blocks.length ? blocks.map((b) => b.textContent || "") : [doc.body.textContent || ""])
    .map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  return lines.slice(0, max);
}

function renderWindows() {
  const box = $("sb-ov-windows"); if (!box) return;
  const mode = W.getBoardMode?.() || "board";
  const curHtml = W.boardEditor?.getHTML?.() || "";
  const boardHtml = mode === "board" ? curHtml : storage.getItem("smartBoardCurrentNotepad") || "";
  const noticeHtml = mode === "notice" ? curHtml : storage.getItem("smartBoardCurrentNotice") || "";
  let saved: Array<{ title?: string; date?: string }> = [];
  try { saved = JSON.parse(storage.getItem("smartBoardSavedData") || "[]") || []; } catch { saved = []; }
  // 판 배경색: 지금 보는 판은 실제 색, 다른 판은 저장된 색 ('inherit' = 테마 판 색)
  const bgOf = (m: "board" | "notice") => {
    if (m === mode) { const c = getComputedStyle($("notepad-editor") || document.body).backgroundColor; return c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent" ? c : ""; }
    const v = storage.getItem(m === "board" ? "smartBoardNotepadBg_board" : "smartBoardNotepadBg_notice") || (m === "board" ? "#064e3b" : "#ffffff");
    return v === "inherit" ? "" : v;
  };
  const isDark = (c: string) => {
    const m = c.match(/^#([0-9a-f]{6})$/i), r = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    const [R, G, B] = m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : r ? [r[1], r[2], r[3]].map(Number) : [255, 255, 255];
    return (0.299 * R + 0.587 * G + 0.114 * B) < 140;
  };
  const thumbStyle = (m: "board" | "notice") => { const c = bgOf(m); return c ? ` style="background:${esc(c)}"` : ""; };
  const thumbDark = (m: "board" | "notice") => { const c = bgOf(m); return c && isDark(c) ? " is-dark" : ""; };
  const lines = (arr: string[]) => arr.length ? arr.map((l) => `<span>${esc(l)}</span>`).join("") : `<span class="sb-ov-blank">비어 있어요</span>`;
  const card = (key: string, title: string, body: string, current: boolean) => {
    const k = key as "board" | "notice";
    const extra = key === "saved" ? "" : thumbDark(k), style = key === "saved" ? "" : thumbStyle(k);
    return `<button type="button" class="sb-ov-win${current ? " is-current" : ""}" data-win="${key}"><span class="sb-ov-thumb sb-ov-thumb-${key}${extra}"${style}>${body}</span><span class="sb-ov-win-title">${title}</span></button>`;
  };
  box.innerHTML =
    card("board", `판서${mode === "board" ? " · 지금 보는 화면" : ""}`, `<span class="sb-ov-bar"></span><span class="sb-ov-lines">${lines(htmlLines(boardHtml))}</span>`, mode === "board") +
    card("notice", `알림장${mode === "notice" ? " · 지금 보는 화면" : ""}`, `<span class="sb-ov-bar"></span><span class="sb-ov-lines">${lines(htmlLines(noticeHtml))}</span>`, mode === "notice") +
    card("saved", `지난 기록 · ${saved.length}개`, `<span class="sb-ov-list">${saved.length ? saved.slice(0, 3).map((b) => `<span><b>${esc(b.title || "제목 없음")}</b><i>${esc(b.date || "")}</i></span>`).join("") : `<span class="sb-ov-blank">아직 보관한 기록이 없어요</span>`}</span>`, false);
}

function renderGrid(q = "") {
  const grid = $("sb-ov-grid"); if (!grid) return;
  const nq = norm(q);
  const hits = TOOLS.filter((t) => !nq || norm(t.label + " " + t.words).includes(nq));
  grid.innerHTML = hits.map((t) => `<button type="button" class="sb-ov-tool" data-tool="${t.key}"><span class="sb-tile sb-tone-${t.tone}"><i data-lucide="${t.icon}"></i></span><span class="sb-ov-tool-label">${esc(t.label)}</span></button>`).join("");
  const empty = $("sb-ov-empty");
  if (empty) { empty.hidden = hits.length > 0; empty.textContent = hits.length ? "" : `‘${q}’에 맞는 도구가 없어요. 다른 낱말로 찾아보세요.`; }
  // 검색 중에는 열린 화면 대신 결과만
  const wins = $("sb-ov-windows"); if (wins) wins.hidden = !!nq;
  icons();
}

function runTool(key: string) {
  const t = TOOLS.find((x) => x.key === key); if (!t) return;
  toggleOverview(false);
  window.setTimeout(() => t.run(), 0);
}

export function toggleOverview(force?: boolean) {
  const ov = $("sb-overview"); if (!ov) return;
  const open = force ?? Boolean(ov.hidden);
  if (open === !ov.hidden) return;
  if (open) {
    toggleQuick(false);
    const input = $("sb-ov-input") as HTMLInputElement | null;
    if (input) input.value = "";
    renderWindows(); renderGrid("");
    ov.hidden = false;
    document.body.classList.add("sb-ov-open");
    requestAnimationFrame(() => input?.focus({ preventScroll: true }));
  } else {
    ov.hidden = true;
    document.body.classList.remove("sb-ov-open");
  }
  $("btn-activities")?.setAttribute("aria-expanded", String(open));
  $("btn-dock-overview")?.classList.toggle("is-open", open);
}

function initOverview() {
  const ov = $("sb-overview"), input = $("sb-ov-input") as HTMLInputElement | null;
  if (!ov || !input) return;
  input.addEventListener("input", () => renderGrid(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); const first = ov.querySelector<HTMLElement>(".sb-ov-tool"); if (first) runTool(first.dataset.tool!); }
    if (e.key === "Escape" && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ""; renderGrid(""); }
  });
  ov.addEventListener("click", (e) => {
    const tgt = e.target as HTMLElement;
    const tool = tgt.closest<HTMLElement>(".sb-ov-tool");
    if (tool) { runTool(tool.dataset.tool!); return; }
    const win = tgt.closest<HTMLElement>(".sb-ov-win");
    if (win) {
      const k = win.dataset.win;
      toggleOverview(false);
      if (k === "board" || k === "notice") setBoardMode(k);
      else if (k === "saved") call("openSavedBoards");
      return;
    }
    // 빈 곳(검색창·버튼이 아닌 곳)을 누르면 닫힘
    if (!tgt.closest(".sb-ov-search")) toggleOverview(false);
  });
}

// ---------------------------------------------------------------- 집중 모드
export function toggleFocus(force?: boolean) {
  const on = force ?? !document.body.classList.contains("sb-focus");
  document.body.classList.toggle("sb-focus", on);
  if (!on) document.body.classList.remove("sb-dock-open");
  $("btn-focus")?.setAttribute("aria-pressed", String(on));
  $("sb-dock-peek")?.setAttribute("aria-expanded", "false");
  // 판 크기가 바뀌었으므로 사진 도구 위치·떠 있는 창·Dock 맞춤을 다시
  window.setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
}
export function peekDock() {
  const open = !document.body.classList.contains("sb-dock-open");
  document.body.classList.toggle("sb-dock-open", open);
  $("sb-dock-peek")?.setAttribute("aria-expanded", String(open));
  const lbl = $("sb-dock-peek")?.querySelector("span"); if (lbl) lbl.textContent = open ? "도구 모음 숨기기" : "도구 모음";
}

// ---------------------------------------------------------------- Dock: 열려 있는 도구 표시
function watchRunning(panelId: string, btnId: string, openWhen: (el: HTMLElement) => boolean) {
  const panel = $(panelId), btn = $(btnId);
  if (!panel || !btn) return;
  const sync = () => btn.classList.toggle("is-open", openWhen(panel));
  new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ["class"] });
  sync();
}

// ---------------------------------------------------------------- 오른쪽 위젯
const widgetsVisible = () => { const w = $("sb-widgets"); return !!w && getComputedStyle(w).display !== "none" && !document.body.classList.contains("sb-focus"); };
let lunchBusy = false, lunchDay = "", eventsDay = "";

async function renderLunchWidget(force = false) {
  const body = $("sb-lunch-body"), title = $("sb-lunch-title");
  if (!body || lunchBusy || !W.lunch?.widgetMeal) return;
  lunchBusy = true;
  try {
    const r: WidgetMeal = await W.lunch.widgetMeal(force);
    lunchDay = new Date().toDateString();
    if (r.status === "no-school") {
      if (title) title.textContent = "오늘 급식";
      body.innerHTML = `<p class="sb-w-empty">학교를 정하면 오늘 급식이 여기에 보여요.</p><button type="button" class="sb-w-cta" onclick="openLunchModal()">학교 정하기</button>`;
    } else if (r.status === "none") {
      if (title) title.textContent = r.label;
      body.innerHTML = `<p class="sb-w-empty">등록된 급식이 없어요.</p>`;
    } else {
      if (title) title.textContent = r.label;
      const mine = new Set(r.allergens);
      body.innerHTML = `<ul class="sb-menu">${r.dishes.map((d) => {
        const hit = d.codes.some((c) => mine.has(c));
        return `<li class="${hit ? "is-allergy" : ""}"><span>${esc(d.name)}</span>${hit ? `<em>알레르기</em>` : ""}</li>`;
      }).join("")}</ul>${r.cal ? `<p class="sb-w-foot">${esc(r.cal)}</p>` : ""}`;
    }
  } catch (e) {
    console.warn("급식 위젯:", e);
    body.innerHTML = `<p class="sb-w-empty">급식 정보를 가져오지 못했어요.</p><button type="button" class="sb-w-cta" data-retry="lunch">다시 시도</button>`;
    body.querySelector("[data-retry]")?.addEventListener("click", () => void renderLunchWidget(true));
  } finally { lunchBusy = false; }
}

const relDay = (d: Date) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - today.getTime()) / 86400000);
  return diff === 0 ? "오늘" : diff === 1 ? "내일" : `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
};
async function renderEventsWidget() {
  const body = $("sb-events-body");
  if (!body || !W.schoolCalendar?.upcomingEvents) return;
  try {
    const list = await W.schoolCalendar.upcomingEvents(14) as Array<{ date: string; name: string; holiday: boolean }> | null;
    eventsDay = new Date().toDateString();
    if (list === null) { body.innerHTML = `<p class="sb-w-empty">학교를 정하면 다가오는 일정이 보여요.</p>`; return; }
    if (!list.length) { body.innerHTML = `<p class="sb-w-empty">2주 안에 학사일정이 없어요.</p>`; return; }
    body.innerHTML = `<ul class="sb-events">${list.slice(0, 5).map((e) => {
      const d = new Date(Number(e.date.slice(0, 4)), Number(e.date.slice(4, 6)) - 1, Number(e.date.slice(6, 8)));
      return `<li><span class="sb-ev-date">${relDay(d)}</span><span class="sb-ev-name">${esc(e.name)}</span>${e.holiday ? `<em>쉬는 날</em>` : ""}</li>`;
    }).join("")}</ul>`;
  } catch (e) {
    console.warn("학사일정 위젯:", e);
    body.innerHTML = `<p class="sb-w-empty">일정을 가져오지 못했어요.</p>`;
  }
}
function refreshWidgets(force = false) {
  if (!widgetsVisible()) return;
  const today = new Date().toDateString();
  if (force || lunchDay !== today) void renderLunchWidget();
  if (force || eventsDay !== today) void renderEventsWidget();
}

// ---------------------------------------------------------------- 시작
export function initShell() {
  // 지금 수업 상태: 시간표가 다시 그려지거나 과목을 고치면 바로, 그 밖엔 2초마다
  const tt = $("timetable-container");
  if (tt) {
    new MutationObserver(() => { lastStatusKey = ""; renderStatus(); }).observe(tt, { childList: true });
    tt.addEventListener("change", () => { lastStatusKey = ""; renderStatus(); });
  }
  renderStatus();
  window.setInterval(renderStatus, 2000);

  // 판서/알림장 전환 버튼: 기능 코드가 바꾸는 이름(#board-mode-text)을 보고 맞춤
  const modeText = $("board-mode-text");
  if (modeText) new MutationObserver(syncBoardMode).observe(modeText, { childList: true, characterData: true, subtree: true });
  syncBoardMode();

  // 빠른 설정·개요: 바깥을 누르거나 Esc 로 닫기
  document.addEventListener("pointerdown", (e) => {
    const q = $("sb-quick");
    if (q && !q.hidden && !(e.target as HTMLElement).closest("#sb-quick, #btn-quick-settings")) toggleQuick(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("sb-overview")?.hidden) { e.preventDefault(); toggleOverview(false); return; }
    if (!$("sb-quick")?.hidden) { e.preventDefault(); toggleQuick(false); return; }
    if (document.body.classList.contains("sb-focus") && !anyModalOpen()) toggleFocus(false);
  });
  document.addEventListener("fullscreenchange", syncFullscreen);
  initOverview();
  syncBell();
  $("qs-skins")?.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-skin-id]");
    if (b?.dataset.skinId) { W.skins?.apply(b.dataset.skinId); renderSkinSwatches(); }
  });
  // 수업 종 스위치는 교시 알람 설정 창에서도 바뀜 → 그 창이 닫힐 때 다시 맞춤
  const alarmModal = $("modal-alarm-settings");
  if (alarmModal) new MutationObserver(syncBell).observe(alarmModal, { attributes: true, attributeFilter: ["class"] });
  // 테마를 바꾸면(환경 설정 카드 포함) 빠른 설정의 테마 동그라미도
  new MutationObserver(renderSkinSwatches).observe(document.documentElement, { attributes: true, attributeFilter: ["data-skin"] });

  // Dock: 열려 있는 떠 있는 창
  const shown = (el: HTMLElement) => !el.classList.contains("hidden");
  watchRunning("floating-timer", "btn-tool-timer", shown);
  watchRunning("floating-noise-meter", "btn-tool-noise", shown);
  watchRunning("floating-popup-note", "btn-tool-popupnote", shown);
  watchRunning("floating-youtube", "btn-tool-youtube", shown);
  watchRunning("modal-lunch", "btn-tool-lunch", (el) => el.classList.contains("active"));

  // 오른쪽 위젯: 시작 조금 뒤, 30분마다, 날짜가 바뀌면, 급식·설정 창을 닫으면(학교·알레르기를 바꿨을 수 있음)
  window.setTimeout(() => refreshWidgets(true), 1500);
  window.setInterval(() => refreshWidgets(false), 60_000);
  window.setInterval(() => refreshWidgets(true), 30 * 60_000);
  let wasVisible = widgetsVisible();
  window.addEventListener("resize", () => { const v = widgetsVisible(); if (v && !wasVisible) refreshWidgets(true); wasVisible = v; });
  for (const id of ["modal-lunch", "modal-settings"]) {
    const m = $(id); if (!m) continue;
    let was = m.classList.contains("active");
    new MutationObserver(() => { const a = m.classList.contains("active"); if (was && !a) window.setTimeout(() => refreshWidgets(true), 300); was = a; })
      .observe(m, { attributes: true, attributeFilter: ["class"] });
  }
}

declare global {
  interface Window {
    shell: {
      toggleOverview: typeof toggleOverview; toggleQuick: typeof toggleQuick; toggleFocus: typeof toggleFocus; peekDock: typeof peekDock;
      setBoardMode: typeof setBoardMode; toggleBell: typeof toggleBell; toggleAutostart: typeof toggleAutostart; status: typeof computeStatus;
    };
  }
}
window.shell = { toggleOverview, toggleQuick, toggleFocus, peekDock, setBoardMode, toggleBell, toggleAutostart, status: computeStatus };
