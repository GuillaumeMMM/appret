import { defineElement } from "../shared/element.js";
import { ListboxElement } from "../listbox/index.js";

declare global {
  interface HTMLElementTagNameMap {
    "appret-listbox": ListboxElement;
  }
}

defineElement("appret-listbox", ListboxElement);
