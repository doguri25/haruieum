// ============================================================
// NEIS 교육정보 개방 포털 (open.neis.go.kr) 공용 (2.7.0)
//  - 급식(mealServiceDietInfo)·학교 검색(schoolInfo)·학사일정(SchoolSchedule)
//  - 인증키(선택): 없으면 한 번에 5건까지만 받을 수 있음. 넣으면 한 번에 1000건까지
//    (open.neis.go.kr 회원가입 → 인증키 신청, 무료·즉시 발급). 급식 창의 학교 검색 칸 아래에서 입력
//  저장 키: smartBoardSchool (학교), smartBoardNeisKey (인증키)
// ============================================================
import { httpGetJson } from "./net";
import { storage } from "./storage";

export interface School { code: string; officeCode: string; name: string }

export function getSchool(): School | null {
  try { return JSON.parse(storage.getItem("smartBoardSchool") || "null"); } catch { return null; }
}
export function getNeisKey(): string { return (storage.getItem("smartBoardNeisKey") || "").trim(); }
export function setNeisKey(key: string) { storage.setItem("smartBoardNeisKey", key.trim()); }

/** NEIS 목록 조회. 자료가 없으면 빈 배열 (NEIS 는 이때 INFO-200 을 돌려줌) */
export async function neisRows<T = Record<string, string>>(service: string, params: Record<string, string>): Promise<T[]> {
  const q = new URLSearchParams({ Type: "json", pIndex: "1", ...params });
  const key = getNeisKey();
  if (key) { q.set("KEY", key); q.set("pSize", "1000"); }
  const data = await httpGetJson<any>(`https://open.neis.go.kr/hub/${service}?${q}`);
  const block = data?.[service];
  if (!Array.isArray(block)) {
    if (data?.RESULT?.CODE === "INFO-200") return [];
    throw new Error(data?.RESULT?.MESSAGE || "NEIS 응답을 해석할 수 없습니다");
  }
  return (block[1]?.row ?? []) as T[];
}

export const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
export const fromYmd = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
export const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
