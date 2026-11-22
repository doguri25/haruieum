// ============================================================
// 저장소 (3단계)
//
// 앱의 모든 저장은 이 파일을 통해서만 합니다.
//  - 읽기/쓰기는 동기(메모리)로 동작해 기존 코드가 localStorage 처럼 쓸 수 있고,
//  - 실제 파일 저장은 종류(bucket)별로 나눠 0.4초 디바운스 후 Rust 명령으로 보냅니다.
//    (Rust 쪽 save_store 가 tmp → 교체 방식으로 원자적으로 쓰고 .bak 을 남깁니다)
//  - Tauri 밖(그냥 브라우저, npm run dev)에서는 localStorage 로 동작합니다.
//
// bucket 나누기: 키 입력 한 번에 판서(board.json)만 다시 쓰고 설정은 건드리지 않게
//   board        smartBoardCurrentNotepad     (판서 HTML, 사진 포함)
//   notice       smartBoardCurrentNotice      (알림장 HTML)
//   saved-boards smartBoardSavedData          (보관한 판서 목록)
//   popup-note   smartBoardDraftPopupNote     (팝업 노트 초안), sb.widget.memo (첫 화면 메모)
//   settings     그 밖의 전부 (시간표, 알람, 테마, 팝업 위치 ...)
// ============================================================
import { invoke } from "@tauri-apps/api/core";

type Bucket = "settings" | "board" | "notice" | "saved-boards" | "popup-note";
const BUCKETS: Bucket[] = ["settings", "board", "notice", "saved-boards", "popup-note"];
const KEY_TO_BUCKET: Record<string, Bucket> = {
  smartBoardCurrentNotepad: "board",
  smartBoardCurrentNotice: "notice",
  smartBoardSavedData: "saved-boards",
  smartBoardDraftPopupNote: "popup-note",
  "sb.widget.memo": "popup-note",           // 3.1.0 첫 화면 메모 위젯 (글자 하나 칠 때 설정 파일을 다시 쓰지 않게)
};
const bucketOf = (key: string): Bucket => KEY_TO_BUCKET[key] ?? "settings";

const DEBOUNCE_MS = 400;
export const isTauri = () => "__TAURI_INTERNALS__" in window;

class AppStorage {
  private data = new Map<string, string>();
  private dirty = new Set<Bucket>();
  private timers = new Map<Bucket, number>();
  private saving = new Map<Bucket, Promise<void>>();
  private ready = false;
  /** 백업에서 복원하는 동안: 메모리의 옛 내용을 파일에 쓰지 않음 (복원한 파일을 덮어쓰지 않게) */
  private suspended = false;
  /** 2.8.1: 원본도 .bak 도 읽지 못한 저장소. 이번 실행에서는 저장하지 않음 (읽지 못한 진짜 파일을 덮어쓰지 않게) */
  private blocked = new Set<Bucket>();
  /** 저장 파일을 읽다 문제가 있었음 → '처음 실행'으로 보고 예전 데이터를 가져와 덮어쓰지 않게 */
  private loadProblem = false;
  /** 저장 실패 시 화면에 알리기 위한 콜백 (main.ts 가 설정) */
  onError: ((msg: string) => void) | null = null;

  // ---------- 시작 ----------
  async init() {
    if (this.ready) return;
    if (!isTauri()) {
      // 브라우저 폴백: localStorage 그대로 사용
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        this.data.set(k, localStorage.getItem(k) ?? "");
      }
      this.ready = true;
      return;
    }

    let loadedAny = false;
    for (const b of BUCKETS) {
      const obj = await this.loadBucket(b);
      if (obj) {
        loadedAny = true;
        for (const [k, v] of Object.entries(obj)) this.data.set(k, String(v));
      }
    }

    // 처음 실행이면 예전 데이터를 가져옴: v1(일렉트론) 파일 → 없으면 브라우저 localStorage
    // (파일을 읽지 못한 경우는 처음 실행이 아님 — 가져오기로 덮어쓰지 않음)
    if (!loadedAny && !this.loadProblem) {
      let imported = 0;
      try {
        const v1 = await invoke<string>("load_v1_data");
        if (v1 && v1.trim()) {
          const obj = JSON.parse(v1) as Record<string, string>;
          for (const [k, v] of Object.entries(obj)) { this.data.set(k, String(v)); imported++; }
          console.info(`v1 데이터 ${imported}개 항목을 가져왔습니다.`);
        }
      } catch (e) { console.warn("v1 데이터 가져오기 실패(무시):", e); }
      if (imported === 0) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          if (k.startsWith("smartBoard") || k.startsWith("sb")) { this.data.set(k, localStorage.getItem(k) ?? ""); imported++; }
        }
        if (imported) console.info(`localStorage 에서 ${imported}개 항목을 가져왔습니다.`);
      }
      if (imported) { BUCKETS.forEach((b) => this.dirty.add(b)); await this.flushAll(); }
    }
    this.ready = true;
    // .bak 에서 복구한 저장소는 바로 본 파일에 다시 씀 (2.8.1)
    if (this.dirty.size) void this.flushAll();
  }

  private async loadBucket(b: Bucket): Promise<Record<string, string> | null> {
    const parse = (txt: string) => {
      if (!txt || !txt.trim()) return null;
      const obj = JSON.parse(txt);
      if (!obj || typeof obj !== "object") throw new Error("형식 오류");
      return obj as Record<string, string>;
    };
    // 2.8.1: '읽지 못함'(잠김·권한 등)과 '내용이 깨짐'을 나눠 처리
    let text: string | null = null, readErr: unknown = null;
    try { text = await invoke<string>("load_store", { name: b }); } catch (e) { readErr = e; }
    if (text !== null) {
      try { return parse(text); } catch (e) { console.warn(`${b}.json 이 손상되어 백업을 시도합니다:`, e); }
    } else {
      console.warn(`${b}.json 을 읽을 수 없어 백업을 시도합니다:`, readErr);
    }
    try {
      const bak = parse(await invoke<string>("load_store_backup", { name: b }));
      if (bak) { console.warn(`${b}.json.bak 에서 복구했습니다.`); this.dirty.add(b); return bak; }
    } catch (e) { console.error(`${b} 백업도 읽을 수 없습니다:`, e); }
    this.loadProblem = true;
    if (readErr) {
      // 파일은 있는데 읽지 못함 → 빈 내용으로 저장하면 진짜 파일이 사라지므로 이번 실행에서는 저장하지 않음
      this.blocked.add(b);
      this.onError?.(`${b} 저장 파일을 읽을 수 없습니다. 원본을 지키려고 이번 실행에서는 이 항목을 저장하지 않습니다. 앱을 다시 시작해 주세요.`);
      return null;
    }
    // 내용이 깨졌고 백업도 없음 → 깨진 파일은 <이름>.corrupt-<시각>.json 으로 남겨 두고 빈 상태로 시작
    // (2.8.2: 시각을 붙여 깨질 때마다 따로 남김 — 예전엔 처음 한 번만 남아 두 번째 원본은 사라졌음)
    const d = new Date(), p2 = (n: number) => String(n).padStart(2, "0");
    const tag = `corrupt-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    try { await invoke("snapshot_store_once", { name: b, tag }); } catch { /* 남기지 못해도 계속 */ }
    this.onError?.(`${b} 저장 파일이 손상되어 비워진 상태로 시작합니다. (원본은 ${b}.${tag}.json 으로 남겨 두었습니다)`);
    return null;
  }

  // ---------- localStorage 와 같은 동기 API ----------
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: unknown) {
    const v = String(value);
    if (this.data.get(key) === v) return;
    this.data.set(key, v);
    this.markDirty(bucketOf(key));
  }
  removeItem(key: string) {
    if (!this.data.has(key)) return;
    this.data.delete(key);
    this.markDirty(bucketOf(key));
  }
  key(i: number) { return Array.from(this.data.keys())[i] ?? null; }
  get length() { return this.data.size; }

  // ---------- 파일 저장 ----------
  private markDirty(b: Bucket) {
    if (this.suspended) return;
    if (!isTauri()) {
      // 브라우저 폴백: 즉시 localStorage 반영
      for (const [k, v] of this.data) if (bucketOf(k) === b) localStorage.setItem(k, v);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)!;
        if (bucketOf(k) === b && !this.data.has(k)) localStorage.removeItem(k);
      }
      return;
    }
    this.dirty.add(b);
    window.clearTimeout(this.timers.get(b));
    this.timers.set(b, window.setTimeout(() => void this.flush(b), DEBOUNCE_MS));
  }

  private serialize(b: Bucket) {
    const obj: Record<string, string> = {};
    for (const [k, v] of this.data) if (bucketOf(k) === b) obj[k] = v;
    return JSON.stringify(obj);
  }

  async flush(b: Bucket): Promise<void> {
    if (this.suspended || this.blocked.has(b) || !isTauri() || !this.dirty.has(b)) return;
    // 이미 저장 중이면 끝난 뒤 다시
    const prev = this.saving.get(b);
    if (prev) { await prev; return this.flush(b); }
    this.dirty.delete(b);
    window.clearTimeout(this.timers.get(b));
    const p = invoke<void>("save_store", { name: b, content: this.serialize(b) })
      .catch((e) => {
        console.error(`${b} 저장 실패:`, e);
        this.dirty.add(b); // 다음 기회에 다시 시도
        this.onError?.(`저장에 실패했습니다 (${b}): ${e}`);
      })
      .finally(() => this.saving.delete(b));
    this.saving.set(b, p);
    await p;
  }

  async flushAll() {
    await Promise.all(BUCKETS.map((b) => this.flush(b)));
  }

  hasUnsaved() { return this.dirty.size > 0 || this.saving.size > 0; }
  /** 시작할 때 읽지 못한·깨진 저장소가 있었거나 복원 중 → 이때는 '안 쓰는 사진 정리'를 하지 않음 (2.8.2) */
  get unsafeForCleanup() { return this.loadProblem || this.blocked.size > 0 || this.suspended; }

  /** 파일 저장을 멈춤 (복원 직전). 이후 화면을 다시 읽을 때까지 아무것도 쓰지 않음 */
  suspend() {
    this.suspended = true;
    for (const t of this.timers.values()) window.clearTimeout(t);
    this.timers.clear();
    this.dirty.clear();
  }
  /** rewrite: 복원이 중간에 실패했을 때 — 메모리에 있는 (복원 전) 내용을 모두 다시 써서 파일을 되살림 */
  resume(rewrite = false) {
    this.suspended = false;
    if (rewrite && isTauri()) { BUCKETS.forEach((b) => this.dirty.add(b)); void this.flushAll(); }
  }
}

export const storage = new AppStorage();
