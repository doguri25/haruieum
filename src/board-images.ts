// ============================================================
// 판서·알림 사진 저장 (2.6.0)
//
// 예전: 사진을 base64 글자로 판서 HTML 안에 통째로 넣음 → 보관할 때마다 저장 파일이 커지고 같은 사진이 계속 복사됨
// 지금: 사진은 앱 데이터 폴더 data/images/<내용 해시>.<확장자> 에 한 번만 저장(Rust save_image),
//       HTML 에는 <img src="sbimg 주소" data-file="<파일 이름>"> 만 남김.
//       src 는 운영체제마다 모양이 달라서(윈도우 https://sbimg.localhost/…), 읽을 때 data-file 로 다시 만듦.
//  - 시작할 때 예전 base64 사진을 파일로 옮김 (옮기기 전 원본은 <저장소>.before-images.json 으로 한 번 보관)
//  - 시작하고 조금 뒤, 어디에서도 쓰지 않는 사진 파일 중 7일 지난 것을 지움
//  - Tauri 밖(브라우저 개발 모드)에서는 예전처럼 data URL 을 씀
// ============================================================
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { isTauri, storage } from "./storage";

export const IMAGE_FILE_RE = /^[0-9a-f]{32}\.(?:jpg|png|gif|webp)$/;
const IMAGE_FILE_IN_TEXT = /[0-9a-f]{32}\.(?:jpg|png|gif|webp)/g;
const EXT_OF: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
const UNUSED_IMAGE_GRACE_DAYS = 7;

export type StoredImage = { src: string; file: string | null };

/** 사진 파일 이름 → 웹뷰에서 쓸 주소 */
export function imageUrl(file: string): string {
  return convertFileSrc(file, "sbimg");
}

/** data-file 이 있으면 지금 운영체제에 맞는 주소, 없으면 저장된 src 그대로 */
export function resolveImageSrc(file: string | null | undefined, storedSrc: string | null): string | null {
  if (file && IMAGE_FILE_RE.test(file) && isTauri()) return imageUrl(file);
  return storedSrc;
}

/** 보관 기록 보기처럼 HTML 을 그대로 넣은 곳의 사진 주소를 고침 */
export function resolveImagesIn(root: ParentNode) {
  root.querySelectorAll<HTMLImageElement>("img[data-file]").forEach((img) => {
    const src = resolveImageSrc(img.getAttribute("data-file"), img.getAttribute("src"));
    if (src && img.getAttribute("src") !== src) img.setAttribute("src", src);
  });
}

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** 사진을 저장하고 편집기에 넣을 src·파일 이름을 돌려줌 */
export async function storeImage(blob: Blob): Promise<StoredImage> {
  if (!isTauri()) return { src: await blobToDataUrl(blob), file: null };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const file = toHex(await crypto.subtle.digest("SHA-256", bytes)).slice(0, 32) + "." + (EXT_OF[blob.type] ?? "jpg");
  await invoke("save_image", bytes, { headers: { "x-image-name": file } });
  return { src: imageUrl(file), file };
}

/** 편집기 사진의 원본 바이트 (회전 등 픽셀을 다시 그릴 때) */
export async function loadImageBlob(file: string | null, src: string): Promise<Blob> {
  if (file && IMAGE_FILE_RE.test(file) && isTauri()) {
    const buf = await invoke<ArrayBuffer>("read_image", { name: file });
    const ext = file.split(".").pop()!;
    const type = Object.keys(EXT_OF).find((t) => EXT_OF[t] === ext) ?? "image/jpeg";
    return new Blob([buf], { type });
  }
  return (await fetch(src)).blob();
}

// ---------- 예전 base64 사진 → 파일 ----------
const DATA_IMG_SRC = /src="(data:image\/(?:png|jpeg|gif|webp);base64,[^"]+)"/g;
const HTML_KEYS = ["smartBoardCurrentNotepad", "smartBoardCurrentNotice"] as const;
const SAVED_KEY = "smartBoardSavedData";
const BUCKET_OF_KEY: Record<string, string> = {
  smartBoardCurrentNotepad: "board",
  smartBoardCurrentNotice: "notice",
  [SAVED_KEY]: "saved-boards",
};

async function convertHtml(html: string, cache: Map<string, StoredImage | null>): Promise<string> {
  const urls = new Set<string>();
  for (const m of html.matchAll(DATA_IMG_SRC)) urls.add(m[1]);
  for (const url of urls) {
    if (cache.has(url)) continue;
    try {
      cache.set(url, await storeImage(await (await fetch(url)).blob()));
    } catch (e) {
      console.warn("사진을 파일로 옮기지 못해 그대로 둡니다:", e);
      cache.set(url, null);
    }
  }
  return html.replace(DATA_IMG_SRC, (whole, url: string) => {
    const s = cache.get(url);
    return s?.file ? `src="${s.src}" data-file="${s.file}"` : whole;
  });
}

/** 저장 내용(판서·알림·보관 목록)에 남은 base64 사진을 파일로 옮김. 앱 시작 때 편집기를 띄우기 전에 한 번 */
export async function migrateStoredImages(): Promise<number> {
  if (!isTauri()) return 0;
  const keys = [...HTML_KEYS, SAVED_KEY].filter((k) => (storage.getItem(k) ?? "").includes("data:image/"));
  if (keys.length === 0) return 0;
  // 만일을 위해 옮기기 전 저장 파일을 한 번 남겨 둠
  for (const k of keys) {
    try { await invoke("snapshot_store_once", { name: BUCKET_OF_KEY[k], tag: "before-images" }); }
    catch (e) { console.warn("사진 옮기기 전 보관 실패 — 옮기지 않습니다:", e); return 0; }
  }
  const cache = new Map<string, StoredImage | null>();
  for (const k of HTML_KEYS) {
    const html = storage.getItem(k);
    if (html?.includes("data:image/")) storage.setItem(k, await convertHtml(html, cache));
  }
  const savedRaw = storage.getItem(SAVED_KEY);
  if (savedRaw?.includes("data:image/")) {
    try {
      const saved = JSON.parse(savedRaw) as Array<{ content?: string }>;
      for (const b of saved) if (typeof b.content === "string" && b.content.includes("data:image/")) b.content = await convertHtml(b.content, cache);
      storage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch (e) { console.warn("보관 목록의 사진을 옮기지 못했습니다:", e); }
  }
  await storage.flushAll();
  const moved = [...cache.values()].filter((s) => s?.file).length;
  if (moved) console.info(`예전 사진 ${moved}장을 파일로 옮겼습니다.`);
  return moved;
}

/** 어떤 저장 내용에도 없는 사진 파일 중 오래된 것을 지움 */
export async function cleanupUnusedImages(): Promise<number> {
  if (!isTauri()) return 0;
  const keep = new Set<string>();
  for (let i = 0; i < storage.length; i++) {
    const v = storage.getItem(storage.key(i) ?? "");
    if (v) for (const m of v.matchAll(IMAGE_FILE_IN_TEXT)) keep.add(m[0]);
  }
  const removed = await invoke<number>("cleanup_images", { keep: [...keep], graceDays: UNUSED_IMAGE_GRACE_DAYS });
  if (removed) console.info(`쓰지 않는 사진 파일 ${removed}개를 정리했습니다.`);
  return removed;
}

declare global {
  interface Window { boardImages: { resolveImagesIn: typeof resolveImagesIn } }
}
window.boardImages = { resolveImagesIn };
