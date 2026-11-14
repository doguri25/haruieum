// ============================================================
// 학사일정 달력 + 휴일 자동 무음 (2.7.0)
//  - 급식 창에서 고른 학교의 NEIS 학사일정(SchoolSchedule)을 받아 달력에 표시
//  - 수업공제일 구분이 '휴업일'·'공휴일'인 날(개교기념일·재량휴업일·방학·명절 등)에는
//    수업 종·퇴근 알람을 울리지 않음 (legacy-app.js checkAlarms 가 holidayOn 으로 확인)
//  - 그래도 종이 필요한 날(보충수업 등)은 시간표의 '오늘은 종 울리기'로 그날만 켤 수 있음
//  - 인증키가 없으면 NEIS 가 한 번에 5건만 주므로 평일 주 단위로 나눠 받음 (+ 오늘 하루는 따로 확인)
//  - 받은 일정은 저장해 두어 인터넷이 끊겨도 휴일 판단이 됨 (12시간마다 새로 받음)
//  저장 키: smartBoardSchoolCalendar (학교별 월 캐시), smartBoardHolidayOverride (종을 켠 날 YYYYMMDD)
// ============================================================
import { esc, getNeisKey, getSchool, neisRows, WEEKDAYS, ymd } from "./neis";
import { storage } from "./storage";

export interface SchoolEvent { date: string; name: string; holiday: boolean; kind: string }
interface MonthCache { fetched: number; events: SchoolEvent[]; partial: boolean }
interface CacheFile { school: string; months: Record<string, MonthCache> }

const CACHE_KEY = "smartBoardSchoolCalendar";
const OVERRIDE_KEY = "smartBoardHolidayOverride";
const REFRESH_MS = 12 * 3600 * 1000;
const KEEP_MONTHS = 8;

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const monthKey = (y: number, m0: number) => `${y}${String(m0 + 1).padStart(2, "0")}`;

let mem: CacheFile | null = null;
function cache(): CacheFile {
  const school = getSchool()?.code ?? "";
  if (mem && mem.school === school) return mem;
  try {
    const c = JSON.parse(storage.getItem(CACHE_KEY) || "null") as CacheFile | null;
    mem = c && c.school === school && c.months ? c : { school, months: {} };
  } catch { mem = { school, months: {} }; }
  return mem;
}
function saveCache(c: CacheFile) {
  const keys = Object.keys(c.months).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_MONTHS))) delete c.months[k];
  mem = c;
  storage.setItem(CACHE_KEY, JSON.stringify(c));
}

const toEvent = (r: any): SchoolEvent => ({
  date: String(r.AA_YMD),
  name: String(r.EVENT_NM || "").trim(),
  kind: String(r.SBTR_DD_SC_NM || "").trim(),
  holiday: /휴업|공휴/.test(String(r.SBTR_DD_SC_NM || "")),
});
/** 매주 들어 있는 '토요휴업일'은 달력을 어지럽히므로 뺌. 같은 날 같은 일정은 하나로 */
function tidy(events: SchoolEvent[]) {
  const seen = new Set<string>();
  return events
    .filter((e) => e.name && e.name !== "토요휴업일" && !seen.has(e.date + e.name) && seen.add(e.date + e.name))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchRange(from: Date, to: Date): Promise<SchoolEvent[]> {
  const s = getSchool(); if (!s) return [];
  const rows = await neisRows("SchoolSchedule", { ATPT_OFCDC_SC_CODE: s.officeCode, SD_SCHUL_CODE: s.code, AA_FROM_YMD: ymd(from), AA_TO_YMD: ymd(to) });
  return rows.map(toEvent);
}

/** 한 달 일정 (12시간 안에 받은 것이 있으면 그대로) */
export async function loadMonth(y: number, m0: number, force = false): Promise<MonthCache | null> {
  if (!getSchool()) return null;
  const c = cache(), key = monthKey(y, m0), hit = c.months[key];
  if (hit && !force && Date.now() - hit.fetched < REFRESH_MS) return hit;
  const first = new Date(y, m0, 1), last = new Date(y, m0 + 1, 0);
  let events: SchoolEvent[] = [], partial = false;
  if (getNeisKey()) {
    events = await fetchRange(first, last);
  } else {
    // 인증키 없이 5건 제한 → 평일(월~금) 주 단위로 나눠 받음
    const ranges: [Date, Date][] = [];
    for (let mon = mondayOf(first); mon <= last; mon = addDays(mon, 7)) {
      const from = mon < first ? first : mon, fri = addDays(mon, 4), to = fri > last ? last : fri;
      if (from <= to) ranges.push([from, to]);
    }
    const parts = await Promise.all(ranges.map(([a, b]) => fetchRange(a, b)));
    partial = parts.some((p) => p.length >= 5);
    events = parts.flat();
  }
  const mc: MonthCache = { fetched: Date.now(), events: tidy(events), partial };
  const c2 = cache(); c2.months[key] = mc; saveCache(c2);
  return mc;
}

/** 시작할 때·날짜가 바뀔 때·학교를 바꿀 때: 이번 달 일정 + 오늘 하루를 확인 */
export async function refreshToday(force = false) {
  if (!getSchool()) return;
  const now = new Date();
  try {
    const mc = await loadMonth(now.getFullYear(), now.getMonth(), force);
    if (mc && !getNeisKey()) {
      // 인증키 없이 받은 주는 5건에서 잘렸을 수 있으므로 오늘 하루는 따로 한 번 더
      const today = await fetchRange(now, now);
      const c = cache(), key = monthKey(now.getFullYear(), now.getMonth());
      if (c.months[key]) { c.months[key].events = tidy([...c.months[key].events, ...today]); saveCache(c); }
    }
  } catch (e) {
    console.warn("학사일정을 받지 못했습니다(저장된 일정으로 판단):", e);
  }
}

export function eventsOn(d: Date): SchoolEvent[] {
  const key = ymd(d);
  return cache().months[key.slice(0, 6)]?.events.filter((e) => e.date === key) ?? [];
}

/** 그날이 휴업일·공휴일이면 일정 이름, 아니면 null. '오늘은 종 울리기'를 누른 날은 null */
export function holidayOn(d: Date): string | null {
  if (storage.getItem(OVERRIDE_KEY) === ymd(d)) return null;
  const hol = eventsOn(d).filter((e) => e.holiday);
  return hol.length ? hol.map((e) => e.name).join(", ") : null;
}
/** 휴업일이지만 오늘은 종을 울림 (그날만) */
export function ringToday() { storage.setItem(OVERRIDE_KEY, ymd(new Date())); }

// ---------- 달력 창 ----------
let shownMonth = "";
export function renderMonth(date: Date) {
  const y = date.getFullYear(), m0 = date.getMonth(), key = monthKey(y, m0);
  shownMonth = key;
  draw(y, m0);
  if (getSchool()) {
    setStatus("학사일정을 불러오는 중…");
    loadMonth(y, m0)
      .then(() => { if (shownMonth === key) draw(y, m0); })
      .catch((e) => { console.warn(e); if (shownMonth === key) setStatus("학사일정을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.", true); });
  }
}

function setStatus(text: string, warn = false) {
  const s = document.getElementById("calendar-status");
  if (s) { s.textContent = text; s.className = `text-xs font-bold mt-2 ${warn ? "text-amber-600" : "text-slate-400"}`; }
}

function draw(y: number, m0: number) {
  const title = document.getElementById("calendar-month-year");
  const g = document.getElementById("calendar-grid");
  const list = document.getElementById("calendar-events");
  if (!title || !g) return;
  title.innerText = `${y}년 ${m0 + 1}월`;
  const mc = cache().months[monthKey(y, m0)];
  const byDay = new Map<string, SchoolEvent[]>();
  for (const e of mc?.events ?? []) { const a = byDay.get(e.date) ?? []; a.push(e); byDay.set(e.date, a); }

  const fd = new Date(y, m0, 1).getDay(), dim = new Date(y, m0 + 1, 0).getDate();
  const today = ymd(new Date());
  let html = WEEKDAYS.map((d, i) => `<div class="text-center font-bold ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"} text-base py-1">${d}</div>`).join("");
  html += "<div></div>".repeat(fd);
  for (let d = 1; d <= dim; d++) {
    const date = new Date(y, m0, d), key = ymd(date), evs = byDay.get(key) ?? [], dow = date.getDay();
    const hol = evs.some((e) => e.holiday);
    const isToday = key === today;
    const num = isToday ? "bg-brand-500 text-white shadow-md" : hol || dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-700";
    const labels = evs.slice(0, 2).map((e) => `<span class="block w-full truncate text-[0.7rem] leading-tight font-bold ${e.holiday ? "text-rose-600" : "text-indigo-600"}" title="${esc(e.name)}">${esc(e.name)}</span>`).join("");
    const more = evs.length > 2 ? `<span class="text-[0.65rem] text-slate-400 leading-tight">+${evs.length - 2}</span>` : "";
    html += `<div class="h-[4.5rem] rounded-xl px-0.5 pt-1 flex flex-col items-center overflow-hidden ${hol ? "bg-rose-50" : ""}">
        <span class="flex items-center justify-center w-8 h-8 rounded-full font-bold text-lg shrink-0 ${num}">${d}</span>${labels}${more}</div>`;
  }
  g.innerHTML = html;

  if (list) {
    const evs = mc?.events ?? [];
    list.innerHTML = evs.length
      ? evs.map((e) => {
          const d = new Date(Number(e.date.slice(0, 4)), Number(e.date.slice(4, 6)) - 1, Number(e.date.slice(6, 8)));
          const badge = e.holiday ? `<span class="ml-2 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-bold whitespace-nowrap">${esc(e.kind)} · 종 안 울림</span>` : "";
          return `<div class="flex items-center py-1.5 border-b border-slate-100 last:border-0"><span class="w-24 shrink-0 font-bold ${e.holiday ? "text-rose-600" : "text-slate-500"}">${d.getDate()}일 (${WEEKDAYS[d.getDay()]})</span><span class="font-bold text-slate-800">${esc(e.name)}</span>${badge}</div>`;
        }).join("")
      : `<div class="text-slate-400 font-bold py-2">${getSchool() ? (mc ? "이번 달 학사일정이 없습니다." : "") : ""}</div>`;
  }

  const school = getSchool();
  if (!school) setStatus("급식 창(🍴)에서 학교를 고르면 학사일정과 휴업일이 표시되고, 휴업일에는 종이 울리지 않습니다.");
  else if (mc?.partial) setStatus(`${school.name} 학사일정 · 인증키 없이 받아 일부 일정이 빠졌을 수 있어요 (급식 창 → 학교 검색 → NEIS 인증키)`, true);
  else if (mc) setStatus(`${school.name} 학사일정 (NEIS)`);
}

declare global {
  interface Window {
    schoolCalendar: {
      refreshToday: (force?: boolean) => Promise<void>; holidayOn: (d: Date) => string | null; ringToday: () => void;
      renderMonth: (d: Date) => void; eventsOn: (d: Date) => SchoolEvent[];
    }
  }
}
window.schoolCalendar = { refreshToday, holidayOn, ringToday, renderMonth, eventsOn };
