import { defineElement } from "../shared/element.js";
import { MenuElement } from "../menu/index.js";

declare global {
  interface HTMLElementTagNameMap {
    "appret-menu": MenuElement;
  }
}

defineElement("appret-menu", MenuElement);
