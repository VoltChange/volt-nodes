const STYLE_ID = "volt-multi-lora-layout-patch";

function injectLayoutPatch() {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = `
    .volt-lora-node-row {
      height: 56px !important;
      padding: 6px !important;
      align-items: center !important;
      justify-items: stretch !important;
      border-radius: 8px !important;
    }
    .volt-lora-switch {
      align-self: center !important;
      justify-self: center !important;
      width: 50px !important;
      height: 34px !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    .volt-lora-switch::after {
      top: 4px !important;
      left: 18px !important;
      width: 24px !important;
      height: 24px !important;
    }
    .volt-lora-switch.off::after {
      left: 6px !important;
    }
    .volt-lora-name,
    .volt-lora-note,
    .volt-lora-strength {
      align-self: center !important;
      box-sizing: border-box !important;
      height: 38px !important;
      margin: 0 !important;
      line-height: 38px !important;
      font-family: Arial, sans-serif !important;
    }
    .volt-lora-name {
      display: flex !important;
      align-items: center !important;
      padding: 0 12px !important;
      line-height: 1 !important;
    }
    .volt-lora-del {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      align-self: center !important;
      justify-self: center !important;
      width: 42px !important;
      height: 40px !important;
      padding: 0 !important;
      margin: 0 !important;
      line-height: 1 !important;
      font-family: Arial, sans-serif !important;
    }
    .volt-lora-del .volt-lora-icon {
      width: 18px !important;
      height: 18px !important;
    }
    .volt-lora-empty-node {
      height: 56px !important;
    }
  `;
}

injectLayoutPatch();
setTimeout(injectLayoutPatch, 0);
setTimeout(injectLayoutPatch, 1000);
