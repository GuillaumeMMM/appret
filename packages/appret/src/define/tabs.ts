import { defineElement } from "../shared/element.js";
import { TabsElement } from "../tabs/index.js";

declare global {
  interface HTMLElementTagNameMap {
    "appret-tabs": TabsElement;
  }
}

defineElement("appret-tabs", TabsElement);
