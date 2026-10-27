import { AttributeRecorder } from "../shared/attributeRecorder.js";
import { copyLists } from "../shared/copyLists.js";
import { triggerCustomEvent } from "../shared/customEvents.js";
import { setLabel, type Label } from "../shared/label.js";
import { isLink, isOpeningInNewTab } from "../shared/links.js";
import { flatTreeContains } from "../shared/tree.js";

type ItemType = "item" | "checkbox" | "radio";

type NormalizedItem = {
  element: HTMLElement;
  type: ItemType;
  //  The group to which the item is appended
  group: HTMLElement | null;
};

export type MenuItem =
  | HTMLElement
  | {
      type: ItemType;
      element: HTMLElement;
    };

export type MenuControllerConfig = {
  menu: HTMLElement;
  items: (
    | MenuItem
    | { group: HTMLElement; items: MenuItem[]; label?: Label }
  )[];
  separators?: HTMLElement[];
  label?: Label;
  orientation?: "horizontal" | "vertical";
  loop?: boolean;
};

export type MenuActivateDetail = {
  item: HTMLElement;
  checked?: boolean;
};

export type MenuCloseDetail = {
  reason: "escape" | "tab" | "activate";
};

export type MenuActivateEvent = CustomEvent<MenuActivateDetail>;
export type MenuCloseEvent = CustomEvent<MenuCloseDetail>;

declare global {
  interface HTMLElementEventMap {
    "appret-menu-activate": MenuActivateEvent;
    "appret-menu-close": MenuCloseEvent;
  }
}

export class MenuController {
  readonly host: HTMLElement;
  #config: MenuControllerConfig;
  #items: NormalizedItem[] = [];
  #attributeRecorder = new AttributeRecorder();
  #abort!: AbortController;
  #destroyed = false;
  #focusableItem?: NormalizedItem;

  constructor(host: HTMLElement, config: MenuControllerConfig) {
    this.host = host;

    this.#validateConfig(config);

    this.#config = copyLists(config);

    this.#setup();
  }

  #setup() {
    this.#abort = new AbortController();
    this.#items = normalizeItems(this.#config.items);

    this.#setAriaRoles();
    this.#setAriaChecked();
    this.#setLabels();
    this.#setOrientation();
    this.#setListeners();

    //  After an update, the tab stop stays on its item if it's still there
    const kept = this.#items.find(
      (i) => i.element === this.#focusableItem?.element && this.#canFocus(i),
    );

    const focusable = kept ?? this.#findFocusableItem(-1, 1) ?? this.#items[0];
    if (focusable) {
      this.#setFocusableItem(focusable);
    } else {
      this.#focusableItem = undefined;
    }
  }

  #areMenuItemsEqual(item1: NormalizedItem, item2: NormalizedItem) {
    return item1.element === item2.element;
  }

  #validateConfig(newConfig: MenuControllerConfig) {
    const { menu } = newConfig;

    const items = normalizeItems(newConfig.items);

    const outside = items.filter(
      (item) => !flatTreeContains(menu, item.element),
    );
    if (outside.length > 0) {
      console.warn("Appret menu: these items aren't inside `menu`:", outside);
    }
  }

  #setAriaRoles() {
    this.#attributeRecorder.set(this.#config.menu, "role", "menu");

    const groups = this.#config.items
      .filter((i) => "group" in i)
      .map((i) => ({ el: i.group, label: i.label }));

    for (const { el, label } of groups) {
      this.#attributeRecorder.set(el, "role", "group");

      if (label) {
        const labelsElements = setLabel(el, label, {
          recorder: this.#attributeRecorder,
          prefix: "Appret menu",
          name: "group",
        });

        this.#hideLabelRoles(labelsElements);
      }
    }

    for (const item of this.#items) {
      if (item.type === "checkbox") {
        this.#attributeRecorder.set(item.element, "role", "menuitemcheckbox");
        continue;
      }

      if (item.type === "radio") {
        this.#attributeRecorder.set(item.element, "role", "menuitemradio");
        continue;
      }

      this.#attributeRecorder.set(item.element, "role", "menuitem");
    }

    for (const separator of this.#config.separators ?? []) {
      this.#attributeRecorder.set(separator, "role", "separator");
      this.#attributeRecorder.set(
        separator,
        "aria-orientation",
        this.#config.orientation === "horizontal" ? "vertical" : "horizontal",
      );
    }
  }

  #setAriaChecked() {
    for (const item of this.#items) {
      const { type, element } = item;

      if (
        (type === "checkbox" || type === "radio") &&
        !element.hasAttribute("aria-checked")
      ) {
        this.#attributeRecorder.set(element, "aria-checked", "false");
      }
    }
  }

  #setLabels() {
    const labelsElements = setLabel(this.#config.menu, this.#config.label, {
      recorder: this.#attributeRecorder,
      prefix: "Appret menu",
      name: "menu",
    });

    this.#hideLabelRoles(labelsElements);
  }

  //  Add a presentation role for labels that would be inside the menu
  #hideLabelRoles(labelElements: Element[]) {
    for (const el of labelElements) {
      if (flatTreeContains(this.#config.menu, el)) {
        this.#attributeRecorder.set(el, "role", "presentation");
      }
    }
  }

  #setOrientation() {
    if (this.#config.orientation) {
      this.#attributeRecorder.set(
        this.#config.menu,
        "aria-orientation",
        this.#config.orientation,
      );
    }
  }

  #setFocusableItem(itemToMakeFocusable: NormalizedItem) {
    for (const item of this.#items) {
      if (this.#areMenuItemsEqual(item, itemToMakeFocusable)) {
        this.#attributeRecorder.set(item.element, "tabindex", "0");
      } else {
        this.#attributeRecorder.set(item.element, "tabindex", "-1");
      }
    }

    this.#focusableItem = itemToMakeFocusable;
  }

  #activateItem(
    itemToActivate: NormalizedItem,
    { notify = true, close = true } = {},
  ) {
    if (this.#isDisabled(itemToActivate)) {
      return;
    }

    const { type, element } = itemToActivate;

    let isChecked;

    if (type === "checkbox") {
      isChecked = element.getAttribute("aria-checked") !== "true";
      this.#attributeRecorder.set(element, "aria-checked", String(isChecked));
    }

    if (type === "radio") {
      isChecked = true;
      for (const other of this.#getRadioSetForItem(itemToActivate)) {
        this.#attributeRecorder.set(
          other.element,
          "aria-checked",
          String(this.#areMenuItemsEqual(other, itemToActivate)),
        );
      }
    }

    if (notify) {
      triggerCustomEvent(this.host, "appret-menu-activate", {
        item: element,
        checked: isChecked,
      });

      if (close) {
        triggerCustomEvent(
          this.host,
          "appret-menu-close",
          {
            reason: "activate",
          },
          { cancelable: true },
        );
      }
    }
  }

  #getRadioSetForItem(item: NormalizedItem): NormalizedItem[] {
    if (item.type !== "radio") {
      return [];
    }

    return this.#items.filter(
      (i) => i.group === item.group && i.type === "radio",
    );
  }

  #setListeners() {
    const { orientation } = this.#config;

    for (const [i, item] of this.#items.entries()) {
      item.element.addEventListener(
        "click",
        (e: MouseEvent) => {
          if (e.defaultPrevented || isOpeningInNewTab(e)) {
            return;
          }

          if (this.#isDisabled(item) && isLink(item.element)) {
            e.preventDefault();
            return;
          }

          this.#activateItem(item);
        },
        { signal: this.#abort.signal },
      );

      item.element.addEventListener(
        "keydown",
        (e: KeyboardEvent) => {
          if (e.defaultPrevented) {
            return;
          }

          if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) {
            return;
          }

          const previousItem = this.#findFocusableItem(i, -1);
          const nextItem = this.#findFocusableItem(i, 1);
          const rtl = getComputedStyle(this.#config.menu).direction === "rtl";

          let target;

          switch (e.key) {
            case "ArrowLeft": {
              if (orientation === "horizontal") {
                target = rtl ? nextItem : previousItem;
              }
              break;
            }
            case "ArrowRight": {
              if (orientation === "horizontal") {
                target = rtl ? previousItem : nextItem;
              }
              break;
            }
            case "ArrowUp": {
              if (orientation !== "horizontal") {
                target = previousItem;
              }
              break;
            }
            case "ArrowDown": {
              if (orientation !== "horizontal") {
                target = nextItem;
              }

              break;
            }
            case "Home": {
              target = this.#findFocusableItem(-1, 1);
              break;
            }
            case "End": {
              target = this.#findFocusableItem(this.#items.length, -1);
              break;
            }
            case "Enter":
            case " ": {
              e.preventDefault();

              if (isLink(item.element)) {
                if (!this.#isDisabled(item)) {
                  item.element.click();
                }
                break;
              }

              this.#activateItem(item, {
                close: e.key === "Enter" || item.type === "item",
              });
              break;
            }
            case "Escape": {
              e.preventDefault();
              triggerCustomEvent(
                this.host,
                "appret-menu-close",
                {
                  reason: "escape",
                },
                { cancelable: true },
              );
              break;
            }
            case "Tab": {
              triggerCustomEvent(
                this.host,
                "appret-menu-close",
                {
                  reason: "tab",
                },
                { cancelable: true },
              );
              break;
            }
            default: {
              //  Space is left out: it activates the focused item
              if (e.key.length === 1 && e.key !== " ") {
                target = this.#findItemByText(e.key, i);
              }
            }
          }

          if (target) {
            e.preventDefault();
            this.#setFocusableItem(target);
            target.element.focus();
          }
        },
        { signal: this.#abort.signal },
      );
    }
  }

  #isDisabled(item: NormalizedItem): boolean {
    return (
      item.element.matches(":disabled") ||
      [item.element, item.group, this.#config.menu].some(
        (el) => el?.getAttribute("aria-disabled") === "true",
      )
    );
  }

  #canFocus(item: NormalizedItem): boolean {
    return !item.element.matches(":disabled");
  }

  #findFocusableItem(
    currentIndex: number,
    step: 1 | -1,
  ): NormalizedItem | undefined {
    for (let i = 1; i <= this.#items.length; i++) {
      let index = currentIndex + step * i;

      if (index < 0 || index >= this.#items.length) {
        if (this.#config.loop === false) {
          return this.#items[currentIndex];
        }

        index = (index + this.#items.length) % this.#items.length;
      }

      const item = this.#items[index]!;

      if (this.#canFocus(item)) {
        return item;
      }
    }

    return undefined;
  }

  #findItemByText(
    key: string,
    startFromIndex: number,
  ): NormalizedItem | undefined {
    const character = key.toLowerCase();

    for (let i = 1; i <= this.#items.length; i++) {
      const item = this.#items[(startFromIndex + i) % this.#items.length]!;
      //  Matches the item's name: its aria-label, or its text
      const name =
        item.element.getAttribute("aria-label") ??
        item.element.textContent ??
        "";

      if (
        this.#canFocus(item) &&
        name.trim().toLowerCase().startsWith(character)
      ) {
        return item;
      }
    }

    return undefined;
  }

  #teardown(): void {
    this.#abort.abort();
    this.#attributeRecorder.restore();
  }

  //  API
  setFocusable(item: MenuItem): void {
    if (this.#destroyed) {
      console.warn("Appret menu: setFocusable() called after destroy().");
      return;
    }

    const match = this.#items.find(
      (i) => i.element === ("element" in item ? item.element : item),
    );

    if (!match) {
      console.warn(
        "Appret menu: focusable item is not among menu items:",
        item,
      );
      return;
    }

    if (!this.#canFocus(match)) {
      console.warn(
        "Appret menu: a natively disabled item can't be focused:",
        item,
      );
      return;
    }

    this.#setFocusableItem(match);
  }

  update(changes: Partial<MenuControllerConfig>): void {
    if (this.#destroyed) {
      console.warn("Appret menu: update() called after destroy().");
      return;
    }

    const next = copyLists({ ...this.#config, ...changes });

    this.#validateConfig(next);

    const checked = new Map(
      this.#items
        .filter((i) => i.type !== "item")
        .map((i) => [i.element, i.element.getAttribute("aria-checked")]),
    );

    this.#teardown();

    this.#config = next;
    this.#setup();

    for (const { element, type } of this.#items) {
      const value = checked.get(element);
      if (type !== "item" && value) {
        this.#attributeRecorder.set(element, "aria-checked", value);
      }
    }
  }

  focusLast(): void {
    if (this.#destroyed) {
      console.warn("Appret menu: focusLast() called after destroy().");
      return;
    }

    const item = this.#findFocusableItem(this.#items.length, -1);
    if (item) {
      this.focus(item);
    }
  }

  focusFirst(): void {
    if (this.#destroyed) {
      console.warn("Appret menu: focusFirst() called after destroy().");
      return;
    }

    const item = this.#findFocusableItem(-1, 1);
    if (item) {
      this.focus(item);
    }
  }

  focus(item: MenuItem | undefined = this.#focusableItem): void {
    if (this.#destroyed) {
      console.warn("Appret menu: focus() called after destroy().");
      return;
    }

    if (!item) {
      return;
    }

    const matchItem = this.#items.find(
      (i) => i.element === ("element" in item ? item.element : item),
    );

    if (matchItem) {
      if (!this.#canFocus(matchItem)) {
        console.warn(
          "Appret menu: a natively disabled item can't be focused:",
          item,
        );
        return;
      }

      this.#setFocusableItem(matchItem);
      matchItem.element.focus();
    } else {
      console.warn("Appret menu: focused item is not in menu items", item);
    }
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }

    this.#teardown();
    this.#destroyed = true;
  }
}

function normalizeItem(
  item: MenuItem,
  group: HTMLElement | null,
): NormalizedItem {
  return "element" in item
    ? { element: item.element, type: item.type, group }
    : { element: item, type: "item", group };
}

function normalizeItems(
  items: MenuControllerConfig["items"],
): NormalizedItem[] {
  return items.flatMap((entry) => {
    if ("group" in entry) {
      return entry.items.map((item) => normalizeItem(item, entry.group));
    }
    return [normalizeItem(entry, null)];
  });
}
