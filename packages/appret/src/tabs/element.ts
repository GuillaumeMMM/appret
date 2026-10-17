import { HTMLElementBase } from "../shared/element.js";
import { TabsController, type TabsControllerOptions } from "./controller.js";

type TabsParts = Pick<TabsControllerOptions, "tabs" | "panels"> & {
  list?: TabsControllerOptions["list"];
};

export class TabsElement extends HTMLElementBase {
  static observedAttributes = [
    "label",
    "labelledby",
    "orientation",
    "activation",
    "loop",
  ];
  #controller?: TabsController;
  //  Register the initial selected tab for when the tabs controller is created
  #pendingSelection?: HTMLElement | number;
  #parts?: TabsParts;
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

    if (!parts.list || parts.tabs.length === 0) {
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
      this.#controller.update({ ...parts, ...this.#getAttributeOptions() });
    } catch (error) {
      // e.g. a tab removed but not yet its panel: keep the current tabs working.
      console.warn("Appret tabs: ignored an invalid change.", error);
      return;
    }
    this.#parts = parts;
    if (focusLost) this.#controller.focusSelectedTab();
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

    //  There is a format issue or the parts will pe injected later
    if (!parts.list || parts.tabs.length === 0) {
      return;
    }

    try {
      this.#controller = new TabsController(this, {
        ...parts,
        ...this.#getAttributeOptions(),
        initialSelectedTab:
          typeof this.#pendingSelection === "number"
            ? parts.tabs[this.#pendingSelection]
            : this.#pendingSelection,
      } as TabsControllerOptions);

      this.#parts = parts as TabsParts;
      this.#pendingSelection = undefined;
    } catch (error) {
      console.warn("Appret tabs: couldn't set up <appret-tabs>.", error);
    }
  }

  #getParts() {
    const getOwnElements = (selector: string) => {
      return [...this.querySelectorAll<HTMLElement>(selector)].filter(
        (el) => el.closest(this.localName) === this,
      );
    };

    return {
      list: getOwnElements('[data-appret-part~="tabs.list"]')[0],
      tabs: getOwnElements('[data-appret-part~="tabs.tab"]'),
      panels: getOwnElements('[data-appret-part~="tabs.panel"]'),
    };
  }

  #getAttributeOptions() {
    return {
      label: this.getAttribute("label") ?? undefined,
      labelledBy: this.getAttribute("labelledby") ?? undefined,

      //  Make sure that `orientation` and `activation` have a valid value
      orientation: enumAttribute(this, "orientation", [
        "horizontal",
        "vertical",
      ] as const),
      activation: enumAttribute(this, "activation", [
        "automatic",
        "manual",
      ] as const),

      loop:
        this.getAttribute("loop") === null
          ? undefined
          : this.getAttribute("loop") !== "false",
    };
  }

  disconnectedCallback() {
    this.#observer.disconnect();

    //  Save the selected index for next initialization
    this.#pendingSelection =
      this.#controller?.selectedIndex ?? this.#pendingSelection;
    this.#controller?.destroy();
    this.#controller = undefined;
    this.#listeners?.abort();
  }

  //  API
  select(tab: HTMLElement | number): void {
    if (this.#controller) {
      this.#controller.select(tab);
    } else {
      //  No controller yet. Save the selected tab for when the controller is created
      this.#pendingSelection = tab;
    }
  }

  get selectedTab(): HTMLElement | null {
    const tab = this.#controller?.selectedTab;
    return tab?.isConnected ? tab : null;
  }

  get selectedIndex(): number {
    return this.selectedTab ? this.#controller!.selectedIndex : -1;
  }

  set selectedIndex(index: number) {
    this.select(index);
  }

  focusSelectedTab(): void {
    this.#controller?.focusSelectedTab();
  }
}

function areSameParts(a: TabsParts, b: TabsParts): boolean {
  const same = (x: HTMLElement[], y: HTMLElement[]) =>
    x.length === y.length && x.every((el, i) => el === y[i]);
  return a.list === b.list && same(a.tabs, b.tabs) && same(a.panels, b.panels);
}

function enumAttribute<T extends string>(
  element: Element,
  name: string,
  allowed: T[],
): T | undefined {
  const value = element.getAttribute(name);

  if (value === null) {
    return undefined;
  }

  if (allowed.includes(value as T)) {
    return value as T;
  }

  console.warn(
    `Appret tabs: invalid ${name}="${value}". Expected ${allowed.map((v) => `"${v}"`).join(" or ")}.`,
  );

  return undefined;
}
