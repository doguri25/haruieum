// ============================================================
// 3.1.0 첫 화면 위젯 — 오른쪽 칸에 무엇을 어떤 순서로 둘지 사용자가 고름
//  - 고를 수 있는 위젯: 급식 · 메모 · 타이머 · 학사일정 · 날씨 (기본: 급식 · 메모 · 타이머)
//  - 저장: "sb.widgets" = 켠 위젯 id 를 순서대로 담은 JSON 배열 (빈 배열이면 오른쪽 칸을 숨김)
//  - 메모 내용: "sb.widget.memo" (storage.ts 에서 popup-note.json 에 따로 저장)
//  - 타이머 위젯은 기존 타이머(legacy-app.js)를 그대로 쓰고 보여 주기만 함 → 떠 있는 타이머 창과 같은 시간
//  - 편집 창: #modal-widgets (켜기/끄기 스위치 + 위/아래 순서 버튼)
// ============================================================
import { storage } from "./storage";
import type { WidgetMeal } from "./lunch";
import type { WeatherSnapshot } from "./weather";

const W = window as any;
const $ = (id: string) => document.getElementById(id);
const call = (name: string, ...args: unknown[]) => { const f = W[name]; if (typeof f === "function") return f(...args); console.warn(`${name} 함수가 없습니다`); };
const icons = () => W.lucide?.createIcons();
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export type WidgetId = "lunch" | "memo" | "timer" | "events" | "weather";
interface WidgetInfo { id: WidgetId; name: string; desc: string; icon: string; tone: string }
export const CATALOG: WidgetInfo[] = [
  { id: "lunch", name: "급식", desc: "오늘(또는 다음 등교일) 급식 메뉴와 알레르기", icon: "utensils", tone: "green" },
  { id: "memo", name: "메모", desc: "쓰면 바로 저장되는 짧은 메모", icon: "notebook-pen", tone: "gold" },
  { id: "timer", name: "타이머", desc: "떠 있는 타이머 창과 같은 시간을 여기서도", icon: "timer", tone: "orange" },
  { id: "events", name: "학사일정", desc: "앞으로 2주 동안의 학교 일정", icon: "calendar-days", tone: "rose" },
  { id: "weather", name: "날씨", desc: "지금 기온·하늘·미세먼지와 몇 시간 뒤 예보", icon: "cloud-sun", tone: "sky" },
];
export const DEFAULT_WIDGETS: WidgetId[] = ["lunch", "memo", "timer"];
const KEY = "sb.widgets", MEMO_KEY = "sb.widget.memo";
const isWidget = (v: unknown): v is WidgetId => CATALOG.some((c) => c.id === v);

export function getWidgets(): WidgetId[] {
  const raw = storage.getItem(KEY);
  if (raw === null) return [...DEFAULT_WIDGETS];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return [...new Set(arr.filter(isWidget))];
  } catch { /* 깨졌으면 기본값 */ }
  return [...DEFAULT_WIDGETS];
}
export function setWidgets(list: WidgetId[]) {
  const clean = [...new Set(list.filter(isWidget))];
  storage.setItem(KEY, JSON.stringify(clean));
  apply();
  renderEditor();
}
export function resetWidgets() { setWidgets([...DEFAULT_WIDGETS]); }

const sectionOf = (id: WidgetId) => document.querySelector<HTMLElement>(`#sb-widgets [data-widget="${id}"]`);
const columnShown = () => { const w = $("sb-widgets"); return !!w && !w.hidden && getComputedStyle(w).display !== "none" && !document.body.classList.contains("sb-focus"); };
const isOn = (id: WidgetId) => columnShown() && !!sectionOf(id) && !sectionOf(id)!.hidden;

/** 켠 위젯만 보이고, 고른 순서대로 놓음. 하나도 없으면 오른쪽 칸 전체를 숨겨 판서 창이 넓어짐 */
function apply() {
  const col = $("sb-widgets"); if (!col) return;
  const list = getWidgets();
  const editBtn = $("sb-widgets-edit");
  for (const c of CATALOG) { const s = sectionOf(c.id); if (s) s.hidden = !list.includes(c.id); }
  for (const id of list) { const s = sectionOf(id); if (s) col.insertBefore(s, editBtn); }
  col.hidden = list.length === 0;
  document.body.classList.toggle("sb-no-widgets", list.length === 0);
  const sum = $("setting-widgets-summary");
  if (sum) sum.textContent = list.length ? list.map((id) => CATALOG.find((c) => c.id === id)!.name).join(" · ") : "위젯 없음";
  refresh(true);
}

// ---------------------------------------------------------------- 급식
let lunchBusy = false, lunchDay = "";
async function renderLunch(force = false) {
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
    body.querySelector("[data-retry]")?.addEventListener("click", () => void renderLunch(true));
  } finally { lunchBusy = false; }
}

// ---------------------------------------------------------------- 학사일정
let eventsDay = "";
const relDay = (d: Date) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - today.getTime()) / 86400000);
  return diff === 0 ? "오늘" : diff === 1 ? "내일" : `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
};
async function renderEvents() {
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

// ---------------------------------------------------------------- 날씨
const DUST_TONE = ["good", "fair", "bad", "worst"];
function renderWeather() {
  const body = $("sb-weather-body"), title = $("sb-weather-title");
  if (!body || !W.weather?.snapshot) return;
  const s: WeatherSnapshot = W.weather.snapshot();
  if (title) title.textContent = s.place ? `${s.place} 날씨` : "날씨";
  if (s.status === "no-key") {
    body.innerHTML = `<p class="sb-w-empty">날씨를 보려면 공공데이터포털 인증키가 필요해요.</p><button type="button" class="sb-w-cta" onclick="openWeather()">인증키·지역 정하기</button>`;
  } else if (s.status === "loading") {
    body.innerHTML = `<p class="sb-w-empty">날씨를 불러오는 중…</p>`;
  } else if (s.status === "error") {
    body.innerHTML = `<p class="sb-w-empty">날씨를 가져오지 못했어요.</p><button type="button" class="sb-w-cta" onclick="window.weather.refresh()">다시 시도</button>`;
  } else {
    body.innerHTML = `<div class="sb-wx-now">
        <i data-lucide="${esc(s.icon)}" class="sb-wx-icon ${esc(s.color)}" aria-hidden="true"></i>
        <span class="sb-wx-temp sb-num">${s.temp ?? "-"}°</span>
        <span class="sb-wx-desc"><b>${esc(s.desc)}</b><small>최고 ${s.max ?? "-"}° · 최저 ${s.min ?? "-"}°</small></span>
      </div>
      ${s.dust ? `<p class="sb-wx-dust" data-tone="${DUST_TONE[s.dustRank] ?? ""}"><span aria-hidden="true"></span>미세먼지 ${esc(s.dust)}</p>` : ""}
      ${s.hours.length ? `<ul class="sb-wx-hours">${s.hours.map((h) => `<li><span>${esc(h.label)}</span><i data-lucide="${esc(h.icon)}" class="${esc(h.color)}" aria-hidden="true"></i><b class="sb-num">${h.temp ?? "-"}°</b></li>`).join("")}</ul>` : ""}`;
    icons();
  }
}

// ---------------------------------------------------------------- 메모
let memoTimer = 0;
function initMemo() {
  const ta = $("sb-memo-text") as HTMLTextAreaElement | null, state = $("sb-memo-state");
  if (!ta) return;
  ta.value = storage.getItem(MEMO_KEY) || "";
  ta.addEventListener("input", () => {
    storage.setItem(MEMO_KEY, ta.value);
    if (state) state.textContent = "저장 중…";
    window.clearTimeout(memoTimer);
    memoTimer = window.setTimeout(() => { if (state) state.textContent = "저장됨"; }, 700);
  });
  ta.addEventListener("blur", () => { if (state) state.textContent = ""; });
}

// ---------------------------------------------------------------- 타이머 (기존 타이머를 비춰 보여 줌)
const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
function syncTimer() {
  const time = $("sb-wt-time"), bar = $("sb-wt-progress"), tog = $("sb-wt-toggle"), box = $("sb-timer-widget");
  if (!time || !tog || !box || typeof W.getTimerState !== "function") return;
  const st = W.getTimerState() as { remaining: number; total: number; running: boolean };
  const txt = fmt(st.remaining);
  if (time.textContent !== txt) time.textContent = txt;
  const r = st.total > 0 ? Math.max(0, Math.min(1, st.remaining / st.total)) : 0;
  if (bar) { bar.style.width = (r * 100).toFixed(1) + "%"; bar.dataset.level = r > 0.5 ? "ok" : r > 0.2 ? "half" : "low"; }
  // running: 가는 중 · paused: 멈춤(계속) · ready: 시간만 맞춤(시작) · idle: 00:00
  const paused = $("btn-timer-toggle")?.dataset.state === "paused";
  const state = st.running ? "running" : st.remaining > 0 ? (paused ? "paused" : "ready") : "idle";
  if (box.dataset.state !== state || !tog.firstElementChild) {
    box.dataset.state = state;
    tog.innerHTML = state === "running" ? `<i data-lucide="pause"></i>정지` : `<i data-lucide="play"></i>${state === "paused" ? "계속" : "시작"}`;
    icons();
  }
  (tog as HTMLButtonElement).disabled = state === "idle";
  // 5·3·1분 전 알림 때 떠 있는 창의 숫자가 빨갛게 깜박이면 여기도
  time.classList.toggle("is-warn", !!$("timer-display")?.classList.contains("text-red-500"));
}
function initTimer() {
  const box = $("sb-timer-widget"); if (!box) return;
  box.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button"); if (!b) return;
    if (b.dataset.add) call("addTimerTime", Number(b.dataset.add));
    else if (b.dataset.act === "toggle") call("toggleTimer");
    else if (b.dataset.act === "reset") call("resetTimer");
    else if (b.dataset.act === "big") { if ($("floating-timer")?.classList.contains("hidden")) call("toggleTimerPopup"); }
    syncTimer();
  });
  // 기존 타이머가 숫자·버튼을 바꿀 때마다 (1초마다, 떠 있는 창에서 눌렀을 때) 따라 바꿈
  const d = $("timer-display"), t = $("btn-timer-toggle");
  const mo = new MutationObserver(() => { if (isOn("timer")) syncTimer(); });
  if (d) mo.observe(d, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  if (t) mo.observe(t, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });
  syncTimer();
}

// ---------------------------------------------------------------- 새로 고침
function refresh(force = false) {
  if (!columnShown()) return;
  const today = new Date().toDateString();
  if (isOn("lunch") && (force || lunchDay !== today)) void renderLunch();
  if (isOn("events") && (force || eventsDay !== today)) void renderEvents();
  if (isOn("weather") && force) renderWeather();
  if (isOn("timer")) syncTimer();
}

// ---------------------------------------------------------------- 편집 창
function renderEditor() {
  const list = $("sb-we-list"); if (!list) return;
  const on = getWidgets();
  const rows = [...on.map((id) => CATALOG.find((c) => c.id === id)!), ...CATALOG.filter((c) => !on.includes(c.id))];
  list.innerHTML = rows.map((c) => {
    const i = on.indexOf(c.id), enabled = i >= 0;
    return `<li class="sb-we-row" data-id="${c.id}" data-on="${enabled}">
      <span class="sb-w-icon sb-tone-${c.tone}" aria-hidden="true"><i data-lucide="${c.icon}"></i></span>
      <span class="sb-we-txt"><b>${c.name}</b><small>${c.desc}</small></span>
      <span class="sb-we-move">
        <button type="button" class="sb-we-arrow" data-move="-1" aria-label="${c.name} 위로" ${!enabled || i === 0 ? "disabled" : ""}><i data-lucide="arrow-up"></i></button>
        <button type="button" class="sb-we-arrow" data-move="1" aria-label="${c.name} 아래로" ${!enabled || i === on.length - 1 ? "disabled" : ""}><i data-lucide="arrow-down"></i></button>
      </span>
      <button type="button" class="sb-switch" role="switch" aria-checked="${enabled}" aria-label="${c.name} 보이기" data-toggle><span></span></button>
    </li>`;
  }).join("");
  const n = $("sb-we-count"); if (n) n.textContent = on.length ? `${on.length}개 켬` : "모두 끔 — 오른쪽 칸이 숨겨져요";
  icons();
}
function initEditor() {
  $("sb-we-list")?.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button"); if (!b || b.disabled) return;
    const id = b.closest<HTMLElement>("[data-id]")?.dataset.id as WidgetId | undefined; if (!id) return;
    const on = getWidgets();
    if (b.hasAttribute("data-toggle")) {
      setWidgets(on.includes(id) ? on.filter((x) => x !== id) : [...on, id]);
    } else if (b.dataset.move) {
      const i = on.indexOf(id), j = i + Number(b.dataset.move);
      if (i < 0 || j < 0 || j >= on.length) return;
      [on[i], on[j]] = [on[j], on[i]];
      setWidgets(on);
    }
    // 다시 그린 뒤에도 같은 버튼에 초점이 남게 (터치펜·키보드로 여러 번 누를 때)
    const sel = b.hasAttribute("data-toggle") ? "[data-toggle]" : `[data-move="${b.dataset.move}"]`;
    const again = document.querySelector<HTMLButtonElement>(`#sb-we-list [data-id="${id}"] ${sel}`);
    if (again && !again.disabled) again.focus(); else document.querySelector<HTMLElement>(`#sb-we-list [data-id="${id}"] [data-toggle]`)?.focus();
  });
}
export function openEditor() {
  renderEditor();
  const m = $("modal-widgets"); if (!m) return;
  m.classList.remove("closing");
  m.classList.add("active");
  window.setTimeout(() => $("sb-we-list")?.querySelector<HTMLElement>("[data-toggle]")?.focus(), 60);
}

// ---------------------------------------------------------------- 시작
export function initWidgets() {
  initMemo();
  initTimer();
  initEditor();
  apply();
  // 시작 조금 뒤(학교 정보가 준비된 다음), 1분마다 날짜가 바뀌었는지, 30분마다 새로
  window.setTimeout(() => refresh(true), 1500);
  window.setInterval(() => refresh(false), 60_000);
  window.setInterval(() => refresh(true), 30 * 60_000);
  document.addEventListener("sb:weather", () => { if (isOn("weather")) renderWeather(); });
  let wasShown = columnShown();
  const onLayout = () => { const v = columnShown(); if (v && !wasShown) refresh(true); wasShown = v; };
  window.addEventListener("resize", onLayout);
  new MutationObserver(onLayout).observe(document.body, { attributes: true, attributeFilter: ["class"] }); // 집중 모드에서 나올 때
  // 급식·설정 창을 닫으면 (학교·알레르기를 바꿨을 수 있음)
  for (const id of ["modal-lunch", "modal-settings"]) {
    const m = $(id); if (!m) continue;
    let was = m.classList.contains("active");
    new MutationObserver(() => { const a = m.classList.contains("active"); if (was && !a) window.setTimeout(() => refresh(true), 300); was = a; })
      .observe(m, { attributes: true, attributeFilter: ["class"] });
  }
}

declare global {
  interface Window {
    widgets: { get: typeof getWidgets; set: typeof setWidgets; reset: typeof resetWidgets; openEditor: typeof openEditor; catalog: typeof CATALOG };
  }
}
window.widgets = { get: getWidgets, set: setWidgets, reset: resetWidgets, openEditor, catalog: CATALOG };
