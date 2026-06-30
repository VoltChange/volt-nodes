import { app } from "../../scripts/app.js";

const NODE_NAME = "VoltPromptSegments";
const MAX_SEGMENTS = 64;
const MAX_VISIBLE_SEGMENTS = 3;
const MIN_NODE_WIDTH = 480;
const SEGMENT_HEIGHT = 108;
const BASE_HEIGHT = 158;
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
      padding: 10px 14px 12px;
      color: var(--volt-text);
      font: 13px Arial, sans-serif;
      user-select: none;
      overflow: hidden;
      background: transparent;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .volt-prompt-node::before {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      height: 1px;
      background: transparent;
      opacity: 0;
      pointer-events: none;
    }
    .volt-prompt-toolbar {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
      color: #b4b4b4;
    }
    .volt-prompt-toolbar-title {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      font-weight: 700;
      color: var(--volt-text);
    }
    .volt-prompt-separator-wrap {
      display: grid;
      grid-template-columns: auto minmax(110px, 1fr);
      gap: 8px;
      align-items: center;
      min-width: 0;
      color: #9a9a9a;
      font-size: 12px;
    }
    .volt-prompt-separator {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 30px;
      padding: 0 10px;
      color: var(--volt-text);
      background: #1e1e22;
      border: 1px solid #454854;
      border-radius: 6px;
      outline: none;
      transition: border-color .14s ease, box-shadow .14s ease, background .14s ease;
    }
    .volt-prompt-separator:focus,
    .volt-prompt-label:focus,
    .volt-prompt-text:focus {
      border-color: rgba(66,215,255,.70);
      box-shadow: 0 0 0 1px rgba(74,151,255,.16);
      background: #24242a;
    }
    .volt-prompt-list {
      display: grid;
      gap: 8px;
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
      scrollbar-color: #555b66 rgba(30,30,30,.34);
    }
    .volt-prompt-list.scrolling::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .volt-prompt-list.scrolling::-webkit-scrollbar-track {
      background: rgba(30,30,30,.34);
      border-radius: 999px;
    }
    .volt-prompt-list.scrolling::-webkit-scrollbar-thumb {
      background: #4a505a;
      border: 2px solid rgba(30,30,30,.34);
      border-radius: 999px;
      box-shadow: none;
    }
    .volt-prompt-list.scrolling::-webkit-scrollbar-thumb:hover {
      background: #606875;
      border-color: rgba(30,30,30,.26);
      box-shadow: none;
    }
    .volt-prompt-card {
      box-sizing: border-box;
      height: 100px;
      min-width: 0;
      overflow: hidden;
      background: #24242b;
      border: 1px solid #3d4050;
      border-radius: 8px;
      box-shadow: inset 3px 0 0 rgba(74,151,255,.76);
      transition: border-color .14s ease, box-shadow .14s ease, background .14s ease, opacity .14s ease;
    }
    .volt-prompt-card.disabled {
      border-color: #383838;
      box-shadow: none;
      opacity: .70;
    }
    .volt-prompt-card:hover {
      background: #2a2a33;
      border-color: #5a6478;
      box-shadow: inset 3px 0 0 rgba(83,158,255,.86);
    }
    .volt-prompt-card-head {
      display: grid;
      grid-template-columns: 40px auto minmax(80px, 1fr) 34px;
      gap: 8px;
      align-items: center;
      height: 34px;
      padding: 4px 8px;
      background: #302f3e;
      border-bottom: 1px solid #3d3d46;
    }
    .volt-prompt-index {
      color: #8e8e98;
      font-variant-numeric: tabular-nums;
      font-size: 12px;
    }
    .volt-prompt-label,
    .volt-prompt-text {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      color: var(--volt-text);
      background: #1e1e22;
      border: 1px solid #454854;
      outline: none;
      font-family: Arial, sans-serif;
      transition: border-color .14s ease, box-shadow .14s ease, background .14s ease;
    }
    .volt-prompt-label {
      height: 26px;
      padding: 0 10px;
      border-radius: 6px;
      font-weight: 700;
    }
    .volt-prompt-text {
      height: 64px;
      padding: 7px 10px;
      border: 0;
      border-radius: 0;
      resize: none;
      line-height: 1.38;
      color: #bfbfc6;
      background: #19191f;
    }
    .volt-prompt-switch {
      position: relative;
      justify-self: center;
      width: 32px;
      height: 24px;
      padding: 0;
      margin: 0;
      border: 1px solid #2f9b62;
      border-radius: 999px;
      background: #23834c;
      cursor: pointer;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
      transition: background .12s ease, border-color .12s ease, box-shadow .12s ease, filter .12s ease;
    }
    .volt-prompt-switch::after {
      content: "";
      position: absolute;
      top: 3px;
      left: 13px;
      width: 15px;
      height: 15px;
      border-radius: 50%;
      background: #e6f5ec;
      box-shadow: 0 1px 4px rgba(0,0,0,.35);
      transition: left .12s ease, background .12s ease;
    }
    .volt-prompt-switch.off {
      background: #3a3a3a;
      border-color: #5a5a5a;
      box-shadow: none;
    }
    .volt-prompt-switch.off::after {
      left: 4px;
      background: #a2a2a2;
    }
    .volt-prompt-remove {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid #9a3942;
      border-radius: 7px;
      color: #f3d5d7;
      background: #8b242c;
      cursor: pointer;
      transition: filter .12s ease, border-color .12s ease, box-shadow .12s ease;
    }
    .volt-prompt-add {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      height: 40px;
      margin-top: 8px;
      border: 1px dashed #4f74ad;
      border-radius: 8px;
      color: #56a8ff;
      background: #2d2d2d;
      cursor: pointer;
      font-size: 16px;
      font-weight: 700;
      box-shadow: none;
      transition: color .14s ease, border-color .14s ease, box-shadow .14s ease, filter .14s ease, background .14s ease;
    }
    .volt-prompt-add:hover {
      color: #7dbcff;
      border-color: #6aa8ec;
      background: #333333;
      box-shadow: none;
    }
    .volt-prompt-remove:hover,
    .volt-prompt-switch:hover {
      filter: brightness(1.08);
    }
  `;
  if (!style.isConnected) document.head.appendChild(style);
}

function renderPromptNode(node, root) {
  const state = normalizeState(node._voltPromptState || readState(node));
  const scrolling = state.segments.length > MAX_VISIBLE_SEGMENTS;
  const previousList = root.querySelector(".volt-prompt-list");
  const previousScrollTop = previousList?.scrollTop || 0;
  const wasNearBottom = previousList
    ? previousList.scrollTop + previousList.clientHeight >= previousList.scrollHeight - 4
    : false;
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

  const list = root.querySelector(".volt-prompt-list");
  if (list && previousList) {
    list.scrollTop = wasNearBottom ? list.scrollHeight : previousScrollTop;
  }

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
