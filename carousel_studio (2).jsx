import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import {
  Plus,
  Trash2,
  ImagePlus,
  Copy,
  Move,
  Maximize2,
  Eye,
  EyeOff,
  X,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";

const CANVAS_W = 1080;
const CANVAS_H = 1440;
const DRAG_THRESHOLD = 4;
const SIDEBAR_W = 110;
const STAGE_W = 460;
const GAP = 16;
const WINDOW_PAD = 30;

const BIG_PRESETS = [
  { name: "White Note", bg: "#FFFFFF", color: "#1A1A1A" },
  { name: "Black Note", bg: "#181614", color: "#FFFFFF" },
];
const SMALL_PRESETS = [
  { name: "Cyan", bg: "#3FCBBE", color: "#0B2B26" },
  { name: "Yellow", bg: "#EEFF33", color: "#1C2400" },
  { name: "Red", bg: "#E8305C", color: "#FFFFFF" },
  { name: "Mint", bg: "#B7E8C9", color: "#12331C" },
];
const TEXT_ONLY_PRESET = { name: "텍스트만", bg: "transparent", color: "#FFFFFF" };
const BG_SWATCHES = ["#111111", "#FFFFFF", "#EDEBE6", "#F2E9D8"];
const FONT_FAMILIES = {
  default: '"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif',
  handwrite: '"Gaegu","Apple SD Gothic Neo",sans-serif',
};

const T = {
  한국어: {
    title: "캐러셀 제작",
    subtitle: "사진·영상 위에 텍스트 박스를 얹는 오버레이 스튜디오",
    slide: "슬라이드",
    textbox: "텍스트 박스",
    color: "색상",
    save: "저장 위치",
    exportBtn: "현재 PNG",
    exporting: "내보내는 중",
    importBtn: "가져오기",
    empty1: "사진을 업로드하고 오른쪽 색상을 눌러",
    empty2: "텍스트박스를 추가해보세요",
    nosel: "박스를 클릭하면 바로 편집, 끌면 바로 이동돼요.",
    fontsize: "글자 크기",
    align: "정렬",
    dl: "다운로드 폴더",
    preview: "새 탭 미리보기",
  },
  English: {
    title: "Carousel Studio",
    subtitle: "Overlay studio for text boxes on photos & videos",
    slide: "Slides",
    textbox: "Text Boxes",
    color: "Colors",
    save: "Save to",
    exportBtn: "Export PNG",
    exporting: "Exporting",
    importBtn: "Import",
    empty1: "Upload a photo, then pick a color",
    empty2: "to add a text box",
    nosel: "Click a box to edit it, drag to move it.",
    fontsize: "Font size",
    align: "Align",
    dl: "Download folder",
    preview: "New-tab preview",
  },
};

let uidCounter = 1;
const uid = () => `id_${uidCounter++}_${Math.random().toString(36).slice(2, 7)}`;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

function makeSlide(label) {
  return { id: uid(), label, image: null, boxes: [], bg: "#111111" };
}
function textColorFor(hex) {
  if (!hex || hex[0] !== "#" || hex.length < 7) return "#ffffff";
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#4a4a46" : "#ffffff";
}
function isLightColor(hex) {
  if (!hex || hex[0] !== "#" || hex.length < 7) return true;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
function textOnlyShadowCss(color) {
  return isLightColor(color)
    ? "0 1px 3px rgba(0,0,0,.65), 0 0 10px rgba(0,0,0,.4)"
    : "0 1px 3px rgba(255,255,255,.85), 0 0 10px rgba(255,255,255,.6)";
}
function makeBox(preset, index) {
  return {
    id: uid(),
    text: "새 텍스트",
    x: Math.round(CANVAS_W * 0.12),
    y: Math.round(CANVAS_H * (0.34 + index * 0.12)),
    w: Math.round(CANVAS_W * 0.42),
    fontSize: 38,
    bg: preset.bg,
    color: preset.color,
    hidden: false,
    align: "left",
    font: "default",
  };
}

function wrapCanvasText(ctx, text, maxWidth) {
  const paragraphs = text.split("\n");
  const lines = [];
  paragraphs.forEach((p) => {
    let cur = "";
    for (const ch of p) {
      const test = cur + ch;
      if (ctx.measureText(test).width > maxWidth && cur.length > 0) {
        lines.push(cur);
        cur = ch;
      } else {
        cur = test;
      }
    }
    lines.push(cur);
  });
  return lines;
}
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const tr = w / h;
  let sx, sy, sw, sh;
  if (ir > tr) {
    sh = img.height;
    sw = sh * tr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / tr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function autoGrow(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

export default function CarouselStudio() {
  const [slides, setSlides] = useState([makeSlide("01")]);
  const [slideIdx, setSlideIdx] = useState(0);
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [editingBoxId, setEditingBoxId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [stageScale, setStageScale] = useState(STAGE_W / CANVAS_W);
  const [lang, setLang] = useState("한국어");
  const [showGuides, setShowGuides] = useState(false);
  const [saveLoc, setSaveLoc] = useState("다운로드 폴더");
  const [shellScale, setShellScale] = useState(1);
  const [shellNaturalH, setShellNaturalH] = useState(0);

  const stageOuterRef = useRef(null);
  const dragRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageElCache = useRef({});
  const rootRef = useRef(null);
  const shellInnerRef = useRef(null);

  const t = T[lang];
  const slide = slides[slideIdx];
  const selectedBox = slide?.boxes.find((b) => b.id === selectedBoxId) || null;

  // Scale the whole widget down to fit its container instead of letting it
  // overflow into a horizontal scrollbar — clicking after scrolling a nested
  // scroll box was what caused positions to jump.
  useLayoutEffect(() => {
    const rootEl = rootRef.current;
    const innerEl = shellInnerRef.current;
    if (!rootEl || !innerEl) return;
    const compute = () => {
      const availW = rootEl.clientWidth;
      const naturalW = innerEl.scrollWidth;
      const s = naturalW > 0 ? Math.min(1, availW / naturalW) : 1;
      setShellScale(s);
      setShellNaturalH(innerEl.scrollHeight);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(rootEl);
    ro.observe(innerEl);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, []);

  useLayoutEffect(() => {
    const el = stageOuterRef.current;
    if (!el) return;
    const compute = () => setStageScale(el.getBoundingClientRect().width / CANVAS_W);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [shellScale]);

  // Any box property change (text, font size, color, alignment...) should paint
  // on the scaled canvas immediately. Reading a layout property here forces a
  // synchronous reflow right after React commits, instead of waiting for some
  // unrelated later interaction to trigger the repaint.
  useLayoutEffect(() => {
    if (stageOuterRef.current) {
      void stageOuterRef.current.offsetHeight;
    }
  }, [slides]);

  const updateSlideAt = useCallback((idx, updater) => {
    setSlides((prev) => prev.map((s, i) => (i === idx ? updater(s) : s)));
  }, []);
  const updateBox = useCallback((sIdx, boxId, patch) => {
    setSlides((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s;
        return { ...s, boxes: s.boxes.map((b) => (b.id === boxId ? { ...b, ...patch } : b)) };
      })
    );
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const rawDx = e.clientX - d.startX;
      const rawDy = e.clientY - d.startY;
      if (d.type === "pending") {
        if (Math.abs(rawDx) > DRAG_THRESHOLD || Math.abs(rawDy) > DRAG_THRESHOLD) {
          d.type = "move";
        } else {
          return;
        }
      }
      if (d.type === "move") {
        updateBox(d.sIdx, d.boxId, {
          x: clamp(d.origX + rawDx / stageScale, 0, CANVAS_W - 40),
          y: clamp(d.origY + rawDy / stageScale, 0, CANVAS_H - 40),
        });
      } else if (d.type === "resize") {
        updateBox(d.sIdx, d.boxId, {
          w: clamp(d.origW + rawDx / stageScale, 140, CANVAS_W - d.origX - 10),
        });
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d && d.type === "pending") setEditingBoxId(d.boxId);
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [stageScale, updateBox]);

  const addSlide = () => {
    setSlides((prev) => [...prev, makeSlide(String(prev.length + 1).padStart(2, "0"))]);
    setSlideIdx(slides.length);
    setSelectedBoxId(null);
  };
  const duplicateSlide = () => {
    const copy = {
      ...slide,
      id: uid(),
      label: String(slides.length + 1).padStart(2, "0"),
      boxes: slide.boxes.map((b) => ({ ...b, id: uid() })),
    };
    setSlides((prev) => [...prev.slice(0, slideIdx + 1), copy, ...prev.slice(slideIdx + 1)]);
    setSlideIdx(slideIdx + 1);
  };
  const deleteSlide = (idx) => {
    if (slides.length === 1) return;
    setSlides((prev) => prev.filter((_, i) => i !== idx));
    setSlideIdx((prev) => clamp(idx <= prev ? prev - 1 : prev, 0, slides.length - 2));
    setSelectedBoxId(null);
  };
  const handleImageFile = (file) => {
    if (!file) return;
    const targetSlideId = slide.id;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      updateSlideAt(slideIdx, (s) => ({ ...s, image: dataUrl }));
      const img = new Image();
      img.onload = () => {
        imageElCache.current[targetSlideId] = img;
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const addTextBox = (preset) => {
    const box = makeBox(preset, slide.boxes.length);
    updateSlideAt(slideIdx, (s) => ({ ...s, boxes: [...s.boxes, box] }));
    setSelectedBoxId(box.id);
    setEditingBoxId(box.id);
  };

  const deleteBox = useCallback((sIdx, boxId) => {
    setSlides((prev) =>
      prev.map((s, i) => (i === sIdx ? { ...s, boxes: s.boxes.filter((b) => b.id !== boxId) } : s))
    );
    setSelectedBoxId((cur) => (cur === boxId ? null : cur));
    setEditingBoxId((cur) => (cur === boxId ? null : cur));
  }, []);

  const clearAllBoxes = (sIdx) => {
    updateSlideAt(sIdx, (s) => ({ ...s, boxes: [] }));
    setSelectedBoxId(null);
    setEditingBoxId(null);
  };

  const duplicateBox = (sIdx, boxId) => {
    const newId = uid();
    setSlides((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s;
        const idx = s.boxes.findIndex((b) => b.id === boxId);
        if (idx === -1) return s;
        const src = s.boxes[idx];
        const copy = { ...src, id: newId, x: clamp(src.x + 24, 0, CANVAS_W - 60), y: clamp(src.y + 24, 0, CANVAS_H - 60) };
        const boxes = [...s.boxes];
        boxes.splice(idx + 1, 0, copy);
        return { ...s, boxes };
      })
    );
    setSelectedBoxId(newId);
    setEditingBoxId(null);
  };

  const moveBoxOrder = (sIdx, boxId, dir) => {
    setSlides((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s;
        const idx = s.boxes.findIndex((b) => b.id === boxId);
        const newIdx = clamp(idx + dir, 0, s.boxes.length - 1);
        if (newIdx === idx) return s;
        const boxes = [...s.boxes];
        const [item] = boxes.splice(idx, 1);
        boxes.splice(newIdx, 0, item);
        return { ...s, boxes };
      })
    );
  };

  const centerSelectedBox = () => {
    if (!selectedBox) return;
    updateBox(slideIdx, selectedBox.id, { x: clamp(Math.round((CANVAS_W - selectedBox.w) / 2), 0, CANVAS_W) });
  };
  const requestStageFullscreen = () => {
    const el = stageOuterRef.current;
    if (el?.requestFullscreen) el.requestFullscreen();
  };
  const toggleGuides = () => setShowGuides((v) => !v);
  const cycleSaveLoc = () => setSaveLoc((prev) => (prev === t.dl ? t.preview : t.dl));

  const onBoxPointerDown = (e, box) => {
    e.stopPropagation();
    setSelectedBoxId(box.id);
    if (editingBoxId === box.id) return;
    dragRef.current = {
      type: "pending",
      sIdx: slideIdx,
      boxId: box.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: box.x,
      origY: box.y,
    };
  };
  const onMoveIconPointerDown = (e, box) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { type: "move", sIdx: slideIdx, boxId: box.id, startX: e.clientX, startY: e.clientY, origX: box.x, origY: box.y };
  };
  const onResizePointerDown = (e, box) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = { type: "resize", sIdx: slideIdx, boxId: box.id, startX: e.clientX, startY: e.clientY, origW: box.w, origX: box.x };
  };

  const renderExportCanvas = () => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = slide.bg || "#111111";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const cachedImg = imageElCache.current[slide.id];
    if (cachedImg) {
      drawCover(ctx, cachedImg, 0, 0, CANVAS_W, CANVAS_H);
    }
    slide.boxes.forEach((box) => {
      if (box.hidden) return;
      const padX = 20, padY = 14;
      const fontStack = box.font === "handwrite" ? '"Gaegu","Apple SD Gothic Neo",sans-serif' : '"Apple SD Gothic Neo","Malgun Gothic","Pretendard",sans-serif';
      ctx.font = `700 ${box.fontSize}px ${fontStack}`;
      const lines = wrapCanvasText(ctx, box.text, box.w - padX * 2);
      const lineHeight = box.fontSize * 1.4;
      const boxH = lines.length * lineHeight + padY * 2;
      const isTransparent = box.bg === "transparent";
      if (!isTransparent) {
        ctx.fillStyle = box.bg;
        roundRectPath(ctx, box.x, box.y, box.w, boxH, 6);
        ctx.fill();
      }
      ctx.fillStyle = box.color;
      ctx.textBaseline = "top";
      if (isTransparent) {
        ctx.shadowColor = isLightColor(box.color) ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.85)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
      }
      const align = box.align || "left";
      ctx.textAlign = align;
      const lineX =
        align === "center" ? box.x + box.w / 2 : align === "right" ? box.x + box.w - padX : box.x + padX;
      lines.forEach((line, i) => ctx.fillText(line, lineX, box.y + padY + i * lineHeight));
      ctx.textAlign = "left";
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    });
    return canvas;
  };

  // Kept fully synchronous (no await before the click) so the browser still
  // treats the download/open as directly triggered by the button's click.
  const exportPNG = () => {
    setExporting(true);
    try {
      const canvas = renderExportCanvas();
      const url = canvas.toDataURL("image/png");
      if (saveLoc === t.preview) {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `carousel_${slide.label}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } finally {
      setExporting(false);
    }
  };

  const rowWidth = SIDEBAR_W + GAP + STAGE_W;
  const windowWidth = rowWidth + WINDOW_PAD * 2;

  return (
    <div style={{ fontFamily: '"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Gaegu:wght@700&display=swap');
        .cs-shell { background:#EDECE8; border-radius:14px; padding:16px; display:inline-block; }
        .cs-chrome { display:flex; align-items:center; gap:6px; padding:0 2px 8px 2px; width:${windowWidth}px; }
        .cs-tab { background:#FFFFFF; border:1px solid #DEDCD5; border-radius:7px 7px 0 0; padding:5px 10px; font-size:11px; color:#3a3a38; display:flex; align-items:center; gap:6px; }
        .cs-tab-add { width:19px; height:19px; border-radius:5px; background:#FFFFFF; border:1px solid #DEDCD5; display:flex; align-items:center; justify-content:center; color:#8a8a86; }
        .cs-urlbar { flex:1; background:#FFFFFF; border:1px solid #DEDCD5; border-radius:7px; padding:5px 10px; font-size:10.5px; color:#8a8a86; }
        .cs-window { background:#FFFFFF; border:1px solid #DEDCD5; border-radius:14px; padding:${WINDOW_PAD}px; width:${windowWidth}px; box-sizing:border-box; }
        .cs-title { font-size:21px; font-weight:800; color:#161615; margin:0; }
        .cs-subtitle { font-size:12px; color:#9a9894; margin:3px 0 0 0; }
        .cs-toprow { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
        .cs-savegroup { display:flex; align-items:center; gap:8px; }
        .cs-saveloc { font-size:11.5px; color:#57554f; display:flex; align-items:center; gap:3px; white-space:nowrap; background:#fff; border:1px solid #E3E1DC; border-radius:7px; padding:6px 9px; cursor:pointer; }
        .cs-saveloc:hover { border-color:#c9c7c0; }
        .cs-export { background:#161615; color:#fff; border:none; border-radius:8px; padding:8px 14px; font-weight:700; font-size:12px; display:flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap; }
        .cs-export:disabled { opacity:.5; }
        .cs-toolrow { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:14px 0 18px 0; padding-top:12px; border-top:1px solid #EEEDE9; }
        .cs-toolleft { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
        .cs-lang { display:flex; border:1px solid #E3E1DC; border-radius:7px; overflow:hidden; font-size:11.5px; }
        .cs-lang button { padding:6px 10px; background:#fff; border:none; color:#9a9894; cursor:pointer; }
        .cs-lang button.active { background:#161615; color:#fff; font-weight:600; }
        .cs-iconbtn { width:30px; height:30px; border-radius:7px; border:1px solid #E3E1DC; background:#fff; color:#57554f; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .cs-iconbtn:hover { border-color:#c9c7c0; color:#161615; }
        .cs-dim { font-size:11.5px; color:#9a9894; white-space:nowrap; }
        .cs-bgswatches { display:flex; align-items:center; gap:5px; }
        .cs-bgswatch { width:20px; height:20px; border-radius:6px; cursor:pointer; border:2px solid transparent; padding:0; display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .cs-bgswatch.active { border-color:#E8305C; }
        .cs-bgcustom { position:relative; background:conic-gradient(from 90deg,#eee 90deg,#fff 90deg 180deg,#eee 180deg 270deg,#fff 270deg); border:1px solid #E3E1DC !important; }
        .cs-bgcustom input[type="color"] { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; border:none; padding:0; }
        .cs-importer { font-size:11.5px; color:#57554f; display:flex; align-items:center; gap:3px; white-space:nowrap; background:#fff; border:1px solid #E3E1DC; border-radius:7px; padding:6px 9px; cursor:pointer; }
        .cs-importer:hover { border-color:#c9c7c0; }
        .cs-toprow2 { display:flex; gap:${GAP}px; align-items:flex-start; }
        .cs-sidecol { width:${SIDEBAR_W}px; flex:0 0 auto; }
        .cs-sidehead { display:flex; align-items:center; justify-content:space-between; font-size:11.5px; font-weight:700; color:#57554f; margin-bottom:8px; }
        .cs-sidehead button { border:1px solid #E3E1DC; background:#fff; width:19px; height:19px; border-radius:5px; display:flex; align-items:center; justify-content:center; color:#57554f; cursor:pointer; }
        .cs-slide-thumb { position:relative; border-radius:8px; overflow:hidden; border:1.5px solid #E3E1DC; cursor:pointer; aspect-ratio:3/4; background:#f4f3f0 center/cover no-repeat; margin-bottom:9px; }
        .cs-slide-thumb.active { border-color:#E8305C; }
        .cs-slide-num { position:absolute; top:4px; left:4px; font-size:9.5px; font-weight:700; background:#161615; color:#fff; padding:1px 5px; border-radius:4px; }
        .cs-slide-del { position:absolute; top:3px; right:3px; background:#fff; border:1px solid #E3E1DC; border-radius:4px; color:#57554f; width:17px; height:17px; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .cs-canvascol { flex:0 0 auto; }
        .cs-stage-outer { width:${STAGE_W}px; aspect-ratio:${CANVAS_W}/${CANVAS_H}; border-radius:10px; overflow:hidden; position:relative; border:1px solid #E3E1DC; }
        .cs-stage-inner { position:absolute; top:0; left:0; transform-origin:0 0; }
        .cs-guides { position:absolute; inset:0; pointer-events:none; }
        .cs-guides div { position:absolute; background:rgba(255,255,255,.35); }
        .cs-canvas-toolbar { position:absolute; top:14px; right:14px; display:flex; gap:2px; background:rgba(255,255,255,.92); border-radius:8px; padding:4px; box-shadow:0 3px 10px rgba(0,0,0,.18); z-index:6; }
        .cs-canvas-toolbar button { width:28px; height:28px; border:none; background:transparent; color:#3a3a38; display:flex; align-items:center; justify-content:center; border-radius:5px; cursor:pointer; }
        .cs-canvas-toolbar button:hover { background:#EDECE8; }
        .cs-canvas-toolbar button.on { background:#161615; color:#fff; }
        .cs-pan-handle { position:absolute; bottom:14px; right:14px; width:28px; height:28px; border-radius:50%; background:rgba(255,255,255,.92); display:flex; align-items:center; justify-content:center; color:#3a3a38; box-shadow:0 3px 10px rgba(0,0,0,.18); cursor:pointer; border:none; }
        .cs-box { position:absolute; user-select:none; border-radius:6px; padding:13px 16px; font-weight:700; white-space:pre-wrap; word-break:break-word; box-sizing:border-box; cursor:grab; transform:translateZ(0); will-change:contents; }
        .cs-box.dimmed { opacity:.35; outline:2px dashed #9a9894; }
        .cs-box.selected { outline:2.5px dashed #3a3a38; outline-offset:3px; }
        .cs-box textarea { width:100%; background:transparent; border:none; outline:none; resize:none; font:inherit; color:inherit; padding:0; cursor:text; overflow:hidden; display:block; }
        .cs-toolbar-float { position:absolute; display:flex; gap:2px; background:rgba(255,255,255,.95); border-radius:7px; padding:3px; box-shadow:0 3px 8px rgba(0,0,0,.2); z-index:7; }
        .cs-toolbar-float button { width:26px; height:26px; border:none; background:transparent; color:#3a3a38; display:flex; align-items:center; justify-content:center; border-radius:5px; cursor:pointer; }
        .cs-toolbar-float button:hover { background:#EDECE8; }
        .cs-toolbar-float button.danger:hover { background:#fbdde6; color:#c81c4f; }
        .cs-resize-handle { position:absolute; right:-9px; top:50%; transform:translateY(-50%); width:19px; height:19px; background:#3FCBBE; border-radius:50%; cursor:ew-resize; border:2.5px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,.3); z-index:7; }
        .cs-empty-canvas { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#6b6b6b; font-size:14px; text-align:center; padding:24px; }
        .cs-bottomrow { display:flex; gap:${GAP}px; margin-top:18px; padding-top:18px; border-top:1px solid #E3E1DC; width:100%; }
        .cs-bottomleft { flex:1 1 auto; min-width:0; }
        .cs-subtoolbar { display:flex; gap:7px; margin-bottom:12px; }
        .cs-subtoolbar button { width:30px; height:30px; border-radius:7px; border:1px solid #E3E1DC; background:#fff; color:#57554f; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .cs-subtoolbar button:hover { border-color:#c9c7c0; color:#161615; }
        .cs-subtoolbar.disabled button { opacity:.35; pointer-events:none; }
        .cs-panelhead { font-size:12.5px; font-weight:700; color:#57554f; margin-bottom:8px; }
        .cs-boxtabs { display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap; }
        .cs-boxtab { width:28px; height:28px; border-radius:7px; border:1.5px solid #E3E1DC; background:#fff; font-size:12px; font-weight:700; color:#57554f; cursor:pointer; }
        .cs-boxtab.active { border-color:#161615; background:#161615; color:#fff; }
        .cs-boxtab-add { width:28px; height:28px; border-radius:7px; border:1.5px dashed #d5d3cc; background:#fff; color:#9a9894; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .cs-boxtext-input { width:100%; max-width:400px; box-sizing:border-box; border:1px solid #E3E1DC; border-radius:10px; padding:14px 16px; font-size:15px; line-height:1.5; color:#161615; min-height:110px; resize:vertical; font-family:inherit; }
        .cs-nosel { font-size:12.5px; color:#9a9894; line-height:1.6; max-width:400px; }
        .cs-colorpanel { width:215px; flex:0 0 auto; }
        .cs-bigpreset { display:flex; align-items:center; gap:9px; border:1.5px solid #E3E1DC; border-radius:9px; padding:8px 10px; cursor:pointer; margin-bottom:8px; }
        .cs-bigpreset.active { border-color:#161615; }
        .cs-bigpreset .swatch { width:26px; height:26px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex:0 0 auto; }
        .cs-bigpreset .label { font-size:12px; color:#57554f; font-weight:600; }
        .cs-transparent-swatch { background:conic-gradient(from 90deg,#e5e3dd 90deg,#fff 90deg 180deg,#e5e3dd 180deg 270deg,#fff 270deg); border:1px solid #E3E1DC; color:#57554f; }
        .cs-smallrow { display:flex; gap:6px; margin-bottom:14px; }
        .cs-smallswatch { width:22px; height:22px; border-radius:6px; cursor:pointer; border:2px solid transparent; flex:0 0 auto; }
        .cs-smallswatch.active { border-color:#161615; }
        .cs-alignrow { display:flex; gap:6px; margin-bottom:14px; }
        .cs-alignbtn { width:30px; height:30px; border-radius:7px; border:1.5px solid #E3E1DC; background:#fff; color:#57554f; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .cs-alignbtn:hover { border-color:#c9c7c0; }
        .cs-alignbtn.active { border-color:#161615; background:#161615; color:#fff; }
        .cs-fontrow { display:flex; gap:6px; margin-bottom:14px; }
        .cs-fontbtn { flex:1; height:30px; border-radius:7px; border:1.5px solid #E3E1DC; background:#fff; color:#57554f; font-size:11.5px; font-weight:600; cursor:pointer; }
        .cs-fontbtn:hover { border-color:#c9c7c0; }
        .cs-fontbtn.active { border-color:#161615; background:#161615; color:#fff; }
        .cs-alignfont-row { display:flex; gap:10px; margin-bottom:2px; }
        .cs-af-col { flex:0 0 auto; }
        .cs-af-col.wide { flex:1; min-width:0; }
        .cs-af-col .cs-alignrow, .cs-af-col .cs-fontrow { margin-bottom:0; }
      `}</style>

      <div ref={rootRef} style={{ width: "100%" }}>
        <div style={{ height: shellNaturalH * shellScale || undefined, overflow: "hidden" }}>
          <div ref={shellInnerRef} style={{ transform: `scale(${shellScale})`, transformOrigin: "top left", display: "inline-block" }}>
            <div className="cs-shell">
        <div className="cs-chrome">
          <div className="cs-tab">RE:FEEEL AX <X size={10} /></div>
          <div className="cs-tab-add"><Plus size={11} /></div>
          <div className="cs-urlbar">http://localhost:5173/?view=studio</div>
        </div>

        <div className="cs-window">
          <div className="cs-toprow">
            <div>
              <h2 className="cs-title">{t.title}</h2>
              <p className="cs-subtitle">{t.subtitle}</p>
            </div>
            <div className="cs-savegroup">
              <button className="cs-saveloc" onClick={cycleSaveLoc} title="저장 위치 전환">
                {t.save}: {saveLoc} <ChevronDown size={12} />
              </button>
              <button className="cs-export" onClick={exportPNG} disabled={exporting}>
                <ArrowUp size={12} /> {exporting ? t.exporting : t.exportBtn}
              </button>
            </div>
          </div>

          <div className="cs-toolrow">
            <div className="cs-toolleft">
              <div className="cs-lang">
                <button className={lang === "한국어" ? "active" : ""} onClick={() => setLang("한국어")}>한국어</button>
                <button className={lang === "English" ? "active" : ""} onClick={() => setLang("English")}>English</button>
              </div>
              <button className="cs-iconbtn" title="슬라이드 복제" onClick={duplicateSlide}><Copy size={14} /></button>
              <button className="cs-iconbtn" title="사진 업로드" onClick={() => fileInputRef.current?.click()}><ImagePlus size={14} /></button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleImageFile(e.target.files?.[0])} />
              <span className="cs-dim" style={{ marginLeft: 2 }}>배경색</span>
              <div className="cs-bgswatches">
                {BG_SWATCHES.map((c) => (
                  <button
                    key={c}
                    className={`cs-bgswatch ${slide.bg === c ? "active" : ""}`}
                    style={{ background: c, border: c === "#FFFFFF" ? "1px solid #E3E1DC" : "none" }}
                    title={c}
                    onClick={() => updateSlideAt(slideIdx, (s) => ({ ...s, bg: c }))}
                  />
                ))}
                <label className="cs-bgswatch cs-bgcustom" title="직접 선택">
                  <input type="color" value={slide.bg} onChange={(e) => updateSlideAt(slideIdx, (s) => ({ ...s, bg: e.target.value }))} />
                </label>
              </div>
              <span className="cs-dim">{CANVAS_W} x {CANVAS_H} · 3:4</span>
            </div>
            <button className="cs-importer" onClick={() => fileInputRef.current?.click()} title="사진 가져오기">
              {t.importBtn} <ChevronDown size={12} />
            </button>
          </div>

          <div className="cs-toprow2">
            <div className="cs-sidecol">
              <div className="cs-sidehead">
                {t.slide}
                <button onClick={addSlide}><Plus size={12} /></button>
              </div>
              {slides.map((s, i) => (
                <div
                  key={s.id}
                  className={`cs-slide-thumb ${i === slideIdx ? "active" : ""}`}
                  style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}
                  onClick={() => { setSlideIdx(i); setSelectedBoxId(null); }}
                >
                  <span className="cs-slide-num">{s.label}</span>
                  {slides.length > 1 && (
                    <button className="cs-slide-del" onClick={(e) => { e.stopPropagation(); deleteSlide(i); }}>
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="cs-canvascol">
              <div className="cs-stage-outer" style={{ background: slide.bg || "#111111" }} ref={stageOuterRef} onClick={() => { setSelectedBoxId(null); setEditingBoxId(null); }}>
                <div className="cs-stage-inner" style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${stageScale})` }}>
                  {slide.image ? (
                    <img src={slide.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div className="cs-empty-canvas" style={{ width: CANVAS_W, height: CANVAS_H, color: textColorFor(slide.bg) }}>
                      {t.empty1}<br />{t.empty2}
                    </div>
                  )}
                  {showGuides && (
                    <div className="cs-guides" style={{ width: CANVAS_W, height: CANVAS_H }}>
                      <div style={{ left: "33.33%", top: 0, width: 1, height: "100%" }} />
                      <div style={{ left: "66.66%", top: 0, width: 1, height: "100%" }} />
                      <div style={{ top: "33.33%", left: 0, height: 1, width: "100%" }} />
                      <div style={{ top: "66.66%", left: 0, height: 1, width: "100%" }} />
                    </div>
                  )}
                  {slide.boxes.map((box) => (
                    <div
                      key={box.id}
                      className={`cs-box ${selectedBoxId === box.id ? "selected" : ""} ${box.hidden ? "dimmed" : ""}`}
                      style={{ left: box.x, top: box.y, width: box.w, background: box.bg, color: box.color, fontSize: box.fontSize, lineHeight: 1.4, textAlign: box.align || "left", fontFamily: FONT_FAMILIES[box.font || "default"], textShadow: box.bg === "transparent" ? textOnlyShadowCss(box.color) : "none" }}
                      onPointerDown={(e) => onBoxPointerDown(e, box)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {editingBoxId === box.id ? (
                        <textarea
                          autoFocus
                          ref={autoGrow}
                          value={box.text}
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={(e) => { updateBox(slideIdx, box.id, { text: e.target.value }); autoGrow(e.target); }}
                          style={{ fontSize: box.fontSize, lineHeight: 1.4, textAlign: box.align || "left", fontFamily: FONT_FAMILIES[box.font || "default"], textShadow: box.bg === "transparent" ? textOnlyShadowCss(box.color) : "none" }}
                        />
                      ) : (
                        box.text
                      )}
                      {selectedBoxId === box.id && (
                        <>
                          <div className="cs-toolbar-float" style={{ top: -32, left: 0 }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                            <button onPointerDown={(e) => onMoveIconPointerDown(e, box)} title="이동"><Move size={13} /></button>
                            <button onClick={() => duplicateBox(slideIdx, box.id)} title="복제"><Copy size={13} /></button>
                            <button className="danger" onClick={() => deleteBox(slideIdx, box.id)} title="삭제"><Trash2 size={13} /></button>
                          </div>
                          <div className="cs-resize-handle" onPointerDown={(e) => onResizePointerDown(e, box)} onClick={(e) => e.stopPropagation()} />
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <div className="cs-canvas-toolbar" onClick={(e) => e.stopPropagation()}>
                  <button title="사진 교체" onClick={() => fileInputRef.current?.click()}><ImagePlus size={14} /></button>
                  <button title="선택한 박스 가운데 정렬" onClick={centerSelectedBox}><Move size={14} /></button>
                  <button title="전체화면으로 보기" onClick={requestStageFullscreen}><Maximize2 size={14} /></button>
                  <button title={showGuides ? "가이드 숨기기" : "가이드 보이기"} className={showGuides ? "on" : ""} onClick={toggleGuides}>
                    {showGuides ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button title="전체 삭제" onClick={() => clearAllBoxes(slideIdx)}><Trash2 size={14} /></button>
                </div>
                <button className="cs-pan-handle" title="선택 해제" onClick={(e) => { e.stopPropagation(); setSelectedBoxId(null); setEditingBoxId(null); }}>
                  <Move size={14} />
                </button>
              </div>
            </div>
          </div>

          <div className="cs-bottomrow">
            <div className="cs-bottomleft">
              <div className={`cs-subtoolbar ${selectedBox ? "" : "disabled"}`}>
                <button onClick={() => selectedBox && moveBoxOrder(slideIdx, selectedBox.id, -1)} title="뒤로 보내기"><ArrowUp size={14} /></button>
                <button onClick={() => selectedBox && moveBoxOrder(slideIdx, selectedBox.id, 1)} title="앞으로 보내기"><ArrowDown size={14} /></button>
                <button onClick={() => selectedBox && duplicateBox(slideIdx, selectedBox.id)} title="복제"><Copy size={14} /></button>
                <button onClick={() => selectedBox && deleteBox(slideIdx, selectedBox.id)} title="삭제"><Trash2 size={14} /></button>
              </div>

              <div className="cs-panelhead">{t.textbox} · {slide.boxes.length}</div>
              <div className="cs-boxtabs">
                {slide.boxes.map((b, i) => (
                  <button
                    key={b.id}
                    className={`cs-boxtab ${selectedBoxId === b.id ? "active" : ""}`}
                    onClick={() => { setSelectedBoxId(b.id); setEditingBoxId(null); }}
                  >
                    {i + 1}
                  </button>
                ))}
                <button className="cs-boxtab-add" onClick={() => addTextBox(BIG_PRESETS[slide.boxes.length % 2])} title="텍스트박스 추가">
                  <Plus size={14} />
                </button>
              </div>
              {selectedBox ? (
                <textarea
                  key={selectedBox.id}
                  className="cs-boxtext-input"
                  ref={autoGrow}
                  value={selectedBox.text}
                  onChange={(e) => { updateBox(slideIdx, selectedBox.id, { text: e.target.value }); autoGrow(e.target); }}
                  style={{ textAlign: selectedBox.align || "left", fontFamily: FONT_FAMILIES[selectedBox.font || "default"] }}
                />
              ) : (
                <div className="cs-nosel">{t.nosel}</div>
              )}
            </div>

            <div className="cs-colorpanel">
              <div className="cs-panelhead">{t.color}</div>
              {BIG_PRESETS.map((p) => (
                <div
                  key={p.name}
                  className={`cs-bigpreset ${selectedBox?.bg === p.bg ? "active" : ""}`}
                  onClick={() => (selectedBox ? updateBox(slideIdx, selectedBox.id, { bg: p.bg, color: p.color }) : addTextBox(p))}
                >
                  <div className="swatch" style={{ background: p.bg, color: p.color, border: p.bg === "#FFFFFF" ? "1px solid #E3E1DC" : "none" }}>Aa</div>
                  <div className="label">{p.name}</div>
                </div>
              ))}
              <div
                className={`cs-bigpreset ${selectedBox?.bg === "transparent" ? "active" : ""}`}
                onClick={() => (selectedBox ? updateBox(slideIdx, selectedBox.id, { bg: TEXT_ONLY_PRESET.bg, color: selectedBox.color === "#1A1A1A" || selectedBox.color === "#FFFFFF" ? selectedBox.color : "#FFFFFF" }) : addTextBox(TEXT_ONLY_PRESET))}
              >
                <div className="swatch cs-transparent-swatch">Aa</div>
                <div className="label">텍스트만 (배경 없음)</div>
              </div>
              {selectedBox?.bg === "transparent" && (
                <div className="cs-smallrow" style={{ marginBottom: 10, flexWrap: "wrap" }}>
                  <div
                    className={`cs-smallswatch ${selectedBox.color === "#FFFFFF" ? "active" : ""}`}
                    title="흰색 글자"
                    style={{ background: "#FFFFFF", border: "1px solid #E3E1DC" }}
                    onClick={() => updateBox(slideIdx, selectedBox.id, { color: "#FFFFFF" })}
                  />
                  <div
                    className={`cs-smallswatch ${selectedBox.color === "#1A1A1A" ? "active" : ""}`}
                    title="검정 글자"
                    style={{ background: "#1A1A1A" }}
                    onClick={() => updateBox(slideIdx, selectedBox.id, { color: "#1A1A1A" })}
                  />
                  {SMALL_PRESETS.map((p) => (
                    <div
                      key={p.name}
                      className={`cs-smallswatch ${selectedBox.color === p.bg ? "active" : ""}`}
                      title={`${p.name} 글자`}
                      style={{ background: p.bg }}
                      onClick={() => updateBox(slideIdx, selectedBox.id, { color: p.bg })}
                    />
                  ))}
                  <label className="cs-smallswatch cs-bgcustom" title="글자색 직접 선택">
                    <input
                      type="color"
                      value={/^#([0-9A-Fa-f]{6})$/.test(selectedBox.color) ? selectedBox.color : "#FFFFFF"}
                      onChange={(e) => updateBox(slideIdx, selectedBox.id, { color: e.target.value })}
                    />
                  </label>
                </div>
              )}
              {(!selectedBox || selectedBox.bg !== "transparent") && (
                <div className="cs-smallrow">
                  {SMALL_PRESETS.map((p) => (
                    <div
                      key={p.name}
                      className={`cs-smallswatch ${selectedBox?.bg === p.bg ? "active" : ""}`}
                      title={p.name}
                      style={{ background: p.bg }}
                      onClick={() => (selectedBox ? updateBox(slideIdx, selectedBox.id, { bg: p.bg, color: p.color }) : addTextBox(p))}
                    />
                  ))}
                </div>
              )}
              {selectedBox && (
                <>
                  <div className="cs-alignfont-row">
                    <div className="cs-af-col">
                      <div className="cs-panelhead">{t.align}</div>
                      <div className="cs-alignrow">
                        <button
                          className={`cs-alignbtn ${(selectedBox.align || "left") === "left" ? "active" : ""}`}
                          title="왼쪽 정렬"
                          onClick={() => updateBox(slideIdx, selectedBox.id, { align: "left" })}
                        >
                          <AlignLeft size={14} />
                        </button>
                        <button
                          className={`cs-alignbtn ${selectedBox.align === "center" ? "active" : ""}`}
                          title="가운데 정렬"
                          onClick={() => updateBox(slideIdx, selectedBox.id, { align: "center" })}
                        >
                          <AlignCenter size={14} />
                        </button>
                        <button
                          className={`cs-alignbtn ${selectedBox.align === "right" ? "active" : ""}`}
                          title="오른쪽 정렬"
                          onClick={() => updateBox(slideIdx, selectedBox.id, { align: "right" })}
                        >
                          <AlignRight size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="cs-af-col wide">
                      <div className="cs-panelhead">글씨체</div>
                      <div className="cs-fontrow">
                        <button
                          className={`cs-fontbtn ${(selectedBox.font || "default") === "default" ? "active" : ""}`}
                          onClick={() => updateBox(slideIdx, selectedBox.id, { font: "default" })}
                        >
                          기본체
                        </button>
                        <button
                          className={`cs-fontbtn ${selectedBox.font === "handwrite" ? "active" : ""}`}
                          style={{ fontFamily: FONT_FAMILIES.handwrite }}
                          onClick={() => updateBox(slideIdx, selectedBox.id, { font: "handwrite" })}
                        >
                          손글씨체
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="cs-panelhead" style={{ marginTop: 10 }}>{t.fontsize} {selectedBox.fontSize}px</div>
                  <input
                    type="range"
                    min={20}
                    max={160}
                    value={selectedBox.fontSize}
                    style={{ width: "100%" }}
                    onChange={(e) => updateBox(slideIdx, selectedBox.id, { fontSize: Number(e.target.value) })}
                  />
                </>
              )}
            </div>
          </div>
          <span aria-hidden="true" style={{ position: "absolute", opacity: 0, fontSize: 1, pointerEvents: "none", fontFamily: FONT_FAMILIES.handwrite }}>가</span>
        </div>
      </div>
          </div>
        </div>
      </div>
    </div>
  );
}
