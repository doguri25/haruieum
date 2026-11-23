// ============================================================
// 판서 편집기 (4단계) — TipTap(ProseMirror) 기반
//  - 선택한 글자에만 글꼴·크기·색이 적용됨 (선택이 없으면 기본 글꼴·크기 변경)
//  - 사진: 모서리 손잡이로 크기 조절, 정렬, 드래그 앤 드롭·붙여넣기 삽입
//  - 표 삽입, 정렬, 굵게/기울임, 되돌리기
//  - 저장 형식은 HTML (v1 판서·보관 목록과 호환)
// legacy-app.js 는 window.boardEditor 로 이 API 를 씁니다.
// ============================================================
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { loadImageBlob, resolveImageSrc, storeImage } from "./board-images";
import { openImageViewer } from "./image-viewer";

// --- 사진 노드: 너비/높이(px)·정렬·파일 이름 속성 추가 ------------------------------
const BoardImage = Image.extend({
  addAttributes() {
    const parsePx = (el: HTMLElement, attr: "width" | "height") => {
      const a = el.getAttribute(attr);
      if (a && /^\d+/.test(a)) return parseInt(a, 10);
      const s = el.style[attr];
      if (s && s.endsWith("px")) return parseInt(s, 10);
      return null;
    };
    return {
      ...this.parent?.(),
      // 2.6.0: 사진은 data/images 의 파일. src 는 운영체제마다 모양이 달라 읽을 때 data-file 로 다시 만듦
      src: {
        default: null,
        parseHTML: (el: HTMLElement) => resolveImageSrc(el.getAttribute("data-file"), el.getAttribute("src")),
      },
      file: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-file"),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.file ? { "data-file": attrs.file } : {}),
      },
      width: { default: null, parseHTML: (el: HTMLElement) => parsePx(el, "width") },
      height: { default: null, parseHTML: (el: HTMLElement) => parsePx(el, "height") },
      align: {
        default: "center",
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-align") || (el.parentElement?.style.textAlign as string) || "center",
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-align": attrs.align }),
      },
    };
  },
  // TipTap 의 크기 조절 노드뷰는 처음 그릴 때만 width/height 를 화면에 적용하고, 그 뒤 속성이 바뀌어도 그대로 둠.
  // 그래서 ±10% 버튼(그리고 회전)이 저장값만 바꾸고 화면의 사진 크기는 그대로였음 → 바뀔 때마다 맞춰 줌
  addNodeView() {
    const make = this.parent?.();
    if (!make) return null;
    return (props) => {
      const view = make(props) as ReturnType<typeof make> & { element?: HTMLElement };
      const update = view.update?.bind(view);
      view.update = (node, decorations, innerDecorations) => {
        const ok = update ? update(node, decorations, innerDecorations) : true;
        const img = view.element;
        if (ok && img && !img.closest("[data-resize-state='true']")) {
          img.style.width = node.attrs.width ? `${node.attrs.width}px` : "";
          img.style.height = node.attrs.height ? `${node.attrs.height}px` : "";
        }
        return ok;
      };
      return view;
    };
  },
});

const MAX_IMAGE_WIDTH = 1024;

// 윈도우에 HEIF 확장이 없으면 .heic 파일의 형식(type)이 빈 문자열로 오므로 확장자도 함께 봄
const IMAGE_EXT = /\.(jpe?g|jfif|png|gif|webp|bmp|avif|svg|heic|heif)$/i;
const isImageFile = (f: File) => f.type.startsWith("image/") || IMAGE_EXT.test(f.name);
const isGif = (f: File) => f.type === "image/gif" || /\.gif$/i.test(f.name);
/** 이보다 큰 GIF 는 움직임 없이 줄여서 넣음 (저장 파일이 너무 커지지 않게) */
const MAX_GIF_BYTES = 10 * 1024 * 1024;
const isHeicName = (f: File) => /^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
/** 이름은 .jpg 여도 내용이 HEIC 인 경우가 있어 파일 머리(ftyp 상자)도 확인 */
async function sniffHeic(f: Blob): Promise<boolean> {
  const head = new Uint8Array(await f.slice(0, 12).arrayBuffer());
  const ascii = String.fromCharCode(...head);
  return ascii.slice(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/.test(ascii.slice(8, 12));
}
/** 아이폰 사진(HEIC) → JPEG. 변환기(약 3MB)는 처음 필요할 때만 불러옴 */
async function heicToJpeg(f: Blob): Promise<Blob> {
  const { heicTo } = await import("heic-to");
  return heicTo({ blob: f, type: "image/jpeg", quality: 0.9 });
}
const HEIC_MSG =
  "아이폰 사진(HEIC 형식)을 변환하지 못했습니다.\n" +
  "JPG로 바꿔서 넣어 주세요. (아이폰: 설정 → 카메라 → 포맷 → '높은 호환성'으로 찍으면 처음부터 JPG로 저장됩니다)";
const SWITCHED_MSG = "사진을 준비하는 동안 판서·알림 화면이 바뀌어 넣지 않았습니다. 다시 넣어 주세요.";
const BROKEN_MSG = "사진을 열 수 없습니다. 파일이 손상됐거나 지원하지 않는 형식입니다. (JPG·PNG·GIF·WEBP·HEIC 사진을 넣어 주세요)";

/** blob → 다 읽힌 <img>. 실패하면 null */
function decodeImage(blob: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
/** 투명한 부분이 하나라도 있는지 (있으면 JPEG 로 바꾸면 검게 변하므로 PNG 로 둠) */
function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("사진 변환 실패"))), type, quality));
}
/** 시간이 걸리는 사진 처리(아이폰 사진 변환 등) 중 화면 아래 안내. 0.3초 안에 끝나면 안 보임 */
function busyNotice(text: string): () => void {
  const t = window.setTimeout(() => {
    let el = document.getElementById("sb-busy");
    if (!el) { el = document.createElement("div"); el.id = "sb-busy"; document.body.appendChild(el); }
    el.textContent = text;
    el.style.display = "block";
  }, 300);
  return () => {
    window.clearTimeout(t);
    const el = document.getElementById("sb-busy");
    if (el) el.style.display = "none";
  };
}

type UpdateListener = () => void;

class BoardEditor {
  private editor!: Editor;
  private container!: HTMLElement;
  private listeners: UpdateListener[] = [];
  private toolbar: HTMLElement | null = null;
  /** 마지막으로 잡았던 글자 선택 범위. 글꼴 선택 상자 등을 누르면 브라우저가 선택을 풀어 버리는 경우가
   *  있어, 그때 이 범위에 서식을 적용한다. 편집기 안을 클릭하거나 글자를 치면 지워진다. */
  private lastRange: { from: number; to: number } | null = null;
  private lastEditorInteraction = 0;
  /** 내용을 통째로 바꿀 때마다 1씩 늘어남. 사진 처리(변환·저장)를 기다리는 동안 판서↔알림이 바뀌었는지 확인용 */
  private docGen = 0;

  init(container: HTMLElement) {
    this.container = container;
    this.toolbar = document.getElementById("image-action-toolbar");
    // 3.1.1: TipTap 의 사진 크기 조절은 손가락(touchstart·touchmove)으로 시작해도 끝은 mouseup 만 기다림.
    // 터치는 mouseup 이 오지 않아 손을 떼도 조절이 끝나지 않고 크기도 저장되지 않았음 → 손을 떼면 mouseup 을 대신 보냄
    const endTouchResize = () => {
      if (document.querySelector("[data-resize-state='true']")) document.dispatchEvent(new MouseEvent("mouseup"));
    };
    document.addEventListener("touchend", endTouchResize, true);
    document.addEventListener("touchcancel", endTouchResize, true);
    this.editor = new Editor({
      element: container,
      extensions: [
        StarterKit.configure({ link: false, code: false, codeBlock: false }),
        TextStyleKit,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TableKit.configure({ table: { resizable: true } }),
        BoardImage.configure({
          allowBase64: true,
          resize: {
            enabled: true,
            directions: ["top-left", "top-right", "bottom-left", "bottom-right"],
            minWidth: 40,
            minHeight: 40,
            alwaysPreserveAspectRatio: true,
          },
        }),
        Placeholder.configure({ placeholder: "이곳에 내용을 입력하거나 필기하세요..." }),
      ],
      content: "",
      editorProps: {
        attributes: { class: "sb-rich" },
        handleDrop: (_view, event, _slice, moved) => {
          const dropped = Array.from(event.dataTransfer?.files ?? []);
          if (moved || dropped.length === 0) return false;
          event.preventDefault();
          this.insertDroppedFiles(dropped);
          return true;
        },
        handlePaste: (_view, event) => {
          // 2.8.1: 엑셀·파워포인트 등은 표(HTML)·글자와 함께 '그림'도 클립보드에 넣음. 예전엔 그림이 있으면 무조건 그림으로 붙여서
          // 엑셀 표를 복사해 붙이면 고칠 수 없는 사진이 됐음 → HTML 에 글자가 있으면 보통 붙여넣기(표·글자)로
          const html = event.clipboardData?.getData("text/html") || "";
          // 2.8.2: 본문(body)의 글자만 셈 — 워드는 <head> 에 문서 설정(XML)이 들어 있어, 예전 방식은 그림만 복사해도 '글자 있음'으로 보고
          // 열 수 없는 file:/// 그림을 넣었음
          const bodyText = html ? (new DOMParser().parseFromString(html, "text/html").body?.textContent || "").replace(/\u00a0/g, " ").trim() : "";
          if (bodyText) return false;
          const items = Array.from(event.clipboardData?.items ?? []);
          const files = items.filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile()).filter((f): f is File => !!f);
          if (files.length === 0) return false;
          event.preventDefault();
          files.forEach((f) => void this.insertImageFile(f));
          return true;
        },
      },
      onUpdate: () => { this.listeners.forEach((cb) => cb()); this.trackSelection(); },
      onSelectionUpdate: () => { this.trackSelection(); this.updateImageToolbar(); },
      onBlur: () => setTimeout(() => this.updateImageToolbar(), 150),
    });

    // 사진 끌어다 놓기. 윈도우 앱에서는 tauri.conf.json 의 dragDropEnabled:false 가 있어야 이 이벤트들이 옴
    // (기본값 true 면 Tauri 가 파일 놓기를 가로채서 아무 반응이 없었음)
    const isFileDrag = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    container.addEventListener("dragover", (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault(); // 글자 영역 바깥 여백에 놓아도 받음
      container.classList.add("dragover");
    });
    container.addEventListener("dragleave", () => container.classList.remove("dragover"));
    container.addEventListener("drop", (e) => {
      container.classList.remove("dragover");
      if (e.defaultPrevented || !isFileDrag(e)) return; // 글자 영역에 놓은 것은 handleDrop 이 이미 처리
      e.preventDefault();
      this.insertDroppedFiles(Array.from(e.dataTransfer!.files));
    });
    // 편집기 밖에 파일을 떨어뜨리면 웹뷰가 그 파일을 열면서 앱 화면이 사라짐 → 막음
    window.addEventListener("dragover", (e) => {
      if (!isFileDrag(e) || e.defaultPrevented) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "none";
    });
    window.addEventListener("drop", (e) => { if (isFileDrag(e)) e.preventDefault(); });
    // 스크롤하면 사진 도구 위치 갱신
    container.addEventListener("scroll", () => this.updateImageToolbar());
    // 편집기 안에서의 직접 조작(클릭·키 입력)만 기억한 선택 범위를 지우게 함
    const mark = () => { this.lastEditorInteraction = Date.now(); };
    this.editor.view.dom.addEventListener("mousedown", mark, true);
    this.editor.view.dom.addEventListener("keydown", mark, true);
    // 판서 도구 모음의 버튼은 눌러도 편집기 포커스(=선택)를 뺏지 않게
    document.getElementById("notepad-toolbar")?.querySelectorAll("button").forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));
    document.getElementById("image-action-toolbar")?.querySelectorAll("button").forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));
  }

  private trackSelection() {
    const sel = this.editor.state.selection;
    if (!sel.empty && !(sel instanceof NodeSelection)) { this.lastRange = { from: sel.from, to: sel.to }; return; }
    // 비어 있는 선택: 사용자가 편집기 안에서 직접 움직인 경우에만 기억을 지움
    if (Date.now() - this.lastEditorInteraction < 600) this.lastRange = null;
  }
  /** 현재 선택이 비어 있고 기억한 범위가 있으면 그 범위를 되살림. 서식 명령 앞에서 호출 */
  private restoreRange(): boolean {
    const sel = this.editor.state.selection;
    if (!sel.empty) return true;
    const r = this.lastRange;
    if (!r) return false;
    const max = this.editor.state.doc.content.size;
    if (r.from < 0 || r.to > max || r.from >= r.to) { this.lastRange = null; return false; }
    this.editor.commands.setTextSelection(r);
    return !this.editor.state.selection.empty;
  }

  // ---------- 내용 ----------
  /** 빈 문단 하나뿐이면 "" (2.8.1: 예전엔 TipTap isEmpty 만 봐서 빈 표·빈 목록도 ""로 저장돼 사라졌음) */
  getHTML() {
    const doc = this.editor.state.doc;
    const blank = this.editor.isEmpty && doc.childCount === 1 && doc.firstChild?.type.name === "paragraph";
    return blank ? "" : this.editor.getHTML();
  }
  /** 내용을 통째로 바꿈 (시작·판서↔알림 전환·기록 불러오기). 되돌리기 기록도 비움:
   *  남겨 두면 알림으로 바꾼 뒤 Ctrl+Z 한 번에 판서 내용이 돌아와 알림장으로 저장돼 버렸음 */
  setHTML(html: string) {
    this.docGen++;
    this.lastRange = null; // 2.8.1: 앞 내용에서 기억한 선택 범위가 새 내용의 엉뚱한 글자에 서식을 입히지 않게
    this.editor.commands.setContent(html || "", { emitUpdate: false });
    const { state, view } = this.editor;
    view.updateState(EditorState.create({ doc: state.doc, plugins: state.plugins, selection: state.selection }));
  }
  clear() { this.docGen++; this.lastRange = null; this.editor.commands.clearContent(false); }
  isEmpty() { return this.getHTML() === ""; }
  onUpdate(cb: UpdateListener) { this.listeners.push(cb); }
  focus() { this.editor.commands.focus(); }
  /** 스크롤을 움직이지 않고 포커스만 (판서/알림 전환 때 화면 위치 유지) */
  focusNoScroll() { this.editor.commands.focus(undefined, { scrollIntoView: false }); }
  hasSelection() { return !this.editor.state.selection.empty || !!this.lastRange; }

  // ---------- 글꼴·크기·색: 선택 영역에만 ----------
  setFontFamily(f: string) { if (!this.restoreRange()) return; this.editor.chain().focus().setFontFamily(f).run(); }
  setFontSize(px: number) { if (!this.restoreRange()) return; this.editor.chain().focus().setFontSize(px + "px").run(); }
  setColor(c: string) {
    // 선택이 없으면(기억한 범위도 없으면) 커서 위치의 저장 마크로 → 이후 입력되는 글자에 적용
    this.restoreRange();
    this.editor.chain().focus().setColor(c).run();
  }
  /** 선택 영역 글자 크기를 delta 만큼 (선택 안의 여러 크기는 각각) */
  adjustSelectionFontSize(delta: number, fallbackPx: number) {
    if (!this.restoreRange()) return;
    const { from, to } = this.editor.state.selection;
    const tr = this.editor.state.tr;
    const markType = this.editor.schema.marks.textStyle;
    let changed = false;
    this.editor.state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return;
      const start = Math.max(from, pos), end = Math.min(to, pos + node.nodeSize);
      const existing = node.marks.find((m) => m.type === markType);
      const cur = parseInt((existing?.attrs.fontSize as string) || "", 10) || fallbackPx;
      const next = Math.min(150, Math.max(10, cur + delta));
      const attrs = { ...(existing?.attrs ?? {}), fontSize: next + "px" };
      tr.addMark(start, end, markType.create(attrs));
      changed = true;
    });
    if (changed) this.editor.view.dispatch(tr);
    this.editor.commands.focus();
  }

  // ---------- 기본 서식 ----------
  toggleBold() { this.editor.chain().focus().toggleBold().run(); }
  toggleItalic() { this.editor.chain().focus().toggleItalic().run(); }
  toggleUnderline() { this.editor.chain().focus().toggleUnderline().run(); }
  align(a: "left" | "center" | "right") {
    if (this.selectedImage()) this.alignImage(a);
    else this.editor.chain().focus().setTextAlign(a).run();
  }
  undo() { this.editor.chain().focus().undo().run(); }
  redo() { this.editor.chain().focus().redo().run(); }
  insertTable(rows: number, cols: number) {
    this.editor.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run();
  }

  // ---------- 사진 ----------
  private insertDroppedFiles(dropped: File[]) {
    const files = dropped.filter(isImageFile);
    if (files.length === 0) { alert("이미지 파일만 삽입할 수 있습니다."); return; }
    files.forEach((f) => void this.insertImageFile(f));
  }

  /** 파일을 최대 1024px 로 줄여 삽입 (v1 과 같은 규칙). 2.6.0:
   *  - 아이폰 사진(HEIC)은 JPEG 로 변환해서 넣음
   *  - 투명한 부분이 있는 사진은 PNG 그대로(예전엔 JPEG 로 바꾸면서 투명한 곳이 검게 변했음), 나머지는 JPEG 0.8
   *  - 앱에서는 사진을 data/images 의 파일로 저장 (board-images.ts)
   *  - 열 수 없는 파일은 이유를 알려 줌 (예전엔 아무 반응 없이 끝났음) */
  async insertImageFile(file: File): Promise<void> {
    if (!isImageFile(file)) { alert("이미지 파일만 삽입할 수 있습니다."); return; }
    const done = busyNotice(isHeicName(file) ? "아이폰 사진을 변환하는 중…" : "사진을 넣는 중…");
    const gen = this.docGen;
    try {
      let source: Blob = file;
      let img = isHeicName(file) ? null : await decodeImage(file);
      if (!img && (isHeicName(file) || (await sniffHeic(file)))) {
        try { source = await heicToJpeg(file); img = await decodeImage(source); }
        catch (e) { console.warn("HEIC 변환 실패:", e); alert(HEIC_MSG); return; }
        if (!img) { alert(HEIC_MSG); return; }
      }
      if (!img) { alert(BROKEN_MSG); return; }

      let w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { alert(BROKEN_MSG); return; }
      if (w > MAX_IMAGE_WIDTH) { h = Math.round((h * MAX_IMAGE_WIDTH) / w); w = MAX_IMAGE_WIDTH; }
      let blob: Blob;
      if (isGif(file) && file.size <= MAX_GIF_BYTES) {
        // 2.8.0: GIF 는 원본 그대로 (캔버스를 거치면 첫 장면만 남아 움직이지 않았음)
        blob = file.type === "image/gif" ? file : new Blob([file], { type: "image/gif" });
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, w, h);
        // JPEG 는 원래 투명한 곳이 없으므로 검사하지 않음
        const keepPng = source.type !== "image/jpeg" && hasTransparency(ctx, w, h);
        blob = await canvasToBlob(canvas, keepPng ? "image/png" : "image/jpeg", 0.8);
      }

      let stored;
      try { stored = await storeImage(blob); }
      catch (e) { console.error("사진 저장 실패:", e); alert("사진을 저장하지 못했습니다: " + e); return; }

      // 처음 크기: 편집 영역 너비의 절반
      const editorW = this.editor.view.dom.clientWidth || 800;
      const width = Math.max(40, Math.min(w, Math.round(editorW * 0.5)));
      const height = Math.round((width * h) / w);
      // 글자를 선택한 상태여도 그 글자를 지우지 않도록 선택 끝에 삽입
      if (gen !== this.docGen) { alert(SWITCHED_MSG); return; } // 기다리는 동안 판서↔알림이 바뀜
      const at = Math.min(this.editor.state.selection.to, this.editor.state.doc.content.size);
      this.editor.chain().focus().setTextSelection(at)
        .insertContent({ type: "image", attrs: { src: stored.src, file: stored.file, alt: "판서 사진", width, height } })
        .run();
    } finally {
      done();
    }
  }

  /** 이미 다 만든 그림(QR 코드 등)을 다시 압축하지 않고 그대로 넣음. width 는 처음 보이는 너비(px) */
  async insertPreparedImage(blob: Blob, width: number, alt = "판서 사진"): Promise<void> {
    const gen = this.docGen;
    const img = await decodeImage(blob);
    if (!img) { alert(BROKEN_MSG); return; }
    let stored;
    try { stored = await storeImage(blob); }
    catch (e) { console.error("사진 저장 실패:", e); alert("사진을 저장하지 못했습니다: " + e); return; }
    const height = Math.round((width * img.naturalHeight) / img.naturalWidth);
    if (gen !== this.docGen) { alert(SWITCHED_MSG); return; }
    const at = Math.min(this.editor.state.selection.to, this.editor.state.doc.content.size);
    this.editor.chain().focus().setTextSelection(at)
      .insertContent({ type: "image", attrs: { src: stored.src, file: stored.file, alt, width, height } })
      .run();
  }

  /** 선택한 사진을 시계 방향으로 90° 회전 (사진 자체를 돌려서 새 파일로 저장) */
  async rotateImage() {
    const sel = this.selectedImage();
    if (!sel) return;
    const { pos, node } = sel;
    const done = busyNotice("사진을 돌리는 중…");
    try {
      const blob = await loadImageBlob(node.attrs.file, node.attrs.src);
      const img = await decodeImage(blob);
      if (!img) { alert(BROKEN_MSG); return; }
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalHeight; canvas.height = img.naturalWidth;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0);
      const png = blob.type !== "image/jpeg"; // PNG·GIF 는 투명한 곳이 있을 수 있어 PNG 로
      const stored = await storeImage(await canvasToBlob(canvas, png ? "image/png" : "image/jpeg", 0.92));
      // 기다리는 동안 내용이 바뀌었으면(사진을 지웠거나 옮김) 그만둠
      const cur = this.editor.state.doc.nodeAt(pos);
      if (!cur || cur.type.name !== "image" || cur.attrs.src !== node.attrs.src) return;
      // 보이는 크기는 가로·세로를 바꿈
      const shown = (this.editor.view.nodeDOM(pos) as HTMLElement | null)?.querySelector("img");
      const curW = shown?.clientWidth || node.attrs.width || 300;
      const curH = shown?.clientHeight || node.attrs.height || 200;
      const tr = this.editor.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, src: stored.src, file: stored.file, width: curH, height: curW });
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      this.editor.view.dispatch(tr);
      this.editor.commands.focus();
      setTimeout(() => this.updateImageToolbar(), 0);
    } catch (e) {
      console.error("사진 회전 실패:", e);
      alert("사진을 돌리지 못했습니다: " + e);
    } finally {
      done();
    }
  }

  /** 선택한 사진을 화면 가득 보기 */
  viewImage() {
    const sel = this.selectedImage();
    if (sel?.node.attrs.src) openImageViewer(sel.node.attrs.src);
  }

  private selectedImage(): { node: any; pos: number } | null {
    const sel = this.editor.state.selection;
    if (sel instanceof NodeSelection && sel.node.type.name === "image") return { node: sel.node, pos: sel.from };
    return null;
  }
  alignImage(align: "left" | "center" | "right") {
    if (!this.selectedImage()) return;
    this.editor.chain().focus().updateAttributes("image", { align }).run();
  }
  scaleImage(factor: number) {
    const sel = this.selectedImage();
    if (!sel) return;
    const dom = this.editor.view.nodeDOM(sel.pos) as HTMLElement | null;
    const img = dom?.querySelector("img");
    if (!img) return;
    const curW = img.clientWidth || sel.node.attrs.width || 300;
    const curH = img.clientHeight || sel.node.attrs.height || 200;
    const width = Math.max(40, Math.round(curW * factor));
    const height = Math.max(40, Math.round((curH * width) / curW));
    this.editor.chain().focus().updateAttributes("image", { width, height }).run();
    setTimeout(() => this.updateImageToolbar(), 0);
  }
  deleteImage() {
    if (!this.selectedImage()) return;
    this.editor.chain().focus().deleteSelection().run();
  }
  deselect() {
    const { state, view } = this.editor;
    const sel = TextSelection.near(state.doc.resolve(state.selection.to), 1);
    view.dispatch(state.tr.setSelection(sel));
    view.focus();
  }

  /** 선택된 사진 위에 작은 도구 모음 표시 */
  private updateImageToolbar() {
    const tb = this.toolbar;
    if (!tb) return;
    const sel = this.selectedImage();
    if (!sel) { tb.classList.add("hidden"); return; }
    const dom = this.editor.view.nodeDOM(sel.pos) as HTMLElement | null;
    const img = dom?.querySelector("img");
    if (!img) { tb.classList.add("hidden"); return; }
    tb.classList.remove("hidden"); // 보이게 한 뒤에야 offsetParent/크기를 잴 수 있음
    const parent = tb.offsetParent as HTMLElement | null;
    if (!parent) { tb.classList.add("hidden"); return; }
    const r = img.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    const c = this.container.getBoundingClientRect();
    let left = r.left + r.width / 2 - tb.offsetWidth / 2 - p.left;
    let top = r.top - p.top - tb.offsetHeight - 8;
    if (top < c.top - p.top + 4) top = Math.min(r.bottom - p.top + 8, c.bottom - p.top - tb.offsetHeight - 4);
    left = Math.max(c.left - p.left + 4, Math.min(left, c.right - p.left - tb.offsetWidth - 4));
    tb.style.left = left + "px";
    tb.style.top = top + "px";
  }
}

export const boardEditor = new BoardEditor();

declare global {
  interface Window { boardEditor: BoardEditor }
}
window.boardEditor = boardEditor;
