// ============================================================
// 데이터 백업·복원 (2.7.0) — 환경설정 → 데이터 백업·복원
//  - 백업: 시간표·알람·판서·알림·보관 기록·사진·알람 소리·설정을 .zip 파일 하나로 (Rust export_backup)
//  - 복원: 고른 백업 파일로 바꾸고 화면을 다시 읽음 (Rust import_backup).
//          바꾸기 전 지금 데이터는 <앱 데이터>/backups/before-restore-<시각>.zip 으로 자동 보관
//  교실이나 PC 를 옮길 때: 예전 PC 에서 '백업 파일 만들기' → USB 등으로 옮겨 → 새 PC 에서 '백업에서 복원'
// ============================================================
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { isTauri, storage } from "./storage";

const pad = (n: number) => String(n).padStart(2, "0");
function stamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
const FILTERS = [{ name: "하루이음 백업", extensions: ["zip"] }];

/** dest 경로로 백업 (저장 안 된 것을 먼저 씀). 담은 파일 수 */
export async function exportBackupTo(dest: string): Promise<number> {
  await storage.flushAll();
  return invoke<number>("export_backup", { dest, stamp: stamp() });
}

/** src 백업으로 복원하고 화면을 다시 읽음. 복원 전 자동 백업 경로를 돌려줌(다시 읽기 전에) */
export async function importBackupFrom(src: string, reload = true): Promise<string> {
  await storage.flushAll();
  storage.suspend(); // 복원한 파일을 메모리의 옛 내용이 덮어쓰지 않게
  let before: string;
  try {
    before = await invoke<string>("import_backup", { src, stamp: stamp() });
  } catch (e) {
    storage.resume();
    throw e;
  }
  if (reload) window.setTimeout(() => location.reload(), 50);
  return before;
}

async function exportDialog() {
  if (!isTauri()) { alert("백업은 앱에서만 할 수 있습니다."); return; }
  const d = new Date();
  const dest = await save({ title: "백업 파일 저장", defaultPath: `하루이음-백업-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`, filters: FILTERS });
  if (!dest) return;
  try {
    const n = await exportBackupTo(dest);
    alert(`백업 파일을 만들었습니다. (${n}개 항목)\n${dest}\n\n새 PC 에서는 환경설정 → '백업에서 복원'으로 이 파일을 고르세요.`);
  } catch (e) {
    alert("백업 파일을 만들지 못했습니다.\n" + e);
  }
}

async function importDialog() {
  if (!isTauri()) { alert("복원은 앱에서만 할 수 있습니다."); return; }
  const src = await open({ title: "복원할 백업 파일 선택", multiple: false, directory: false, filters: FILTERS });
  if (!src || typeof src !== "string") return;
  if (!confirm("고른 백업 파일의 내용으로 지금 데이터(시간표·판서·알림·보관 기록·설정)를 바꿉니다.\n지금 데이터는 앱 데이터 폴더의 backups 에 자동으로 보관됩니다.\n\n계속할까요?")) return;
  try {
    await importBackupFrom(src);
  } catch (e) {
    // 파일 검사에서 걸리면(다른 파일·손상) 아무것도 바뀌지 않음. 드물게 쓰는 도중 실패하면 복원 전 데이터가 backups 폴더에 있음
    alert("복원하지 못했습니다.\n" + e);
  }
}

declare global {
  interface Window {
    dataBackup: { exportDialog: () => Promise<void>; importDialog: () => Promise<void>; exportTo: typeof exportBackupTo; importFrom: typeof importBackupFrom };
  }
}
window.dataBackup = { exportDialog, importDialog, exportTo: exportBackupTo, importFrom: importBackupFrom };
