import { app } from "../../scripts/app.js";

const NODE_NAME = "VoltPromptSegments";
const MAX_SEGMENTS = 64;
const MAX_VISIBLE_SEGMENTS = 3;
const MIN_NODE_WIDTH = 720;
const SEGMENT_HEIGHT = 136;
const BASE_HEIGHT = 182;
const DEFAULT_SEPARATOR = ", ";

const ICONS = {
  plus: `<svg class="volt-prompt-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>`,
  close: `<svg class="volt-prompt-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"></path><path d="M18 6 6 18"></path></svg>`,
  text: `<svg class="volt-prompt-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M4 12h10"></path><path d="M4 17h14"></path></svg>`,
};

function widget(node, name) {
  return node.widgets?.find((item) => item.name === name);
}

function configWidget(node) {
  return widget(node, "segments_config");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function defaultSegments() {
  return [1].map((index) => ({
    enabled: true,
    label: `Segment ${index}`,
    text: "",
  }));
}

function normalizeSegment(segment, index = 0) {
  if (!segment || typeof segment !== "object") return null;
  return {
    enabled: segment.enabled !== false,
    label: String(segment.label || `Segment ${index + 1}`),
    text: String(segment.text || ""),
  };
}

function normalizeState(value) {
  const raw = value && typeof value === "object" ? value : {};
  const segments = Array.isArray(raw.segments)
    ? raw.segments.map(normalizeSegment).filter(Boolean).slice(0, MAX_SEGMENTS)
    : [];
  return {
    separator: typeof raw.separator === "string" ? raw.separator : DEFAULT_SEPARATOR,
    segments: segments.length ? segments : defaultSegments(),
  };
}

function parseState(value) {
  if (!value) return normalizeState({});
  if (typeof value === "object") return normalizeState(value);
  if (typeof value !== "string") return normalizeState({});
  try {
    return normalizeState(JSON.parse(value));
  } catch {
    return normalizeState({});
  }
}

function stateFromSerialized(values) {
  if (!Array.isArray(values)) return null;
  const raw = values.find((value) => typeof value === "string" && value.trim().startsWith("{") && value.includes("segments"));
  return raw ? parseState(raw) : null;
}

function jsonValue(state) {
  const normalized = normalizeState(state);
  return JSON.stringify({
    separator: normalized.separator,
    segments: normalized.segments,
  });
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
  item.serializeValue = () => item.value || jsonValue(normalizeState({}));
  item.computedHeight = 0;
  item.y = -100000;
  item.last_y = -100000;
  detachWidgetDom(item);
}

function readState(node) {
  const direct = parseState(configWidget(node)?.value);
  const serialized = stateFromSerialized(node.__voltPromptSerialized?.widgets_values);
  return serialized || direct;
}

function resizeNode(node, segmentCount = 0) {
  const width = Math.max(node.size?.[0] || 0, MIN_NODE_WIDTH);
  const visibleSegments = Math.max(1, Math.min(segmentCount || 0, MAX_VISIBLE_SEGMENTS));
  const height = BASE_HEIGHT + visibleSegments * SEGMENT_HEIGHT;
  node.setSize?.([width, height]);
  if (!node.setSize) node.size = [width, height];
}

function setState(node, state, { render = true } = {}) {
  const normalized = normalizeState(state);
  node._voltPromptState = normalized;
  const item = configWidget(node);
  if (item) item.value = jsonValue(normalized);
  if (render) node.__voltPromptRender?.();
  resizeNode(node, normalized.segments.length);
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function ensureStyles() {
  let style = document.getElementById("volt-prompt-segments-styles");
  if (!style) {
    style = document.createElement("style");
    style.id = "volt-prompt-segments-styles";
  }
  style.textContent = `
    .volt-prompt-root {
      --volt-bg: #090d13;
      --volt-panel: #111820;
      --volt-panel-2: #151d27;
      --volt-border: #273444;
      --volt-border-soft: #22303e;
      --volt-cyan: #42d7ff;
      --volt-violet: #8b6fff;
      --volt-green: #1d6f3f;
      --volt-green-border: #2aae64;
      --volt-red: #7c1d28;
      --volt-red-border: #b74352;
      --volt-text: #edf4ff;
      --volt-text-soft: #b5c0cf;
      --volt-muted: #738195;
      overflow: visible !important;
    }
    .volt-prompt-icon {
      width: 15px;
      height: 15px;
      flex: 0 0 auto;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: .88;
    }
    .volt-prompt-node {
      box-sizing: border-box;
      position: relative;
      width: 100%;
      min-width: 0;
      padding: 14px;
      color: var(--volt-text);
      font: 13px Arial, sans-serif;
      user-select: none;
      overflow: hidden;
      background:
        linear-gradient(180deg, rgba(20,29,39,.96), rgba(9,13,19,.96)),
        radial-gradient(circle at 18% 0%, rgba(66,215,255,.13), transparent 34%),
        radial-gradient(circle at 82% 100%, rgba(139,111,255,.11), transparent 38%);
      border: 1px solid rgba(66,215,255,.18);
      border-radius: 10px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.035), 0 0 0 1px rgba(139,111,255,.045), 0 10px 26px rgba(0,0,0,.20);
    }
    .volt-prompt-node::before {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(66,215,255,.55), rgba(139,111,255,.34), transparent);
      opacity: .65;
      pointer-events: none;
    }
    .volt-prompt-toolbar {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
      color: var(--volt-text-soft);
    }
    .volt-prompt-toolbar-title {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-weight: 700;
      color: var(--volt-text);
    }
    .volt-prompt-separator-wrap {
      display: grid;
      grid-template-columns: auto minmax(180px, 1fr);
      gap: 8px;
      align-items: center;
      min-width: 0;
      color: var(--volt-muted);
      font-size: 12px;
    }
    .volt-prompt-separator {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 34px;
      padding: 0 10px;
      color: var(--volt-text);
      background: rgba(18,25,34,.95);
      border: 1px solid rgba(45,62,80,.95);
      border-radius: 6px;
      outline: none;
      transition: border-color .14s ease, box-shadow .14s ease, background .14s ease;
    }
    .volt-prompt-separator:focus,
    .volt-prompt-label:focus,
    .volt-prompt-text:focus {
      border-color: rgba(66,215,255,.70);
      box-shadow: 0 0 0 1px rgba(66,215,255,.12), 0 0 18px rgba(66,215,255,.08);
      background: rgba(20,29,39,.98);
    }
    .volt-prompt-list {
      display: grid;
      gap: 10px;
      overflow-x: hidden;
      overflow-y: hidden;
    }
    .volt-prompt-list.scrolling {
      max-height: ${MAX_VISIBLE_SEGMENTS * SEGMENT_HEIGHT}px;
      overflow-y: auto;
      padding-right: 6px;
    }
    .volt-prompt-list.scrolling {
      scrollbar-width: thin;
      scrollbar-color: rgba(50, 78, 98, .96) rgba(5, 8, 13, .36);
    }
    .volt-prompt-list.scrolling::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    .volt-prompt-list.scrolling::-webkit-scrollbar-track {
      background: rgba(5, 8, 13, .36);
      border-radius: 999px;
    }
    .volt-prompt-list.scrolling::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, rgba(26,41,56,.98), rgba(14,22,33,.98));
      border: 0;
      border-left: 3px solid rgba(118, 232, 255, .92);
      border-right: 1px solid rgba(164, 143, 255, .48);
      border-radius: 999px;
      box-shadow: inset 1px 0 0 rgba(235, 255, 255, .35), inset 0 0 0 1px rgba(5, 8, 13, .58);
    }
    .volt-prompt-list.scrolling::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, rgba(33,51,68,.98), rgba(17,27,40,.98));
      border-left-color: rgba(142, 240, 255, 1);
      border-right-color: rgba(178, 160, 255, .62);
      box-shadow: inset 1px 0 0 rgba(240, 255, 255, .48), inset 0 0 0 1px rgba(5, 8, 13, .50);
    }
    .volt-prompt-card {
      box-sizing: border-box;
      height: 126px;
      min-width: 0;
      overflow: hidden;
      background: linear-gradient(180deg, rgba(19,29,39,.96), rgba(10,16,23,.96));
      border: 1px solid rgba(66,215,255,.38);
      border-radius: 8px;
      box-shadow: inset 0 0 0 1px rgba(139,111,255,.045), 0 0 16px rgba(66,215,255,.075);
      transition: border-color .14s ease, box-shadow .14s ease, background .14s ease, transform .14s ease, opacity .14s ease;
    }
    .volt-prompt-card.disabled {
      border-color: var(--volt-border);
      box-shadow: none;
      opacity: .70;
    }
    .volt-prompt-card:hover {
      background: linear-gradient(180deg, rgba(24,36,48,.98), rgba(12,19,27,.98));
      border-color: rgba(66,215,255,.64);
      box-shadow: inset 0 0 0 1px rgba(139,111,255,.10), 0 0 18px rgba(66,215,255,.13);
      transform: translateY(-1px);
    }
    .volt-prompt-card-head {
      display: grid;
      grid-template-columns: 44px auto minmax(120px, 1fr) 38px;
      gap: 8px;
      align-items: center;
      height: 40px;
      padding: 6px 8px;
      background: linear-gradient(90deg, rgba(66,215,255,.10), rgba(139,111,255,.09));
      border-bottom: 1px solid rgba(39,52,68,.86);
    }
    .volt-prompt-index {
      color: var(--volt-muted);
      font-variant-numeric: tabular-nums;
      font-size: 12px;
    }
    .volt-prompt-label,
    .volt-prompt-text {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      color: var(--volt-text);
      background: rgba(12,18,25,.95);
      border: 1px solid rgba(45,62,80,.95);
      outline: none;
      font-family: Arial, sans-serif;
      transition: border-color .14s ease, box-shadow .14s ease, background .14s ease;
    }
    .volt-prompt-label {
      height: 30px;
      padding: 0 10px;
      border-radius: 6px;
      font-weight: 700;
    }
    .volt-prompt-text {
      height: 86px;
      padding: 9px 10px;
      border: 0;
      border-radius: 0;
      resize: none;
      line-height: 1.38;
      color: var(--volt-text-soft);
      background: rgba(8,11,18,.78);
    }
    .volt-prompt-switch {
      position: relative;
      justify-self: center;
      width: 34px;
      height: 24px;
      padding: 0;
      margin: 0;
      border: 1px solid var(--volt-green-border);
      border-radius: 999px;
      background: linear-gradient(180deg, #20864a, var(--volt-green));
      cursor: pointer;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.06), 0 0 12px rgba(42,174,100,.14);
      transition: background .12s ease, border-color .12s ease, box-shadow .12s ease, filter .12s ease;
    }
    .volt-prompt-switch::after {
      content: "";
      position: absolute;
      top: 3px;
      left: 14px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #e8fff5;
      box-shadow: 0 1px 4px rgba(0,0,0,.35);
      transition: left .12s ease, background .12s ease;
    }
    .volt-prompt-switch.off {
      background: #29313b;
      border-color: #526070;
      box-shadow: none;
    }
    .volt-prompt-switch.off::after {
      left: 4px;
      background: #93a0b0;
    }
    .volt-prompt-remove {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border: 1px solid var(--volt-red-border);
      border-radius: 7px;
      color: #ffe2e5;
      background: linear-gradient(180deg, #9a202a, var(--volt-red));
      cursor: pointer;
      transition: filter .12s ease, border-color .12s ease, box-shadow .12s ease;
    }
    .volt-prompt-add {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      height: 46px;
      margin-top: 12px;
      border: 1px solid rgba(139,111,255,.42);
      border-radius: 8px;
      color: #b7a8ff;
      background: linear-gradient(180deg, rgba(18,28,39,.98), rgba(9,14,21,.98));
      cursor: pointer;
      font-size: 16px;
      font-weight: 700;
      box-shadow: inset 0 0 0 1px rgba(66,215,255,.06), 0 0 16px rgba(139,111,255,.08);
      transition: color .14s ease, border-color .14s ease, box-shadow .14s ease, filter .14s ease, background .14s ease;
    }
    .volt-prompt-add:hover {
      color: #cfc5ff;
      border-color: rgba(66,215,255,.55);
      background: linear-gradient(180deg, rgba(22,34,47,.98), rgba(11,17,25,.98));
      box-shadow: inset 0 0 0 1px rgba(66,215,255,.10), 0 0 20px rgba(66,215,255,.10), 0 0 18px rgba(139,111,255,.10);
    }
    .volt-prompt-remove:hover,
    .volt-prompt-switch:hover {
      filter: brightness(1.1);
    }
  `;
  if (!style.isConnected) document.head.appendChild(style);
}

function renderPromptNode(node, root) {
  const state = normalizeState(node._voltPromptState || readState(node));
  const scrolling = state.segments.length > MAX_VISIBLE_SEGMENTS;
  root.innerHTML = `
    <div class="volt-prompt-node">
      <div class="volt-prompt-toolbar">
        <div class="volt-prompt-toolbar-title">${ICONS.text}<span>Prompt Segments</span></div>
        <label class="volt-prompt-separator-wrap">
          <span>Separator</span>
          <input class="volt-prompt-separator" type="text" value="${escapeHtml(state.separator)}" placeholder=", " title="Join enabled segments with this text">
        </label>
      </div>
      <div class="volt-prompt-list${scrolling ? " scrolling" : ""}">
        ${state.segments.map((segment, index) => `
          <div class="volt-prompt-card${segment.enabled ? "" : " disabled"}" data-index="${index}">
            <div class="volt-prompt-card-head">
              <button class="volt-prompt-switch${segment.enabled ? "" : " off"}" type="button" title="${segment.enabled ? "Enabled" : "Disabled"}"></button>
              <span class="volt-prompt-index">#${index + 1}</span>
              <input class="volt-prompt-label" type="text" value="${escapeHtml(segment.label)}" placeholder="Label..." title="Segment label">
              <button class="volt-prompt-remove" type="button" title="Delete">${ICONS.close}</button>
            </div>
            <textarea class="volt-prompt-text" placeholder="Enter segment ${index + 1} prompt...">${escapeHtml(segment.text)}</textarea>
          </div>
        `).join("")}
      </div>
      <button class="volt-prompt-add" type="button">${ICONS.plus}<span>Add Segment</span></button>
    </div>
  `;

  const commit = ({ render = false } = {}) => setState(node, state, { render });

  root.querySelector(".volt-prompt-separator").addEventListener("input", (event) => {
    state.separator = event.target.value;
    commit();
  });

  root.querySelectorAll(".volt-prompt-card").forEach((card) => {
    const index = Number(card.dataset.index);
    card.querySelector(".volt-prompt-switch").addEventListener("click", () => {
      state.segments[index].enabled = !state.segments[index].enabled;
      commit({ render: true });
    });
    card.querySelector(".volt-prompt-remove").addEventListener("click", () => {
      state.segments.splice(index, 1);
      if (!state.segments.length) state.segments.push(...defaultSegments().slice(0, 1));
      commit({ render: true });
    });
    card.querySelector(".volt-prompt-label").addEventListener("input", (event) => {
      state.segments[index].label = event.target.value;
      commit();
    });
    card.querySelector(".volt-prompt-text").addEventListener("input", (event) => {
      state.segments[index].text = event.target.value;
      commit();
    });
  });

  root.querySelector(".volt-prompt-add").addEventListener("click", () => {
    if (state.segments.length >= MAX_SEGMENTS) return;
    state.segments.push({
      enabled: true,
      label: `Segment ${state.segments.length + 1}`,
      text: "",
    });
    commit({ render: true });
  });

  resizeNode(node, state.segments.length);
}

function installPromptPanel(node) {
  ensureStyles();
  hideConfigWidget(node);

  if (!node.addDOMWidget) return;
  if (node.__voltPromptDomWidget) {
    node.__voltPromptRender?.();
    return;
  }

  const root = document.createElement("div");
  root.className = "volt-prompt-root";
  root.addEventListener("pointerdown", (event) => event.stopPropagation());
  root.addEventListener("mousedown", (event) => event.stopPropagation());
  root.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });

  const domWidget = node.addDOMWidget("volt_prompt_segments", "custom", root, {
    getValue() {
      return "";
    },
    setValue() {},
  });
  domWidget.serialize = false;
  domWidget.computeSize = () => {
    const state = normalizeState(node._voltPromptState || readState(node));
    const visibleSegments = Math.max(1, Math.min(state.segments.length || 0, MAX_VISIBLE_SEGMENTS));
    return [Math.max(node.size?.[0] || 0, MIN_NODE_WIDTH) - 16, BASE_HEIGHT + visibleSegments * SEGMENT_HEIGHT - 8];
  };

  node.__voltPromptDomWidget = domWidget;
  node.__voltPromptRender = () => renderPromptNode(node, root);
  node.__voltPromptRender();
}

app.registerExtension({
  name: "volt.prompt_segments",
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
      setState(this, readState(this), { render: false });
      installPromptPanel(this);
      return result;
    };

    nodeType.prototype.onConfigure = function (serialized) {
      this.__voltPromptSerialized = serialized;
      const restoredState = stateFromSerialized(serialized?.widgets_values);
      const result = onConfigure?.apply(this, arguments);
      setState(this, restoredState || readState(this), { render: false });
      installPromptPanel(this);
      return result;
    };

    nodeType.prototype.onSerialize = function (data) {
      setState(this, this._voltPromptState || readState(this), { render: false });
      const result = onSerialize?.apply(this, arguments);
      if (data && this.size) data.size = this.size;
      return result;
    };

    nodeType.prototype.serialize = function () {
      setState(this, this._voltPromptState || readState(this), { render: false });
      const data = serialize?.apply(this, arguments);
      if (data && this.size) data.size = this.size;
      return data;
    };

    nodeType.prototype.onDrawForeground = function () {
      const result = onDrawForeground?.apply(this, arguments);
      hideConfigWidget(this);
      if (!this.__voltPromptDomWidget) installPromptPanel(this);
      return result;
    };
  },
});
