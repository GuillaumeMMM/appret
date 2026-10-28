import {
  closestElementOfType,
  enumAttribute,
  HTMLElementBase,
} from "../shared/element.js";
import {
  MenuController,
  type MenuControllerConfig,
  type MenuItem,
} from "./controller.js";

type MenuParts = Pick<MenuControllerConfig, "items" | "separators"> & {
  menu?: MenuControllerConfig["menu"];
};

export class MenuElement extends HTMLElementBase {
  static observedAttributes = ["label", "labelledby", "orientation", "loop"];
  #controller?: MenuController;
  #parts?: MenuParts;
  #savedChecked?: Map<HTMLElement, string>;
  #lastFocused: Element | null = null;
  #listeners?: AbortController;
  #observer = new MutationObserver(() => this.#onMutation());

  connectedCallback() {
    //  Listen to focus change and observe DOM changes
    this.#listeners = new AbortController();
    this.addEventListener(
      "focusin",
      (e) => {
        this.#lastFocused = e.target as Element;
      },
      {
        signal: this.#listeners.signal,
      },
    );

    this.addEventListener(
      "focusout",
      (e) => {
        if (!(e.target as Element).isConnected) {
          return;
        }
        const next = e.relatedTarget as Node | null;
        if (!next || !this.contains(next)) {
          this.#lastFocused = null;
        }
      },
      { signal: this.#listeners.signal },
    );

    this.#observer.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-appret-part"],
    });

    //  connectedCallback can be called before the browser has finished parsing HTML
    //  In that case defer the initialization
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.#init(), {
        once: true,
      });
    } else {
      this.#init();
    }
  }

  attributeChangedCallback() {
    this.#synchronize({ attributesChanged: true });
  }

  #onMutation() {
    this.#synchronize();
  }

  #synchronize(
    { attributesChanged } = {
      attributesChanged: false,
    },
  ) {
    if (!this.isConnected || document.readyState === "loading") {
      return;
    }

    const parts = this.#getParts();

    if (!parts.menu) {
      return;
    }

    if (!this.#controller) {
      this.#init();
      return;
    }

    if (!attributesChanged && areSameParts(parts, this.#parts!)) {
      //  No significant change
      return;
    }

    const focusLost = this.#focusWasLost();

    try {
      this.#controller.update({ ...parts, ...this.#getAttributeConfig() });
    } catch (error) {
      console.warn("Appret menu: ignored an invalid change.", error);
      return;
    }
    this.#parts = parts;
    if (focusLost) this.#controller.focus();
  }

  #focusWasLost(): boolean {
    return (
      this.#lastFocused !== null &&
      !this.#lastFocused.isConnected &&
      (document.activeElement === null ||
        document.activeElement === document.body)
    );
  }

  #init() {
    //  If the element was disconected before the DOM finished loading
    if (!this.isConnected || this.#controller) {
      return;
    }

    const parts = this.#getParts();

    //  There is a format issue or the parts will be injected later
    if (!parts.menu) {
      return;
    }

    for (const [element, checked] of this.#savedChecked ?? []) {
      if (this.contains(element)) {
        element.setAttribute("aria-checked", checked);
      }
    }
    this.#savedChecked = undefined;

    try {
      this.#controller = new MenuController(this, {
        ...parts,
        ...this.#getAttributeConfig(),
      } as MenuControllerConfig);

      this.#parts = parts;
    } catch (error) {
      console.warn("Appret menu: couldn't set up <appret-menu>.", error);
    }
  }

  #getParts(): MenuParts {
    const own = (selector: string, root: Element = this) =>
      [...root.querySelectorAll<HTMLElement>(selector)].filter(
        (el) => closestElementOfType(el, MenuElement) === this,
      );

    const partElementToItem = (el: HTMLElement): MenuItem => {
      //  data-appret-part can hold several space-separated parts
      const parts = (el.dataset.appretPart ?? "").split(/\s+/);
      if (parts.includes("menu.checkbox")) {
        return { type: "checkbox", element: el };
      }
      if (parts.includes("menu.radio")) {
        return { type: "radio", element: el };
      }
      return el;
    };

    const itemSelector =
      '[data-appret-part~="menu.item"], [data-appret-part~="menu.checkbox"], [data-appret-part~="menu.radio"]';
    const groupSelector = '[data-appret-part~="menu.group"]';

    const items: MenuParts["items"] = [];

    for (const el of own(`${itemSelector}, ${groupSelector}`)) {
      //  Items inside a group are added with their group
      const group = el.parentElement?.closest(groupSelector);
      if (group && closestElementOfType(group, MenuElement) === this) {
        continue;
      }

      if (!el.matches(groupSelector)) {
        //  Add items tht dont belong to a group
        items.push(partElementToItem(el));
        continue;
      }

      //    Add all items tht have groups
      const label = own('[data-appret-part~="menu.group-label"]', el)[0];
      items.push({
        group: el,
        items: own(itemSelector, el).map(partElementToItem),
        label: label
          ? label.id
            ? { byId: label.id }
            : { byElements: [label] }
          : undefined,
      });
    }

    return {
      menu: own('[data-appret-part~="menu.menu"]')[0],
      separators: own('[data-appret-part~="menu.separator"]'),
      items,
    };
  }

  #getAttributeConfig() {
    const labelledBy = this.getAttribute("labelledby");

    return {
      //  label wins over labelledby when both are set
      label:
        this.getAttribute("label") ??
        (labelledBy === null ? undefined : { byId: labelledBy }),

      //  Make sure that `orientation` has a valid value
      orientation: enumAttribute(
        this,
        "orientation",
        ["horizontal", "vertical"],
        "Appret menu",
      ),

      loop:
        this.getAttribute("loop") === null
          ? undefined
          : this.getAttribute("loop") !== "false",
    };
  }

  disconnectedCallback() {
    this.#observer.disconnect();

    this.#savedChecked = checkedStates(this.#parts);
    this.#controller?.destroy();
    this.#controller = undefined;
    this.#listeners?.abort();
  }

  //  API
  focusFirst(): void {
    if (this.#controller) {
      this.#controller.focusFirst();
    }
  }

  focusLast(): void {
    if (this.#controller) {
      this.#controller.focusLast();
    }
  }

  override focus(options?: FocusOptions): void {
    this.#controller?.focus(undefined, options);
  }
}

function flatPartsToCheck({ menu, separators, items }: MenuParts): unknown[] {
  const normalizeMenuItem = (item: MenuItem) =>
    "element" in item ? [item.element, item.type] : [item, "item"];

  return [
    menu,
    ...(separators ?? []),
    ...items.flatMap((entry) => {
      if (!("group" in entry)) {
        return normalizeMenuItem(entry);
      }
      const label =
        typeof entry.label === "object"
          ? (entry.label.byId ?? entry.label.byElements?.[0])
          : entry.label;
      //  The group again at the end, so moving an item in or out of it counts
      return [
        entry.group,
        label,
        ...entry.items.flatMap(normalizeMenuItem),
        entry.group,
      ];
    }),
  ];
}

function areSameParts(a: MenuParts, b: MenuParts): boolean {
  const x = flatPartsToCheck(a);
  const y = flatPartsToCheck(b);
  return x.length === y.length && x.every((key, i) => key === y[i]);
}

function checkedStates(parts?: MenuParts): Map<HTMLElement, string> {
  const states = new Map<HTMLElement, string>();
  for (const entry of parts?.items ?? []) {
    for (const item of "group" in entry ? entry.items : [entry]) {
      const checked =
        "element" in item ? item.element.getAttribute("aria-checked") : null;
      if ("element" in item && item.type !== "item" && checked !== null) {
        states.set(item.element, checked);
      }
    }
  }
  return states;
}
