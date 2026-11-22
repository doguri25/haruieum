// ============================================================
// 급식 (2.3.0) — NEIS 급식 식단 + 알레르기 표시
// 2.7.0: 날짜 이동(◀ ▶, 주말은 건너뜀)과 이번 주(월~금) 보기, 중식만 표시, NEIS 인증키(선택)
//  - 학교 검색·식단 조회는 Tauri http 플러그인으로 (CORS 없이)
//  - 알레르기: 19가지 중 우리 반에 해당하는 것만 체크 → 그 재료가 든 메뉴는 붉게 표시,
//    체크하지 않은 알레르기 번호는 숨김
//  저장 키: smartBoardSchool (학교), smartBoardAllergens (체크한 번호 배열)
// ============================================================
import { storage } from "./storage";
import { esc, fromYmd, getSchool, neisRows, setNeisKey, getNeisKey, WEEKDAYS, ymd } from "./neis";

export const ALLERGENS: Record<number, string> = {
  1: "난류(계란)", 2: "우유", 3: "메밀", 4: "땅콩", 5: "대두(콩)", 6: "밀", 7: "고등어", 8: "게", 9: "새우",
  10: "돼지고기", 11: "복숭아", 12: "토마토", 13: "아황산류", 14: "호두", 15: "닭고기", 16: "쇠고기", 17: "오징어",
  18: "조개류(굴·전복·홍합)", 19: "잣",
};

const el = (id: string) => document.getElementById(id);
export function getAllergens(): number[] {
  try { const a = JSON.parse(storage.getItem("smartBoardAllergens") || "[]"); return Array.isArray(a) ? a.map(Number).filter((n) => ALLERGENS[n]) : []; } catch { return []; }
}
function setAllergens(list: number[]) { storage.setItem("smartBoardAllergens", JSON.stringify([...new Set(list)].sort((a, b) => a - b))); }

// ---------- 알레르기 설정 패널 ----------
export function renderAllergyChips() {
  const box = el("allergy-chips"); if (!box) return;
  const on = new Set(getAllergens());
  box.innerHTML = Object.entries(ALLERGENS).map(([n, name]) => {
    const active = on.has(Number(n));
    return `<button type="button" onclick="window.lunch.toggleAllergen(${n})" class="px-2.5 py-1 rounded-full text-sm font-bold border transition ${active ? "bg-rose-500 border-rose-500 text-white" : "bg-white border-rose-200 text-rose-700 hover:bg-rose-100"}"><span class="opacity-70 mr-1">${n}</span>${name}</button>`;
  }).join("");
}
export function toggleAllergyPanel(show?: boolean) {
  const p = el("allergy-panel"); if (!p) return;
  const willShow = show ?? p.classList.contains("hidden");
  p.classList.toggle("hidden", !willShow);
  if (willShow) { el("school-selector-panel")?.classList.add("hidden"); renderAllergyChips(); }
}
export function toggleAllergen(n: number) {
  const list = getAllergens();
  const i = list.indexOf(n);
  if (i >= 0) list.splice(i, 1); else list.push(n);
  setAllergens(list);
  renderAllergyChips();
  void renderMenu(); // 표시 즉시 갱신
}
export function clearAllergens() { setAllergens([]); renderAllergyChips(); void renderMenu(); }

// ---------- 식단 ----------
export interface Dish { name: string; codes: number[] }
/** "미역국(5.6.9.)" → { name: "미역국", codes: [5,6,9] }  (숫자 뒤 마침표·별표 허용) */
export function parseDish(raw: string): Dish {
  const codes: number[] = [];
  const name = raw.replace(/\(([\d.\s*]+)\)/g, (_, inner: string) => {
    inner.split(/[.\s*]+/).forEach((x) => { const n = parseInt(x, 10); if (n >= 1 && n <= 19 && !codes.includes(n)) codes.push(n); });
    return "";
  }).replace(/\s+/g, " ").trim();
  return { name, codes };
}

export interface Meal { date: Date; dishes: Dish[]; cal: string }
/** 보고 있는 날짜(하루 보기) 또는 그 주(이번 주 보기) */
let viewDate = new Date();
let weekMode = false;
/** 하루 보기: 그날 식단(없으면 null), 이번 주 보기: 월~금 */
let shown: { day: Meal | null } | { week: (Meal | null)[] } | null = null;

const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
/** 주말이면 가까운 평일로 (앞으로 가는 중이면 월요일, 뒤로 가는 중이면 금요일) */
function skipWeekend(d: Date, dir: 1 | -1) { while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, dir); return d; }

function rowToMeal(row: any): Meal {
  const dishes = String(row.DDISH_NM || "").split(/<br\s*\/?>/i).map((x) => x.trim()).filter(Boolean).map(parseDish);
  return { date: fromYmd(String(row.MLSV_YMD)), dishes, cal: row.CAL_INFO || "" };
}
/** 조식·석식이 있는 학교도 있으므로 중식(코드 2)을 고름 */
const pickLunch = (rows: any[]) => rows.find((r) => String(r.MMEAL_SC_CODE) === "2") ?? rows[0];

function relLabel(d: Date) {
  const diff = Math.round((dayOnly(d).getTime() - dayOnly(new Date()).getTime()) / 86400000);
  return diff === 0 ? "오늘" : diff === 1 ? "내일" : diff === -1 ? "어제" : "";
}
const dateLabel = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;

function dishHtml(d: Dish, checked: Set<number>, compact = false) {
  const hit = d.codes.filter((c) => checked.has(c));
  const size = compact ? "text-lg" : "text-2xl";
  if (hit.length) {
    const badges = hit.map((c) => `<span class="ml-1.5 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-sm font-bold whitespace-nowrap">${esc(ALLERGENS[c])}</span>`).join("");
    return `<div class="${size} font-bold text-rose-600 flex items-center flex-wrap gap-y-1"><i data-lucide="triangle-alert" class="${compact ? "w-4 h-4" : "w-6 h-6"} mr-2 shrink-0 text-rose-500"></i><span>${esc(d.name)}</span>${badges}</div>`;
  }
  return `<div class="${size} font-bold text-slate-800 flex items-center"><span class="w-2 h-2 bg-emerald-400 rounded-full mr-3 shrink-0"></span>${esc(d.name)}</div>`;
}

function navHtml() {
  const btn = "p-2 rounded-xl hover:bg-emerald-100 text-emerald-700 transition";
  const seg = (on: boolean) => `px-3 py-1.5 rounded-lg font-bold text-sm transition ${on ? "bg-white text-emerald-700 shadow-sm" : "text-emerald-600 hover:bg-emerald-100"}`;
  let title: string;
  if (weekMode) {
    const mon = mondayOf(viewDate), fri = addDays(mon, 4);
    const thisWeek = dayOnly(mondayOf(new Date())).getTime() === dayOnly(mon).getTime();
    title = `${mon.getMonth() + 1}월 ${mon.getDate()}일 ~ ${fri.getMonth() + 1}월 ${fri.getDate()}일${thisWeek ? " · 이번 주" : ""}`;
  } else {
    const rel = relLabel(viewDate);
    title = `${dateLabel(viewDate)}${rel ? ` · ${rel}` : ""}`;
  }
  return `<div class="flex items-center justify-between gap-2 mb-4 shrink-0">
      <div class="flex items-center gap-1">
        <button onclick="window.lunch.move(-1)" class="${btn}" title="${weekMode ? "지난주" : "이전 날"}"><i data-lucide="chevron-left" class="w-6 h-6 pointer-events-none"></i></button>
        <span class="text-lg font-bold text-emerald-800 min-w-[11rem] text-center">${title}</span>
        <button onclick="window.lunch.move(1)" class="${btn}" title="${weekMode ? "다음 주" : "다음 날"}"><i data-lucide="chevron-right" class="w-6 h-6 pointer-events-none"></i></button>
      </div>
      <div class="flex items-center gap-1">
        <button onclick="window.lunch.goToday()" class="px-3 py-1.5 rounded-lg font-bold text-sm text-emerald-700 hover:bg-emerald-100 transition">오늘</button>
        <div class="flex bg-emerald-50 border border-emerald-100 rounded-xl p-0.5">
          <button onclick="window.lunch.setWeek(false)" class="${seg(!weekMode)}">하루</button>
          <button onclick="window.lunch.setWeek(true)" class="${seg(weekMode)}">이번 주</button>
        </div>
      </div>
    </div>`;
}

function legendHtml(meals: (Meal | null)[], checked: Set<number>) {
  if (!checked.size) return `<div class="mt-4 text-sm text-slate-400 font-bold">위의 ⚠ 버튼으로 알레르기 표시를 설정할 수 있어요.</div>`;
  const hitCount = meals.reduce((n, m) => n + (m ? m.dishes.filter((d) => d.codes.some((x) => checked.has(x))).length : 0), 0);
  const scope = weekMode ? "이번 주" : (relLabel(viewDate) || "이날");
  return `<div class="mt-4 text-sm text-rose-600 font-bold flex items-center gap-2 flex-wrap"><i data-lucide="triangle-alert" class="w-4 h-4"></i>표시 중: ${[...checked].sort((a, b) => a - b).map((x) => esc(ALLERGENS[x])).join(", ")}${hitCount ? ` · ${scope} ${hitCount}개 메뉴 주의` : ` · ${scope}${scope.endsWith("주") ? "는" : "은"} 해당 메뉴 없음`}</div>`;
}

async function renderMenu() {
  const c = el("modal-lunch-content"); const school = getSchool();
  if (!c || !school || !shown) return;
  const checked = new Set(getAllergens());
  let inner: string;
  if ("week" in shown) {
    const mon = mondayOf(viewDate);
    const today = dayOnly(new Date()).getTime();
    inner = `<div class="grid gap-3">${shown.week.map((m, i) => {
      const d = addDays(mon, i);
      const isToday = d.getTime() === today;
      const body = m && m.dishes.length ? `<div class="space-y-1.5">${m.dishes.map((x) => dishHtml(x, checked, true)).join("")}</div>` : `<div class="text-slate-400 font-bold">급식 없음</div>`;
      return `<div class="rounded-2xl p-4 border ${isToday ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200" : "bg-white border-slate-200"}">
          <div class="font-bold ${isToday ? "text-emerald-700" : "text-slate-500"} mb-2">${dateLabel(d)}${isToday ? " · 오늘" : ""}</div>${body}</div>`;
    }).join("")}</div>${legendHtml(shown.week, checked)}`;
  } else if (shown.day) {
    const m = shown.day;
    inner = `<div class="bg-emerald-50 rounded-2xl p-6 border border-emerald-100">
        <div class="space-y-4">${m.dishes.map((d) => dishHtml(d, checked)).join("")}</div>
        ${legendHtml([m], checked)}
        <div class="mt-6 text-right text-base text-slate-500 font-bold border-t border-emerald-200 pt-4">열량: ${esc(m.cal || "-")}</div>
      </div>`;
  } else {
    inner = `<div class="text-center text-slate-500 py-10 font-bold text-xl bg-slate-50 rounded-2xl">${relLabel(viewDate) || "이날"} 등록된 급식 식단이 없습니다.</div>`;
  }
  c.innerHTML = `<h3 class="text-2xl font-bold text-emerald-800 mb-3">${esc(school.name)}</h3>${navHtml()}${inner}`;
  window.lucide?.createIcons();
}

let loadSeq = 0;
/** 지금 보는 날짜(또는 주)의 식단을 받아 그림 */
async function load() {
  const c = el("modal-lunch-content"); const school = getSchool();
  if (!c || !school) return;
  c.innerHTML = `<h3 class="text-2xl font-bold text-emerald-800 mb-3">${esc(school.name)}</h3>${navHtml()}<div class="flex flex-col items-center py-10"><i data-lucide="loader-2" class="w-10 h-10 text-emerald-500 animate-spin mb-4"></i></div>`;
  // 2.8.1: 받는 중·실패한 뒤에 알레르기를 바꾸면 이전 날 식단이 새 날짜 이름으로 다시 그려졌음 → 받기 시작할 때 비움
  shown = null;
  window.lucide?.createIcons();
  const base = { ATPT_OFCDC_SC_CODE: school.officeCode, SD_SCHUL_CODE: school.code };
  // 2.8.2: 받기마다 순번 — 날짜뿐 아니라 학교를 바꾼 경우에도 늦게 온 이전 응답을 버림
  const seq = ++loadSeq;
  try {
    if (weekMode) {
      const mon = mondayOf(viewDate);
      // 인증키 없이 5건까지라 중식(코드 2)만 받음 → 월~금 5건
      const rows = await neisRows("mealServiceDietInfo", { ...base, MLSV_FROM_YMD: ymd(mon), MLSV_TO_YMD: ymd(addDays(mon, 4)), MMEAL_SC_CODE: "2" });
      if (seq !== loadSeq) return; // 그 사이 다른 날짜·학교로 바뀜
      const byDay = new Map(rows.map((r: any) => [String(r.MLSV_YMD), rowToMeal(r)]));
      shown = { week: [0, 1, 2, 3, 4].map((i) => byDay.get(ymd(addDays(mon, i))) ?? null) };
    } else {
      const rows = await neisRows("mealServiceDietInfo", { ...base, MLSV_YMD: ymd(viewDate) });
      if (seq !== loadSeq) return;
      shown = { day: rows.length ? rowToMeal(pickLunch(rows)) : null };
    }
    await renderMenu();
  } catch (e) {
    if (seq !== loadSeq) return; // 그 사이 다른 날짜·학교로 바뀜
    console.error("급식 오류:", e);
    c.innerHTML = `<h3 class="text-2xl font-bold text-emerald-800 mb-3">${esc(school.name)}</h3>${navHtml()}<div class="text-center text-red-500 py-10 font-bold text-xl bg-red-50 rounded-2xl">급식 정보를 가져오는데 실패했습니다.<div class="text-sm text-red-400 mt-2 break-all">${esc(String((e as Error)?.message || e))}</div></div>`;
    window.lucide?.createIcons();
  }
}

// ---------- 3.0.0: 오른쪽 '오늘 급식' 위젯 ----------
export type WidgetMeal =
  | { status: "no-school" }
  | { status: "ok"; label: string; dishes: Dish[]; cal: string; allergens: number[] }
  | { status: "none"; label: string };
let widgetCache: { key: string; meal: Meal | null } | null = null;
/** 오늘(주말이면 다음 월요일) 급식. 같은 학교·같은 날은 한 번만 받음 */
export async function widgetMeal(force = false): Promise<WidgetMeal> {
  const school = getSchool();
  if (!school) return { status: "no-school" };
  const d = skipWeekend(dayOnly(new Date()), 1);
  const key = `${school.officeCode}:${school.code}:${ymd(d)}`;
  if (force || !widgetCache || widgetCache.key !== key) {
    const rows = await neisRows("mealServiceDietInfo", { ATPT_OFCDC_SC_CODE: school.officeCode, SD_SCHUL_CODE: school.code, MLSV_YMD: ymd(d) });
    widgetCache = { key, meal: rows.length ? rowToMeal(pickLunch(rows)) : null };
  }
  const rel = relLabel(d);
  const label = rel ? `${rel} 급식` : `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]}) 급식`;
  const m = widgetCache.meal;
  if (!m || !m.dishes.length) return { status: "none", label };
  return { status: "ok", label, dishes: m.dishes, cal: m.cal, allergens: getAllergens() };
}

/** 급식 창을 열 때: 오늘(주말이면 다음 월요일)부터 */
export async function fetchLunch() {
  viewDate = skipWeekend(dayOnly(new Date()), 1);
  return load();
}
export function move(dir: 1 | -1) {
  viewDate = weekMode ? addDays(mondayOf(viewDate), 7 * dir) : skipWeekend(addDays(viewDate, dir), dir);
  void load();
}
export function goToday() { viewDate = skipWeekend(dayOnly(new Date()), 1); void load(); }
export function setWeek(on: boolean) { if (weekMode === on) return; weekMode = on; void load(); }

export async function searchSchool() {
  const input = el("school-search-input") as HTMLInputElement | null;
  const q = input?.value.trim(); const c = el("school-search-results");
  if (!q || !c) return;
  c.innerHTML = '<div class="text-base py-2">검색 중...</div>';
  try {
    const rows = await neisRows<any>("schoolInfo", { SCHUL_NM: q });
    c.innerHTML = "";
    if (!rows.length) { c.innerHTML = '<div class="p-2 text-red-500">결과 없음</div>'; return; }
    rows.forEach((sch) => {
      const btn = document.createElement("button");
      btn.className = "text-left p-3 bg-white border rounded-lg text-base font-bold hover:bg-emerald-50 transition";
      btn.innerText = `[${sch.LCTN_SC_NM}] ${sch.SCHUL_NM}`;
      btn.onclick = () => {
        storage.setItem("smartBoardSchool", JSON.stringify({ code: sch.SD_SCHUL_CODE, officeCode: sch.ATPT_OFCDC_SC_CODE, name: sch.SCHUL_NM }));
        el("school-selector-panel")?.classList.add("hidden");
        void fetchLunch();
        void window.schoolCalendar?.refreshToday(true).then(() => (window as any).renderTimetable?.()); // 휴업일 표시 갱신 (2.8.1)
      };
      c.appendChild(btn);
    });
    if (rows.length >= 5 && !getNeisKey()) {
      c.insertAdjacentHTML("beforeend", '<div class="p-2 text-xs text-slate-500">인증키 없이는 5개까지만 보입니다. 우리 학교가 없으면 이름을 더 자세히 쓰거나 아래에 NEIS 인증키를 넣어 주세요.</div>');
    }
  } catch (e) { console.error(e); c.innerHTML = '<div class="p-2 text-red-500">검색 오류</div>'; }
}

/** 학교 검색 패널의 NEIS 인증키 칸 */
export function fillNeisKey() { const i = el("neis-key-input") as HTMLInputElement | null; if (i) i.value = getNeisKey(); }
export function saveNeisKey() {
  const i = el("neis-key-input") as HTMLInputElement | null; if (!i) return;
  setNeisKey(i.value);
  const m = el("neis-key-msg"); if (m) m.textContent = i.value.trim() ? "저장했습니다." : "인증키를 지웠습니다.";
  void window.schoolCalendar?.refreshToday(true).then(() => (window as any).renderTimetable?.());
}

declare global {
  interface Window {
    lunch: {
      fetch: () => Promise<void>; search: () => Promise<void>; toggleAllergyPanel: (s?: boolean) => void; toggleAllergen: (n: number) => void;
      clearAllergens: () => void; hasSchool: () => boolean; move: (d: 1 | -1) => void; goToday: () => void; setWeek: (on: boolean) => void;
      fillNeisKey: () => void; saveNeisKey: () => void; widgetMeal: (force?: boolean) => Promise<WidgetMeal>;
    }
  }
}
window.lunch = { fetch: fetchLunch, search: searchSchool, toggleAllergyPanel, toggleAllergen, clearAllergens, hasSchool: () => !!getSchool(), move, goToday, setWeek, fillNeisKey, saveNeisKey, widgetMeal };
