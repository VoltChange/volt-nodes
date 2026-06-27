import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "VoltMultiLoraLoader";
const NONE_LORA = "None";
const MAX_SLOTS = 20;
const MAX_VISIBLE_ROWS = 5;
const MIN_NODE_WIDTH = 760;
const ROW_HEIGHT = 66;
const BASE_HEIGHT = 154;
const ALL_FOLDERS = "__all__";
const ROOT_FOLDER = "__root__";

let loraCatalogPromise = null;

function widget(node, name) {
  return node.widgets?.find((item) => item.name === name);
}

function configWidget(node) {
  return widget(node, "loras_config");
}

function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  const name = row.name || row.lora || row.lora_name || NONE_LORA;
  if (!name || name === NONE_LORA) return null;
  return {
    name,
    strength_model: Number.isFinite(Number(row.strength_model ?? row.strength))
      ? Number(row.strength_model ?? row.strength)
      : 1,
    enabled: row.enabled !== false,
    note: String(row.note || ""),
  };
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(normalizeRow).filter(Boolean).slice(0, MAX_SLOTS);
}

function parseRows(value) {
  if (!value) return [];
  if (Array.isArray(value)) return normalizeRows(value);
  if (typeof value === "object") return normalizeRows(value.loras || value);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return normalizeRows(parsed.loras || parsed);
  } catch {
    return [];
  }
}

function rowsFromLegacyWidgetValues(values) {
  if (!Array.isArray(values) || values.length < 4) return [];

  const jsonRows = values
    .filter((value) => typeof value === "string" && value.trim().startsWith("["))
    .map(parseRows)
    .find((rows) => rows.length);
  if (jsonRows) return jsonRows;

  const rows = [];
  for (let index = 0; index < Math.min(values.length, MAX_SLOTS * 4); index += 4) {
    const row = normalizeRow({
      enabled: values[index],
      name: values[index + 1],
      strength_model: values[index + 2],
      note: values[index + 3],
    });
    if (row) rows.push(row);
  }
  return rows;
}

function readRows(node) {
  const directRows = parseRows(configWidget(node)?.value);
  if (directRows.length) return directRows;
  return rowsFromLegacyWidgetValues(node.__voltSerialized?.widgets_values);
}

function jsonValue(rows) {
  return JSON.stringify(normalizeRows(rows));
}

function detachWidgetDom(item) {
  const candidates = [
    item?.element,
    item?.inputEl,
    item?.textarea,
    item?.el,
    item?.domElement,
    item?.element?.parentElement,
    item?.inputEl?.parentElement,
  ];
  for (const element of candidates) {
    if (!element?.style) continue;
    if (element === document.body || element === document.documentElement) continue;
    element.style.setProperty("display", "none", "important");
    element.style.setProperty("visibility", "hidden", "important");
    element.style.setProperty("opacity", "0", "important");
    element.style.setProperty("pointer-events", "none", "important");
    element.style.setProperty("position", "absolute", "important");
    element.style.setProperty("left", "-100000px", "important");
    element.style.setProperty("top", "-100000px", "important");
    element.style.setProperty("width", "0px", "important");
    element.style.setProperty("height", "0px", "important");
    element.style.setProperty("min-width", "0px", "important");
    element.style.setProperty("min-height", "0px", "important");
    element.style.setProperty("max-width", "0px", "important");
    element.style.setProperty("max-height", "0px", "important");
    element.style.setProperty("padding", "0px", "important");
    element.style.setProperty("margin", "0px", "important");
    element.style.setProperty("border", "0", "important");
  }
}

function hideConfigWidget(node) {
  const item = configWidget(node);
  if (!item) return;
  item.hidden = true;
  item.type = "hidden";
  item.serialize = true;
  item.disabled = true;
  item.computeSize = () => [0, 0];
  item.draw = () => {};
  item.mouse = () => false;
  item.serializeValue = () => item.value || "[]";
  item.computedHeight = 0;
  item.y = -100000;
  item.last_y = -100000;
  detachWidgetDom(item);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function displayName(name) {
  const value = String(name || "LoRA").replace(/\.safetensors$/i, "");
  const slash = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  return slash >= 0 ? value.slice(slash + 1) : value;
}

function fileName(name) {
  const value = String(name || "LoRA");
  const slash = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  return slash >= 0 ? value.slice(slash + 1) : value;
}

function normalizeDirectory(directory) {
  return String(directory || "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

function folderLabel(folder) {
  if (folder === ALL_FOLDERS) return "All LoRAs";
  if (folder === ROOT_FOLDER || folder === "") return "Root";
  const parts = folder.split("/").filter(Boolean);
  return parts[parts.length - 1] || folder;
}

function folderDepth(folder) {
  if (folder === ALL_FOLDERS || folder === ROOT_FOLDER || folder === "") return 0;
  return folder.split("/").filter(Boolean).length - 1;
}

function itemInFolder(item, folder) {
  if (folder === ALL_FOLDERS) return true;
  const directory = normalizeDirectory(item.directory);
  if (folder === ROOT_FOLDER) return directory === "";
  return directory === folder || directory.startsWith(`${folder}/`);
}

function folderEntries(catalog) {
  const folders = new Set();
  let rootCount = 0;
  for (const item of catalog) {
    const directory = normalizeDirectory(item.directory);
    if (!directory) {
      rootCount += 1;
      continue;
    }
    const parts = directory.split("/").filter(Boolean);
    for (let index = 1; index <= parts.length; index += 1) {
      folders.add(parts.slice(0, index).join("/"));
    }
  }

  const entries = [
    { folder: ALL_FOLDERS, count: catalog.length },
    ...(rootCount ? [{ folder: ROOT_FOLDER, count: rootCount }] : []),
    ...Array.from(folders)
      .sort((a, b) => a.localeCompare(b))
      .map((folder) => ({
        folder,
        count: catalog.filter((item) => itemInFolder(item, folder)).length,
      })),
  ];
  return entries;
}

function resizeNode(node, rowCount = 0) {
  const width = Math.max(node.size?.[0] || 0, MIN_NODE_WIDTH);
  const visibleRows = Math.max(1, Math.min(rowCount || 0, MAX_VISIBLE_ROWS));
  const height = BASE_HEIGHT + visibleRows * ROW_HEIGHT;
  node.setSize?.([width, height]);
  if (!node.setSize) node.size = [width, height];
}

function setRows(node, rows, { render = true } = {}) {
  const normalized = normalizeRows(rows);
  node._voltRows = normalized;
  const item = configWidget(node);
  if (item) item.value = jsonValue(normalized);
  if (render) node.__voltRender?.();
  resizeNode(node, normalized.length);
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function ensureStyles() {
  let style = document.getElementById("volt-multi-lora-styles");
  if (!style) {
    style = document.createElement("style");
    style.id = "volt-multi-lora-styles";
  }
  style.textContent = `
    .volt-lora-node-root,
    .volt-lora-backdrop {
      --volt-bg: #090d13;
      --volt-panel: #111820;
      --volt-panel-2: #151d27;
      --volt-panel-3: #1b2430;
      --volt-border: #273444;
      --volt-border-soft: #22303e;
      --volt-cyan: #42d7ff;
      --volt-cyan-soft: rgba(66, 215, 255, .22);
      --volt-violet: #8b6fff;
      --volt-violet-soft: rgba(139, 111, 255, .22);
      --volt-green: #1d6f3f;
      --volt-green-border: #2aae64;
      --volt-red: #7c1d28;
      --volt-red-border: #b74352;
      --volt-text: #edf4ff;
      --volt-text-soft: #b5c0cf;
      --volt-muted: #738195;
      --volt-shadow: 0 24px 72px rgba(0,0,0,.62), 0 0 0 1px rgba(66,215,255,.05);
      --volt-glow: 0 0 18px rgba(66,215,255,.12), 0 0 24px rgba(139,111,255,.10);
    }
    .volt-lora-node-root {
      overflow: visible !important;
    }
    .volt-lora-node {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      padding: 10px 14px 14px;
      color: var(--volt-text);
      font: 13px Arial, sans-serif;
      user-select: none;
      overflow: visible;
    }
    .volt-lora-node-head {
      display: grid;
      grid-template-columns: 62px minmax(260px, 1fr) 120px minmax(170px, .62fr) 48px;
      gap: 10px;
      align-items: center;
      margin: 0 0 8px;
      padding: 0 2px;
      color: var(--volt-muted);
      font-size: 12px;
      line-height: 18px;
    }
    .volt-lora-node-rows {
      display: grid;
      gap: 10px;
      overflow-y: hidden;
      overflow-x: hidden;
      padding-right: 0;
    }
    .volt-lora-node-rows.scrolling {
      max-height: ${MAX_VISIBLE_ROWS * ROW_HEIGHT}px;
      overflow-y: auto;
      padding-right: 6px;
    }
    .volt-lora-node-row {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: 62px minmax(260px, 1fr) 120px minmax(170px, .62fr) 48px;
      gap: 10px;
      align-items: center;
      justify-items: stretch;
      height: 56px;
      padding: 6px;
      background: linear-gradient(180deg, rgba(27,36,48,.96), rgba(15,22,30,.96));
      border: 1px solid rgba(42,174,100,.72);
      border-radius: 8px;
      box-shadow: inset 0 0 0 1px rgba(66,215,255,.06), 0 0 14px rgba(42,174,100,.10);
      transition: border-color .14s ease, box-shadow .14s ease, background .14s ease;
    }
    .volt-lora-node-row.disabled {
      border-color: var(--volt-border);
      box-shadow: none;
      opacity: .72;
    }
    .volt-lora-node-row:hover {
      border-color: rgba(66,215,255,.58);
      box-shadow: inset 0 0 0 1px rgba(139,111,255,.08), 0 0 16px rgba(66,215,255,.10);
    }
    .volt-lora-switch {
      position: relative;
      align-self: center;
      justify-self: center;
      width: 50px;
      height: 34px;
      padding: 0;
      margin: 0;
      border: 1px solid var(--volt-green-border);
      border-radius: 999px;
      background: linear-gradient(180deg, #20864a, var(--volt-green));
      cursor: pointer;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.06), 0 0 12px rgba(42,174,100,.14);
      transition: background .12s ease, border-color .12s ease, box-shadow .12s ease;
    }
    .volt-lora-switch::after {
      content: "";
      position: absolute;
      top: 4px;
      left: 18px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #e8fff5;
      transition: left .12s ease;
      box-shadow: 0 1px 4px rgba(0,0,0,.35);
    }
    .volt-lora-switch.off {
      background: #29313b;
      border-color: #526070;
      box-shadow: none;
    }
    .volt-lora-switch.off::after {
      left: 6px;
      background: #93a0b0;
    }
    .volt-lora-name,
    .volt-lora-note,
    .volt-lora-strength {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 38px;
      color: var(--volt-text);
      background: rgba(18,25,34,.92);
      border: 1px solid var(--volt-border);
      border-radius: 6px;
      outline: none;
      align-self: center;
      margin: 0;
      font-family: Arial, sans-serif;
      transition: border-color .14s ease, box-shadow .14s ease, background .14s ease;
    }
    .volt-lora-note:focus,
    .volt-lora-strength:focus {
      border-color: rgba(66,215,255,.72);
      box-shadow: 0 0 0 1px rgba(66,215,255,.13), 0 0 14px rgba(66,215,255,.10);
      background: rgba(20,29,39,.98);
    }
    .volt-lora-name {
      display: flex;
      align-items: center;
      padding: 0 12px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 14px;
      line-height: 38px;
    }
    .volt-lora-strength {
      padding: 0 8px;
      text-align: center;
      color: #9feaff;
      font-size: 15px;
      line-height: 38px;
      font-variant-numeric: tabular-nums;
    }
    .volt-lora-note {
      padding: 0 8px;
      background: rgba(25,24,43,.92);
      border-color: rgba(139,111,255,.34);
      line-height: 38px;
    }
    .volt-lora-del {
      display: grid;
      place-items: center;
      align-self: center;
      justify-self: center;
      width: 42px;
      height: 40px;
      padding: 0;
      margin: 0;
      border: 1px solid var(--volt-red-border);
      border-radius: 8px;
      color: #ffe2e5;
      background: linear-gradient(180deg, #9a202a, var(--volt-red));
      cursor: pointer;
      font-size: 24px;
      line-height: 1;
      font-family: Arial, sans-serif;
      box-shadow: 0 0 12px rgba(183,67,82,.12);
      transition: filter .12s ease, border-color .12s ease, box-shadow .12s ease;
    }
    .volt-lora-add {
      width: 100%;
      height: 48px;
      margin-top: 14px;
      border: 1px solid rgba(139,111,255,.36);
      border-radius: 8px;
      color: #b7a8ff;
      background: linear-gradient(180deg, rgba(27,36,48,.98), rgba(13,18,25,.98));
      cursor: pointer;
      font-size: 18px;
      font-weight: 700;
      box-shadow: inset 0 0 0 1px rgba(66,215,255,.05);
      transition: color .14s ease, border-color .14s ease, box-shadow .14s ease, filter .14s ease;
    }
    .volt-lora-add:hover,
    .volt-lora-del:hover,
    .volt-lora-switch:hover {
      filter: brightness(1.1);
    }
    .volt-lora-empty-node {
      display: grid;
      place-items: center;
      height: 56px;
      color: var(--volt-muted);
      border: 1px dashed var(--volt-border);
      border-radius: 8px;
      background: rgba(17,24,32,.82);
    }
    .volt-lora-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: grid;
      place-items: center;
      background: rgba(3,6,10,.70);
      backdrop-filter: blur(6px);
    }
    .volt-lora-modal {
      width: min(1320px, calc(100vw - 48px));
      height: min(720px, calc(100vh - 48px));
      display: grid;
      grid-template-rows: auto auto 1fr;
      gap: 10px;
      padding: 14px;
      color: var(--volt-text);
      background: linear-gradient(180deg, rgba(16,23,31,.98), rgba(8,12,18,.98));
      border: 1px solid rgba(66,215,255,.18);
      border-radius: 10px;
      box-shadow: var(--volt-shadow);
      font: 13px Arial, sans-serif;
    }
    .volt-lora-modal-head,
    .volt-lora-modal-tools {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
    }
    .volt-lora-modal-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--volt-text);
      text-shadow: 0 0 18px rgba(66,215,255,.10);
    }
    .volt-lora-search,
    .volt-lora-modal input[type="number"],
    .volt-lora-modal input[type="text"] {
      box-sizing: border-box;
      width: 100%;
      height: 34px;
      min-width: 0;
      color: var(--volt-text);
      background: rgba(18,25,34,.95);
      border: 1px solid var(--volt-border);
      border-radius: 6px;
      padding: 0 10px;
      outline: none;
      transition: border-color .14s ease, box-shadow .14s ease, background .14s ease;
    }
    .volt-lora-search:focus,
    .volt-lora-modal input[type="number"]:focus,
    .volt-lora-modal input[type="text"]:focus {
      border-color: rgba(66,215,255,.68);
      box-shadow: 0 0 0 1px rgba(66,215,255,.12), 0 0 18px rgba(66,215,255,.08);
      background: rgba(20,29,39,.98);
    }
    .volt-lora-modal-body {
      display: grid;
      grid-template-columns: 230px minmax(360px, 1fr) 460px;
      gap: 12px;
      min-height: 0;
    }
    .volt-lora-folder-list {
      overflow: auto;
      border: 1px solid var(--volt-border-soft);
      border-radius: 8px;
      background: rgba(12,18,25,.92);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.015);
    }
    .volt-lora-folder-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      width: 100%;
      min-width: 0;
      min-height: 34px;
      padding: 7px 9px;
      box-sizing: border-box;
      border: 0;
      border-bottom: 1px solid var(--volt-border-soft);
      color: var(--volt-text-soft);
      background: transparent;
      cursor: pointer;
      font: 13px Arial, sans-serif;
      text-align: left;
      transition: color .14s ease, background .14s ease, box-shadow .14s ease;
    }
    .volt-lora-folder-item:hover,
    .volt-lora-folder-item.active {
      color: var(--volt-text);
      background: linear-gradient(90deg, rgba(66,215,255,.10), rgba(139,111,255,.08));
      box-shadow: inset 2px 0 0 rgba(66,215,255,.62);
    }
    .volt-lora-folder-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      padding-left: calc(var(--folder-depth, 0) * 14px);
    }
    .volt-lora-folder-count {
      color: var(--volt-muted);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .volt-lora-list {
      overflow: auto;
      border: 1px solid var(--volt-border-soft);
      border-radius: 8px;
      background: rgba(12,18,25,.92);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.015);
    }
    .volt-lora-item {
      display: grid;
      grid-template-columns: 64px 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 8px;
      border-bottom: 1px solid var(--volt-border-soft);
      cursor: pointer;
      transition: background .14s ease, box-shadow .14s ease, transform .14s ease;
    }
    .volt-lora-item:hover {
      background: rgba(27,36,48,.88);
    }
    .volt-lora-item.active {
      background: linear-gradient(90deg, rgba(66,215,255,.10), rgba(139,111,255,.08));
      box-shadow: inset 2px 0 0 rgba(139,111,255,.78), inset 0 0 0 1px rgba(66,215,255,.06);
    }
    .volt-lora-thumb,
    .volt-lora-preview {
      display: grid;
      place-items: center;
      color: var(--volt-muted);
      background: #071017;
      border: 1px solid var(--volt-border-soft);
      border-radius: 6px;
      overflow: hidden;
    }
    .volt-lora-thumb {
      width: 64px;
      height: 64px;
      font-size: 11px;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.02);
    }
    .volt-lora-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .volt-lora-preview-bg {
      position: absolute;
      inset: -30px;
      z-index: 0;
      width: calc(100% + 60px);
      height: calc(100% + 60px);
      object-fit: cover;
      filter: blur(24px) saturate(1.15) brightness(.68);
      transform: scale(1.04);
      opacity: .95;
    }
    .volt-lora-preview-img {
      position: absolute;
      inset: 0;
      z-index: 1;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .volt-lora-preview-empty {
      position: relative;
      z-index: 1;
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
    }
    .volt-lora-item-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--volt-text);
      font-weight: 700;
    }
    .volt-lora-item-dir {
      margin-top: 4px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--volt-muted);
      font-size: 12px;
    }
    .volt-lora-side {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      min-height: 0;
      max-height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 4px;
      overscroll-behavior: contain;
    }
    .volt-lora-preview {
      position: relative;
      width: 420px;
      max-width: 100%;
      height: 560px;
      justify-self: center;
      align-self: center;
      isolation: isolate;
      border-color: rgba(139,111,255,.34);
      box-shadow: 0 0 0 1px rgba(66,215,255,.06), 0 0 28px rgba(139,111,255,.12);
    }
    .volt-lora-side-name {
      min-height: 36px;
      overflow-wrap: anywhere;
      color: var(--volt-text);
      font-weight: 700;
      line-height: 1.35;
    }
    .volt-lora-selected {
      min-height: 92px;
      overflow: auto;
      padding: 8px;
      border: 1px solid var(--volt-border-soft);
      border-radius: 8px;
      background: rgba(12,18,25,.92);
      color: var(--volt-text-soft);
    }
    .volt-lora-chip {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px;
      align-items: center;
      margin-bottom: 6px;
      min-width: 0;
    }
    .volt-lora-chip span {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .volt-lora-chip button,
    .volt-lora-load,
    .volt-lora-remove,
    .volt-lora-close,
    .volt-lora-civitai {
      height: 34px;
      border-radius: 7px;
      cursor: pointer;
      border: 1px solid var(--volt-border);
      background: rgba(17,24,32,.96);
      color: var(--volt-text);
      font-weight: 700;
      transition: filter .12s ease, border-color .12s ease, box-shadow .12s ease, background .12s ease;
    }
    .volt-lora-chip button {
      width: 28px;
      height: 24px;
      color: #ffdfe3;
      background: var(--volt-red);
      border-color: var(--volt-red-border);
    }
    .volt-lora-side-actions {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }
    .volt-lora-load {
      color: #dcffe8;
      background: linear-gradient(180deg, #227547, var(--volt-green));
      border-color: var(--volt-green-border);
      box-shadow: 0 0 14px rgba(42,174,100,.12);
    }
    .volt-lora-remove {
      color: #ffdfe3;
      background: linear-gradient(180deg, #932630, var(--volt-red));
      border-color: var(--volt-red-border);
      box-shadow: 0 0 14px rgba(183,67,82,.10);
    }
    .volt-lora-civitai {
      color: #dff7ff;
      background: linear-gradient(180deg, rgba(28,57,75,.96), rgba(18,33,48,.96));
      border-color: rgba(66,215,255,.46);
      box-shadow: 0 0 14px rgba(66,215,255,.10);
    }
    .volt-lora-civitai:disabled {
      cursor: not-allowed;
      opacity: .45;
      filter: none;
      box-shadow: none;
    }
    .volt-lora-close:hover {
      border-color: rgba(66,215,255,.46);
      box-shadow: 0 0 16px rgba(66,215,255,.10);
      background: rgba(27,36,48,.98);
    }
    .volt-lora-civitai:not(:disabled):hover {
      border-color: #67e2ff;
      box-shadow: 0 0 18px rgba(66,215,255,.18);
    }
    .volt-lora-load:hover {
      border-color: #52d88a;
      box-shadow: 0 0 18px rgba(42,174,100,.20);
    }
    .volt-lora-remove:hover,
    .volt-lora-chip button:hover,
    .volt-lora-del:hover {
      border-color: #d95f6d;
      box-shadow: 0 0 18px rgba(183,67,82,.18);
    }
    .volt-lora-empty {
      padding: 16px;
      color: var(--volt-muted);
    }
  `;
  if (!style.isConnected) document.head.appendChild(style);
}

function renderOuterNode(node, root) {
  const rows = normalizeRows(node._voltRows || readRows(node));
  const rowsScrolling = rows.length > MAX_VISIBLE_ROWS;
  root.innerHTML = `
    <div class="volt-lora-node">
      <div class="volt-lora-node-head">
        <div>On/Off</div>
        <div>LoRA</div>
        <div>Strength</div>
        <div>Note</div>
        <div>Del</div>
      </div>
      <div class="volt-lora-node-rows${rowsScrolling ? " scrolling" : ""}">
        ${rows.length ? rows.map((row, index) => `
          <div class="volt-lora-node-row${row.enabled ? "" : " disabled"}" data-index="${index}">
            <button class="volt-lora-switch${row.enabled ? "" : " off"}" type="button" title="${row.enabled ? "Enabled" : "Disabled"}"></button>
            <div class="volt-lora-name" title="${escapeHtml(row.name)}">${escapeHtml(displayName(row.name))}</div>
            <input class="volt-lora-strength" type="number" step="0.01" min="-100" max="100" value="${Number(row.strength_model ?? 1).toFixed(2)}" title="Strength">
            <input class="volt-lora-note" type="text" value="${escapeHtml(row.note || "")}" placeholder="Note..." title="Note">
            <button class="volt-lora-del" type="button" title="Delete">x</button>
          </div>
        `).join("") : `<div class="volt-lora-empty-node">No LoRA loaded</div>`}
      </div>
      <button class="volt-lora-add" type="button">+ Add LoRA</button>
    </div>
  `;

  root.querySelectorAll(".volt-lora-node-row").forEach((rowElement) => {
    const index = Number(rowElement.dataset.index);
    rowElement.querySelector(".volt-lora-switch").addEventListener("click", () => {
      rows[index].enabled = !rows[index].enabled;
      setRows(node, rows);
    });
    rowElement.querySelector(".volt-lora-del").addEventListener("click", () => {
      rows.splice(index, 1);
      setRows(node, rows);
    });
    rowElement.querySelector(".volt-lora-strength").addEventListener("change", (event) => {
      rows[index].strength_model = Number(Number(event.target.value || 0).toFixed(2));
      setRows(node, rows);
    });
    rowElement.querySelector(".volt-lora-note").addEventListener("change", (event) => {
      rows[index].note = event.target.value || "";
      setRows(node, rows);
    });
  });

  root.querySelector(".volt-lora-add").addEventListener("click", () => {
    openLoraManager(node, rows, (nextRows) => setRows(node, nextRows));
  });

  resizeNode(node, rows.length);
}

function installOuterPanel(node) {
  ensureStyles();
  hideConfigWidget(node);

  if (!node.addDOMWidget) return;
  if (node.__voltDomWidget) {
    node.__voltRender?.();
    return;
  }

  const root = document.createElement("div");
  root.className = "volt-lora-node-root";
  root.addEventListener("pointerdown", (event) => event.stopPropagation());
  root.addEventListener("mousedown", (event) => event.stopPropagation());
  root.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });

  const domWidget = node.addDOMWidget("volt_lora_manager", "custom", root, {
    getValue() {
      return "";
    },
    setValue() {},
  });
  domWidget.serialize = false;
  domWidget.computeSize = () => {
    const rowCount = normalizeRows(node._voltRows || readRows(node)).length;
    const visibleRows = Math.max(1, Math.min(rowCount || 0, MAX_VISIBLE_ROWS));
    return [Math.max(node.size?.[0] || 0, MIN_NODE_WIDTH) - 16, BASE_HEIGHT + visibleRows * ROW_HEIGHT - 8];
  };

  node.__voltDomWidget = domWidget;
  node.__voltRender = () => renderOuterNode(node, root);
  node.__voltRender();
}

async function loadLoraCatalog() {
  if (!loraCatalogPromise) {
    loraCatalogPromise = api.fetchApi("/volt-nodes/loras")
      .then((response) => response.json())
      .then((data) => data.loras || [])
      .catch((error) => {
        console.warn("[volt-nodes] Failed to load LoRA catalog", error);
        return [];
      });
  }
  return loraCatalogPromise;
}

function renderSelected(container, rows, onRemove) {
  if (!rows.length) {
    container.innerHTML = `<div class="volt-lora-empty">No LoRA selected</div>`;
    return;
  }
  container.innerHTML = rows.map((row, index) => `
    <div class="volt-lora-chip" data-index="${index}">
      <span title="${escapeHtml(row.name)}">${row.enabled ? "ON" : "OFF"} / ${escapeHtml(row.name)} / ${Number(row.strength_model ?? 1).toFixed(2)}</span>
      <button type="button" title="Remove">X</button>
    </div>
  `).join("");
  container.querySelectorAll(".volt-lora-chip").forEach((chip) => {
    chip.querySelector("button").addEventListener("click", () => onRemove(Number(chip.dataset.index)));
  });
}

function openLoraManager(node, initialRows, onRowsChanged) {
  ensureStyles();
  let rows = normalizeRows(initialRows);
  const backdrop = document.createElement("div");
  backdrop.className = "volt-lora-backdrop";
  backdrop.innerHTML = `
    <div class="volt-lora-modal" role="dialog" aria-modal="true">
      <div class="volt-lora-modal-head">
        <div class="volt-lora-modal-title">LoRA Manager</div>
        <button class="volt-lora-close" type="button">Close</button>
      </div>
      <div class="volt-lora-modal-tools">
        <input class="volt-lora-search" type="text" placeholder="Search LoRA...">
        <span class="volt-lora-count"></span>
      </div>
      <div class="volt-lora-modal-body">
        <div class="volt-lora-folder-list"><div class="volt-lora-empty">Loading folders...</div></div>
        <div class="volt-lora-list"><div class="volt-lora-empty">Loading LoRAs...</div></div>
        <div class="volt-lora-side">
          <div class="volt-lora-preview"><div class="volt-lora-preview-empty">No preview</div></div>
          <div class="volt-lora-side-name">Select a LoRA</div>
          <div>
            <input class="volt-lora-side-strength" type="number" value="1.00" step="0.01" min="-100" max="100" title="Strength">
            <input class="volt-lora-side-note" type="text" placeholder="Note..." title="Note" style="margin-top:8px">
          </div>
          <div class="volt-lora-side-actions">
            <button class="volt-lora-load" type="button">Load</button>
            <button class="volt-lora-remove" type="button">Remove</button>
            <button class="volt-lora-civitai" type="button" disabled>No Link</button>
          </div>
          <div class="volt-lora-selected"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const modal = backdrop.querySelector(".volt-lora-modal");
  const search = backdrop.querySelector(".volt-lora-search");
  const folderList = backdrop.querySelector(".volt-lora-folder-list");
  const list = backdrop.querySelector(".volt-lora-list");
  const count = backdrop.querySelector(".volt-lora-count");
  const preview = backdrop.querySelector(".volt-lora-preview");
  const sideName = backdrop.querySelector(".volt-lora-side-name");
  const strength = backdrop.querySelector(".volt-lora-side-strength");
  const note = backdrop.querySelector(".volt-lora-side-note");
  const selectedBox = backdrop.querySelector(".volt-lora-selected");
  const loadButton = backdrop.querySelector(".volt-lora-load");
  const removeButton = backdrop.querySelector(".volt-lora-remove");
  const civitaiButton = backdrop.querySelector(".volt-lora-civitai");
  let catalog = [];
  let folders = [];
  let selectedFolder = ALL_FOLDERS;
  let selected = null;

  const commit = () => {
    rows = normalizeRows(rows);
    onRowsChanged(rows);
    renderSelected(selectedBox, rows, (index) => {
      rows.splice(index, 1);
      commit();
    });
  };

  const close = () => {
    commit();
    backdrop.remove();
  };

  backdrop.querySelectorAll(".volt-lora-close").forEach((button) => button.addEventListener("click", close));
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  modal.addEventListener("click", (event) => event.stopPropagation());

  const selectItem = (item) => {
    selected = item;
    sideName.textContent = fileName(item.name);
    sideName.title = item.name;
    const civitaiUrl = item.civitai_url || "";
    civitaiButton.disabled = !civitaiUrl;
    civitaiButton.textContent = civitaiUrl ? "Civitai" : "No Link";
    civitaiButton.title = civitaiUrl || "No Civitai metadata link";
    if (item.preview) {
      const previewUrl = escapeHtml(item.preview);
      preview.innerHTML = `
        <img class="volt-lora-preview-bg" src="${previewUrl}" alt="" aria-hidden="true">
        <img class="volt-lora-preview-img" src="${previewUrl}" alt="">
      `;
    } else {
      preview.innerHTML = `<div class="volt-lora-preview-empty">No preview</div>`;
    }
    const existing = rows.find((row) => row.name === item.name);
    strength.value = Number(existing?.strength_model ?? 1).toFixed(2);
    note.value = existing?.note || "";
    list.querySelectorAll(".volt-lora-item").forEach((element) => {
      element.classList.toggle("active", element.dataset.name === item.name);
    });
  };

  const renderFolders = () => {
    folders = folderEntries(catalog);
    folderList.innerHTML = folders.map(({ folder, count: folderCount }) => `
      <button class="volt-lora-folder-item${folder === selectedFolder ? " active" : ""}" type="button" data-folder="${escapeHtml(folder)}" title="${escapeHtml(folder === ALL_FOLDERS ? "All LoRAs" : folderLabel(folder))}">
        <span class="volt-lora-folder-name" style="--folder-depth:${folderDepth(folder)}">${escapeHtml(folderLabel(folder))}</span>
        <span class="volt-lora-folder-count">${folderCount}</span>
      </button>
    `).join("");

    folderList.querySelectorAll(".volt-lora-folder-item").forEach((button) => {
      button.addEventListener("click", () => {
        selectedFolder = button.dataset.folder || ALL_FOLDERS;
        renderFolders();
        renderList();
      });
    });
  };

  const loadSelected = () => {
    if (!selected) return;
    const row = {
      name: selected.name,
      strength_model: Number(strength.value || 1),
      enabled: true,
      note: note.value || "",
    };
    const index = rows.findIndex((item) => item.name === row.name);
    if (index >= 0) rows[index] = row;
    else if (rows.length < MAX_SLOTS) rows.push(row);
    commit();
  };

  const removeSelected = () => {
    if (!selected) return;
    rows = rows.filter((row) => row.name !== selected.name);
    commit();
  };

  const renderList = () => {
    const query = search.value.trim().toLowerCase();
    const filtered = catalog.filter((item) => {
      const haystack = `${item.name} ${normalizeDirectory(item.directory)}`.toLowerCase();
      return itemInFolder(item, selectedFolder) && (!query || haystack.includes(query));
    });
    count.textContent = `${filtered.length} / ${catalog.length} LoRAs`;
    if (!filtered.length) {
      list.innerHTML = `<div class="volt-lora-empty">No matching LoRA in ${escapeHtml(folderLabel(selectedFolder))}</div>`;
      selected = null;
      sideName.textContent = "Select a LoRA";
      civitaiButton.disabled = true;
      civitaiButton.textContent = "No Link";
      civitaiButton.title = "No Civitai metadata link";
      preview.innerHTML = `<div class="volt-lora-preview-empty">No preview</div>`;
      strength.value = "1.00";
      note.value = "";
      return;
    }

    list.innerHTML = filtered.map((item) => `
      <div class="volt-lora-item${selected?.name === item.name ? " active" : ""}" data-name="${escapeHtml(item.name)}">
        <div class="volt-lora-thumb">${item.preview ? `<img src="${item.preview}" alt="">` : "No preview"}</div>
        <div>
          <div class="volt-lora-item-name" title="${escapeHtml(item.name)}">${escapeHtml(fileName(item.name))}</div>
          <div class="volt-lora-item-dir">${escapeHtml(item.directory || "")}</div>
        </div>
        <button class="volt-lora-load" type="button">Load</button>
      </div>
    `).join("");

    list.querySelectorAll(".volt-lora-item").forEach((element) => {
      const item = filtered.find((entry) => entry.name === element.dataset.name);
      element.addEventListener("click", () => selectItem(item));
      element.querySelector("button").addEventListener("click", (event) => {
        event.stopPropagation();
        selectItem(item);
        loadSelected();
      });
    });

    if (!selected || !filtered.some((item) => item.name === selected.name)) {
      selectItem(filtered[0]);
    } else {
      selectItem(selected);
    }
  };

  loadButton.addEventListener("click", loadSelected);
  removeButton.addEventListener("click", removeSelected);
  civitaiButton.addEventListener("click", () => {
    if (!selected?.civitai_url) return;
    window.open(selected.civitai_url, "_blank", "noopener,noreferrer");
  });
  search.addEventListener("input", renderList);
  renderSelected(selectedBox, rows, (index) => {
    rows.splice(index, 1);
    commit();
  });

  loadLoraCatalog().then((items) => {
    catalog = items;
    renderFolders();
    renderList();
    const firstVisible = catalog.find((item) => itemInFolder(item, selectedFolder));
    if (firstVisible) selectItem(firstVisible);
  });
  search.focus();
}

app.registerExtension({
  name: "volt.multi_lora_loader",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    const onConfigure = nodeType.prototype.onConfigure;
    const onDrawForeground = nodeType.prototype.onDrawForeground;
    const onSerialize = nodeType.prototype.onSerialize;
    const serialize = nodeType.prototype.serialize;

    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      ensureStyles();
      setRows(this, readRows(this), { render: false });
      installOuterPanel(this);
      return result;
    };

    nodeType.prototype.onConfigure = function (serialized) {
      this.__voltSerialized = serialized;
      const restoredRows = rowsFromLegacyWidgetValues(serialized?.widgets_values);
      const result = onConfigure?.apply(this, arguments);
      const rows = restoredRows.length ? restoredRows : readRows(this);
      setRows(this, rows, { render: false });
      installOuterPanel(this);
      return result;
    };

    nodeType.prototype.onSerialize = function (data) {
      setRows(this, this._voltRows || readRows(this), { render: false });
      const result = onSerialize?.apply(this, arguments);
      if (data && this.size) data.size = this.size;
      return result;
    };

    nodeType.prototype.serialize = function () {
      setRows(this, this._voltRows || readRows(this), { render: false });
      const data = serialize?.apply(this, arguments);
      if (data && this.size) data.size = this.size;
      return data;
    };

    nodeType.prototype.onDrawForeground = function () {
      const result = onDrawForeground?.apply(this, arguments);
      hideConfigWidget(this);
      if (!this.__voltDomWidget) installOuterPanel(this);
      return result;
    };
  },
});
