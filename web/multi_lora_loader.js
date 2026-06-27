import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "VoltMultiLoraLoader";
const NONE_LORA = "None";
const MAX_SLOTS = 20;
const MAX_VISIBLE_ROWS = 5;
const MIN_NODE_WIDTH = 760;
const ROW_HEIGHT = 66;
const BASE_HEIGHT = 154;

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
    .volt-lora-node-root {
      overflow: visible !important;
    }
    .volt-lora-node {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      padding: 10px 14px 14px;
      color: #d8d8d8;
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
      color: #8f8f8f;
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
      background: #202020;
      border: 1px solid #1f7c2c;
      border-radius: 8px;
      box-shadow: inset 0 0 0 1px rgba(52, 148, 65, .18);
    }
    .volt-lora-node-row.disabled {
      border-color: #474747;
      box-shadow: none;
      opacity: .72;
    }
    .volt-lora-switch {
      position: relative;
      align-self: center;
      justify-self: center;
      width: 50px;
      height: 34px;
      padding: 0;
      margin: 0;
      border: 1px solid #1c7731;
      border-radius: 999px;
      background: #208637;
      cursor: pointer;
      transition: background .12s ease, border-color .12s ease;
    }
    .volt-lora-switch::after {
      content: "";
      position: absolute;
      top: 4px;
      left: 18px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #f4f4f4;
      transition: left .12s ease;
      box-shadow: 0 1px 4px rgba(0,0,0,.35);
    }
    .volt-lora-switch.off {
      background: #333;
      border-color: #555;
    }
    .volt-lora-switch.off::after {
      left: 6px;
      background: #aaa;
    }
    .volt-lora-name,
    .volt-lora-note,
    .volt-lora-strength {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 38px;
      color: #dcdcdc;
      background: #2b2b2b;
      border: 1px solid #444;
      border-radius: 6px;
      outline: none;
      align-self: center;
      margin: 0;
      font-family: Arial, sans-serif;
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
      background: #252436;
      border-color: #3a3658;
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
      border: 1px solid #b34639;
      border-radius: 8px;
      color: #ffd2cc;
      background: #8a1111;
      cursor: pointer;
      font-size: 24px;
      line-height: 1;
      font-family: Arial, sans-serif;
    }
    .volt-lora-add {
      width: 100%;
      height: 48px;
      margin-top: 14px;
      border: 1px solid #383838;
      border-radius: 8px;
      color: #9b84ff;
      background: #1d1d1d;
      cursor: pointer;
      font-size: 18px;
      font-weight: 700;
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
      color: #898989;
      border: 1px dashed #454545;
      border-radius: 8px;
      background: #202020;
    }
    .volt-lora-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: grid;
      place-items: center;
      background: rgba(0,0,0,.62);
    }
    .volt-lora-modal {
      width: min(980px, calc(100vw - 48px));
      height: min(720px, calc(100vh - 48px));
      display: grid;
      grid-template-rows: auto auto 1fr;
      gap: 10px;
      padding: 14px;
      color: #e8e8e8;
      background: #181818;
      border: 1px solid #3c3c3c;
      border-radius: 10px;
      box-shadow: 0 24px 70px rgba(0,0,0,.55);
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
    }
    .volt-lora-search,
    .volt-lora-modal input[type="number"],
    .volt-lora-modal input[type="text"] {
      box-sizing: border-box;
      width: 100%;
      height: 34px;
      min-width: 0;
      color: #e1e1e1;
      background: #2b2b2b;
      border: 1px solid #454545;
      border-radius: 6px;
      padding: 0 10px;
      outline: none;
    }
    .volt-lora-modal-body {
      display: grid;
      grid-template-columns: minmax(300px, 1fr) 340px;
      gap: 12px;
      min-height: 0;
    }
    .volt-lora-list {
      overflow: auto;
      border: 1px solid #303030;
      border-radius: 8px;
      background: #202020;
    }
    .volt-lora-item {
      display: grid;
      grid-template-columns: 64px 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 8px;
      border-bottom: 1px solid #303030;
      cursor: pointer;
    }
    .volt-lora-item:hover,
    .volt-lora-item.active {
      background: #2b2b2b;
    }
    .volt-lora-thumb,
    .volt-lora-preview {
      display: grid;
      place-items: center;
      color: #777;
      background: #121212;
      border: 1px solid #303030;
      border-radius: 6px;
      overflow: hidden;
    }
    .volt-lora-thumb {
      width: 64px;
      height: 64px;
      font-size: 11px;
    }
    .volt-lora-thumb img,
    .volt-lora-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .volt-lora-item-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: #f0f0f0;
      font-weight: 700;
    }
    .volt-lora-item-dir {
      margin-top: 4px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: #8f8f8f;
      font-size: 12px;
    }
    .volt-lora-side {
      display: grid;
      grid-template-rows: 260px auto auto 1fr;
      gap: 10px;
      min-width: 0;
    }
    .volt-lora-preview {
      width: 100%;
      height: 260px;
    }
    .volt-lora-side-name {
      min-height: 36px;
      overflow-wrap: anywhere;
      color: #f0f0f0;
      font-weight: 700;
      line-height: 1.35;
    }
    .volt-lora-selected {
      min-height: 92px;
      overflow: auto;
      padding: 8px;
      border: 1px solid #303030;
      border-radius: 8px;
      background: #202020;
      color: #bbb;
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
    .volt-lora-close {
      height: 34px;
      border-radius: 7px;
      cursor: pointer;
      border: 1px solid #333;
      background: #1f1f1f;
      color: #e5e5e5;
      font-weight: 700;
    }
    .volt-lora-chip button {
      width: 28px;
      height: 24px;
      color: #ffd7d7;
      background: #711c1c;
      border-color: #904343;
    }
    .volt-lora-side-actions {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }
    .volt-lora-load {
      color: #d9ffe0;
      background: #1f622c;
      border-color: #2f8c42;
    }
    .volt-lora-remove {
      color: #ffd7d7;
      background: #711c1c;
      border-color: #904343;
    }
    .volt-lora-empty {
      padding: 16px;
      color: #999;
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
        <div class="volt-lora-list"><div class="volt-lora-empty">Loading LoRAs...</div></div>
        <div class="volt-lora-side">
          <div class="volt-lora-preview">No preview</div>
          <div class="volt-lora-side-name">Select a LoRA</div>
          <div>
            <input class="volt-lora-side-strength" type="number" value="1.00" step="0.01" min="-100" max="100" title="Strength">
            <input class="volt-lora-side-note" type="text" placeholder="Note..." title="Note" style="margin-top:8px">
          </div>
          <div class="volt-lora-side-actions">
            <button class="volt-lora-load" type="button">Load</button>
            <button class="volt-lora-remove" type="button">Remove</button>
            <button class="volt-lora-close" type="button">Close</button>
          </div>
          <div class="volt-lora-selected"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const modal = backdrop.querySelector(".volt-lora-modal");
  const search = backdrop.querySelector(".volt-lora-search");
  const list = backdrop.querySelector(".volt-lora-list");
  const count = backdrop.querySelector(".volt-lora-count");
  const preview = backdrop.querySelector(".volt-lora-preview");
  const sideName = backdrop.querySelector(".volt-lora-side-name");
  const strength = backdrop.querySelector(".volt-lora-side-strength");
  const note = backdrop.querySelector(".volt-lora-side-note");
  const selectedBox = backdrop.querySelector(".volt-lora-selected");
  const loadButton = backdrop.querySelector(".volt-lora-load");
  const removeButton = backdrop.querySelector(".volt-lora-remove");
  let catalog = [];
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
    sideName.textContent = item.name;
    preview.innerHTML = item.preview ? `<img src="${item.preview}" alt="">` : "No preview";
    const existing = rows.find((row) => row.name === item.name);
    strength.value = Number(existing?.strength_model ?? 1).toFixed(2);
    note.value = existing?.note || "";
    list.querySelectorAll(".volt-lora-item").forEach((element) => {
      element.classList.toggle("active", element.dataset.name === item.name);
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
    const filtered = catalog.filter((item) => item.name.toLowerCase().includes(query));
    count.textContent = `${filtered.length} LoRAs`;
    if (!filtered.length) {
      list.innerHTML = `<div class="volt-lora-empty">No matching LoRA</div>`;
      return;
    }

    list.innerHTML = filtered.map((item) => `
      <div class="volt-lora-item${selected?.name === item.name ? " active" : ""}" data-name="${escapeHtml(item.name)}">
        <div class="volt-lora-thumb">${item.preview ? `<img src="${item.preview}" alt="">` : "No preview"}</div>
        <div>
          <div class="volt-lora-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
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
  };

  loadButton.addEventListener("click", loadSelected);
  removeButton.addEventListener("click", removeSelected);
  search.addEventListener("input", renderList);
  renderSelected(selectedBox, rows, (index) => {
    rows.splice(index, 1);
    commit();
  });

  loadLoraCatalog().then((items) => {
    catalog = items;
    renderList();
    if (catalog[0]) selectItem(catalog[0]);
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
