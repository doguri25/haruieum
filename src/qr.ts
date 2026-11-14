// ============================================================
// QR 코드 만들기 (2.8.0) — 도구 메뉴의 'QR'
//  링크나 글을 넣으면 큰 QR 코드를 보여 줌 → 학생 태블릿 카메라로 찍으면 바로 열림
//  '크게 보기'(화면 가득), '판서에 넣기'(판서·알림에 사진으로) 가능. 마지막 내용은 기억 (smartBoardQrText)
//  qrcode-generator(MIT). 한글도 되도록 UTF-8 로 바꿔 넣음
// ============================================================
import qrcode from "qrcode-generator";
import { storage } from "./storage";
import { openImageViewer } from "./image-viewer";

qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s));

const el = (id: string) => document.getElementById(id);
const MARGIN = 2; // QR 둘레의 흰 칸 (찍을 때 인식이 잘 되도록)

/** text 로 QR 을 만듦. 너무 길면 null */
function make(text: string) {
  try {
    const qr = qrcode(0, "M");
    qr.addData(text, "Byte");
    qr.make();
    return qr;
  } catch {
    return null;
  }
}

/** 흰 바탕 + 검은 칸의 PNG (한 칸 cell 픽셀) */
function toPng(qr: ReturnType<typeof qrcode>, cell: number): Promise<Blob> {
  const n = qr.getModuleCount(), size = (n + MARGIN * 2) * cell;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + MARGIN) * cell, (r + MARGIN) * cell, cell, cell);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("QR 이미지 만들기 실패"))), "image/png"));
}

let current: ReturnType<typeof qrcode> | null = null;
let timer = 0;

function render() {
  const input = el("qr-input") as HTMLInputElement | null;
  const out = el("qr-output"), msg = el("qr-message");
  if (!input || !out) return;
  const text = input.value.trim();
  storage.setItem("smartBoardQrText", input.value);
  current = text ? make(text) : null;
  (el("qr-actions") as HTMLElement | null)?.classList.toggle("invisible", !current);
  if (!text) { out.innerHTML = `<div class="text-slate-300 font-bold text-xl">링크나 글을 입력하세요</div>`; if (msg) msg.textContent = ""; return; }
  if (!current) { out.innerHTML = `<div class="text-red-500 font-bold text-xl">글자가 너무 길어 QR 코드를 만들 수 없습니다</div>`; if (msg) msg.textContent = ""; return; }
  // margin 은 픽셀 단위 → 칸 크기(8)를 곱해 2칸 (2.8.1: 예전엔 2px 라 어두운 테마에서 인식이 잘 안 됐음)
  out.innerHTML = current.createSvgTag({ cellSize: 8, margin: MARGIN * 8, scalable: true });
  const svg = out.querySelector("svg");
  if (svg) { svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%"); svg.setAttribute("shape-rendering", "crispEdges"); }
  if (msg) msg.textContent = /^https?:\/\//i.test(text) ? "학생 태블릿의 카메라로 찍으면 바로 열립니다" : "카메라로 찍으면 이 글이 보입니다";
}

export function openQr() {
  const input = el("qr-input") as HTMLInputElement | null;
  if (input && !input.value) input.value = storage.getItem("smartBoardQrText") || "";
  render();
  el("modal-qr")?.classList.add("active");
  setTimeout(() => { input?.focus(); input?.select(); }, 100);
}
export function onQrInput() { window.clearTimeout(timer); timer = window.setTimeout(render, 150); }

export async function showQrLarge() {
  if (!current) return;
  openImageViewer(URL.createObjectURL(await toPng(current, 24)));
}

export async function insertQrToBoard() {
  if (!current) return;
  const blob = await toPng(current, 10);
  (window as any).closeModal?.("modal-qr");
  await window.boardEditor.insertPreparedImage(blob, 280, "QR 코드");
}

declare global {
  interface Window { qr: { open: typeof openQr; onInput: typeof onQrInput; showLarge: typeof showQrLarge; insertToBoard: typeof insertQrToBoard } }
}
window.qr = { open: openQr, onInput: onQrInput, showLarge: showQrLarge, insertToBoard: insertQrToBoard };
