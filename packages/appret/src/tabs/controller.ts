import { AttributeRecorder } from "../shared/attributeRecorder.js";
import { triggerCustomEvent } from "../shared/customEvents.js";
import { flatTreeContains, isTreeRoot } from "../shared/tree.js";

type TabsLabel =
  | { label?: string; labelledBy?: never; labelledByElements?: never }
  | { labelledBy?: string; label?: never; labelledByElements?: never }
  | { labelledByElements?: Element[]; label?: never; labelledBy?: never };

export type TabsControllerOptions = {
  list: HTMLElement;
  tabs: HTMLElement[];
  panels: HTMLElement[];
} & TabsLabel & {
    orientation?: "horizontal" | "vertical";
    initialSelectedTab?: HTMLElement | number;
    activation?: "manual" | "automatic";
    loop?: boolean;
  };

export type TabsChangeDetail = {
  tab: HTMLElement;
  panel: HTMLElement;
  index: number;
};

export type TabsChangeEvent = CustomEvent<TabsChangeDetail>;

declare global {
  interface HTMLElementEventMap {
    "appret-tabs-change": TabsChangeEvent;
  }
}

const labelKeys = ["label", "labelledBy", "labelledByElements"] as const;

//  Merge updated options to make sure a new label key takes precedence
function mergeOptions(
  current: TabsControllerOptions,
  changes: Omit<Partial<TabsControllerOptions>, "initialSelectedTab">,
): TabsControllerOptions {
  const base: Partial<TabsControllerOptions> = { ...current };
  if (labelKeys.some((key) => key in changes)) {
    for (const key of labelKeys) delete base[key];
  }
  return { ...base, ...changes } as TabsControllerOptions;
}

export class TabsController {
  readonly host: HTMLElement;
  #options: TabsControllerOptions;
  #attributeRecorder = new AttributeRecorder();
  #abort!: AbortController;
  #destroyed = false;
  #selectedTab: HTMLElement;

  constructor(host: HTMLElement, options: TabsControllerOptions) {
    this.host = host;
    this.#validateOptions(options);

    //  Create a copy of tabs and panels to avoid side effects
    this.#options = {
      ...options,
      tabs: [...options.tabs],
      panels: [...options.panels],
    };

    const { tabs, initialSelectedTab } = this.#options;

    const initialTab =
      typeof initialSelectedTab === "number"
        ? tabs[initialSelectedTab]
        : initialSelectedTab;
    const isInitialSelectedTabValid =
      initialTab !== undefined && tabs.includes(initialTab);

    if (initialSelectedTab !== undefined && !isInitialSelectedTabValid) {
      console.warn("Appret tabs: the initial selected tab is not among tabs.");
    }

    this.#selectedTab =
      isInitialSelectedTabValid && !this.#isDisabled(initialTab!)
        ? initialTab!
        : (this.#findEnabledTab(-1, 1) ?? tabs[0]!);

    this.#setup();
  }

  #setup() {
    this.#abort = new AbortController();

    this.#setAriaRoles();
    this.#setFocusablePanels();
    this.#setTabPanelLink();
    this.#setLabels();
    this.#setOrientation();
    this.#setListeners();

    this.#setSelectedTab(this.#selectedTab);
  }

  #validateOptions(newOptions: TabsControllerOptions) {
    const { tabs, panels, list } = newOptions;

    if (tabs.length === 0) {
      throw new Error("Appret tabs: no tabs found.");
    }

    if (tabs.length !== panels.length) {
      throw new Error("Appret tabs: tabs and panels must be the same length.");
    }

    const outside = tabs.filter((tab) => !flatTreeContains(list, tab));
    if (outside.length > 0) {
      console.warn("Appret tabs: these tabs aren't inside `list`:", outside);
    }
  }

  #setAriaRoles() {
    this.#attributeRecorder.set(this.#options.list, "role", "tablist");

    for (const tab of this.#options.tabs) {
      this.#attributeRecorder.set(tab, "role", "tab");

      if (tab instanceof HTMLButtonElement && !tab.hasAttribute("type")) {
        this.#attributeRecorder.set(tab, "type", "button");
      }
    }
    for (const panel of this.#options.panels) {
      this.#attributeRecorder.set(panel, "role", "tabpanel");
    }
  }

  #setFocusablePanels() {
    for (const panel of this.#options.panels) {
      if (!panel.getAttribute("tabindex")) {
        this.#attributeRecorder.set(panel, "tabindex", "0");
      }
    }
  }

  #setTabPanelLink() {
    for (const [i, tab] of this.#options.tabs.entries()) {
      const panel = this.#options.panels[i]!;

      if (tab.getRootNode() === panel.getRootNode()) {
        this.#attributeRecorder.set(
          tab,
          "aria-controls",
          this.#attributeRecorder.ensureId(panel),
        );
        this.#attributeRecorder.set(
          panel,
          "aria-labelledby",
          this.#attributeRecorder.ensureId(tab),
        );

        continue;
      }

      // Different roots: an ID can't point outside its own shadow root,
      // but referencing the element directly works for elements in an outer root
      this.#attributeRecorder.setElements(tab, "ariaControlsElements", [panel]);
      this.#attributeRecorder.setElements(panel, "ariaLabelledByElements", [
        tab,
      ]);

      // The browser drops references it can't follow
      if (!panel.ariaLabelledByElements?.includes(tab)) {
        console.warn(
          "Appret tabs: this panel can't be labelled by its tab, because the tab is inside a shadow root the panel can't see:",
          panel,
        );
      }
    }
  }

  #setLabels() {
    const { list, label, labelledBy, labelledByElements } = this.#options;

    if (label) {
      this.#attributeRecorder.set(list, "aria-label", label);
      return;
    }

    if (labelledBy) {
      this.#attributeRecorder.set(list, "aria-labelledby", labelledBy);
      const root = list.getRootNode();
      if (isTreeRoot(root)) {
        const unreachableIds = labelledBy
          .trim()
          .split(/\s+/)
          .filter((id) => !root.getElementById(id));

        if (unreachableIds.length > 0) {
          console.warn(
            "Appret tabs: ID missing in the tablist's document or shadow root:",
            unreachableIds,
          );
        }
      }
      return;
    }

    if (labelledByElements?.length) {
      this.#attributeRecorder.setElements(
        list,
        "ariaLabelledByElements",
        labelledByElements,
      );

      //  Label elements might be dropped when they are in another shadow root
      const listAriaLabelledElements = list.ariaLabelledByElements;
      const dropped = labelledByElements.filter(
        (el) => !(listAriaLabelledElements ?? []).includes(el),
      );

      if (dropped.length > 0) {
        console.warn(
          "Appret tabs: these labelledByElements can't label the tablist because they're inside another shadow root:",
          dropped,
        );
      }
      return;
    }

    //  If the list has no accessible labels in the end (labels may have been added in other ways)
    if (
      !list.getAttribute("aria-label") &&
      !list.getAttribute("aria-labelledby") &&
      !list.ariaLabelledByElements?.length
    ) {
      console.warn("Appret tabs: the tablist is missing an accessible label.");
    }
  }

  #setOrientation() {
    if (this.#options.orientation) {
      this.#attributeRecorder.set(
        this.#options.list,
        "aria-orientation",
        this.#options.orientation,
      );
    }
  }

  #setSelectedTab(tabToSelect: HTMLElement, { notify = true } = {}) {
    let selectedIndex = 0;

    for (const [i, tab] of this.#options.tabs.entries()) {
      const panel = this.#options.panels[i]!;

      if (tab === tabToSelect) {
        selectedIndex = i;

        this.#attributeRecorder.set(tab, "aria-selected", "true");
        this.#attributeRecorder.set(tab, "tabindex", "0");
        this.#attributeRecorder.remove(panel, "hidden");
      } else {
        this.#attributeRecorder.set(tab, "aria-selected", "false");
        this.#attributeRecorder.set(tab, "tabindex", "-1");
        this.#attributeRecorder.set(panel, "hidden", "");
      }
    }

    if (notify && tabToSelect !== this.#selectedTab) {
      triggerCustomEvent(this.host, "appret-tabs-change", {
        tab: tabToSelect,
        panel: this.#options.panels[selectedIndex]!,
        index: selectedIndex,
      });
    }

    this.#selectedTab = tabToSelect;
  }

  #setListeners() {
    const { tabs, orientation } = this.#options;

    for (const [i, tab] of tabs.entries()) {
      tab.addEventListener(
        "click",
        (e) => {
          if (e.defaultPrevented) {
            return;
          }

          if (!this.#isDisabled(tab)) {
            this.#setSelectedTab(tab);
          }

          //  Force the focus for Safari
          tab.focus();
        },
        { signal: this.#abort.signal },
      );

      tab.addEventListener(
        "keydown",
        (e: KeyboardEvent) => {
          if (e.defaultPrevented) {
            return;
          }

          if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) {
            return;
          }

          const previousTab = this.#findEnabledTab(i, -1);
          const nextTab = this.#findEnabledTab(i, 1);
          const rtl = getComputedStyle(this.#options.list).direction === "rtl";

          let target;

          switch (e.key) {
            case "ArrowLeft": {
              target = rtl ? nextTab : previousTab;
              break;
            }
            case "ArrowRight": {
              target = rtl ? previousTab : nextTab;
              break;
            }
            case "ArrowUp": {
              if (orientation === "vertical") {
                target = previousTab;
              }
              break;
            }
            case "ArrowDown": {
              if (orientation === "vertical") {
                target = nextTab;
              }
              break;
            }
            case "Home": {
              target = this.#findEnabledTab(-1, 1);
              break;
            }
            case "End": {
              target = this.#findEnabledTab(tabs.length, -1);
              break;
            }
          }

          if (target) {
            e.preventDefault();
            target.focus();

            //  When activation is manual the keyboard events only move the focus
            if (this.#options.activation !== "manual") {
              this.#setSelectedTab(target);
            }
          }

          if (
            this.#options.activation === "manual" &&
            (e.key === "Enter" || e.key === " ") &&
            !(tab instanceof HTMLButtonElement) &&
            !this.#isDisabled(tab)
          ) {
            e.preventDefault();
            this.#setSelectedTab(tab);
          }
        },
        { signal: this.#abort.signal },
      );
    }
  }

  #isDisabled(tab: HTMLElement): boolean {
    return (
      tab.getAttribute("aria-disabled") === "true" || tab.matches(":disabled")
    );
  }

  #findEnabledTab(currentIndex: number, step: 1 | -1): HTMLElement | undefined {
    const { tabs, loop } = this.#options;

    for (let i = 1; i <= tabs.length; i++) {
      let index = currentIndex + step * i;

      if (index < 0 || index >= tabs.length) {
        if (loop === false) {
          return tabs[currentIndex];
        }

        index = (index + tabs.length) % tabs.length;
      }

      const tab = tabs[index]!;

      if (!this.#isDisabled(tab)) {
        return tab;
      }
    }

    return undefined;
  }

  #teardown(): void {
    this.#abort.abort();
    this.#attributeRecorder.restore();
  }

  #selectionAfterUpdate(
    previousSelectedTab: HTMLElement,
    previousSelectedIndex: number,
  ): HTMLElement {
    const { tabs } = this.#options;

    //  If the tab reference still exists, keep it selected
    if (
      tabs.includes(previousSelectedTab) &&
      !this.#isDisabled(previousSelectedTab)
    ) {
      return previousSelectedTab;
    }

    //  Otherwise, find the tab at the same index
    //  If the index doesnt exist anymore, select the last tab
    const index = Math.min(previousSelectedIndex, tabs.length - 1);

    const isEnabled = (tab: HTMLElement) => !this.#isDisabled(tab);
    return (
      //  Find next tab that is not disabled
      tabs.slice(index).find(isEnabled) ??
      //  If it can't be found, go backwards
      tabs.slice(0, index).reverse().find(isEnabled) ??
      tabs[0]!
    );
  }

  //  API
  select(tab: HTMLElement | number): void {
    if (this.#destroyed) {
      console.warn("Appret tabs: select() called after destroy().");
      return;
    }

    let selectedTab;
    if (typeof tab === "number") {
      selectedTab = this.#options.tabs[tab];
    } else {
      selectedTab = tab;
    }

    if (!selectedTab || !this.#options.tabs.includes(selectedTab)) {
      console.warn("Appret tabs: selected tab is not among tabs:", tab);
      return;
    }

    if (this.#isDisabled(selectedTab)) {
      console.warn("Appret tabs: can't select a disabled tab:", selectedTab);
      return;
    }

    this.#setSelectedTab(selectedTab, { notify: false });
  }

  update(
    changes: Omit<Partial<TabsControllerOptions>, "initialSelectedTab">,
  ): void {
    if (this.#destroyed) {
      console.warn("Appret tabs: update() called after destroy().");
      return;
    }

    const mergedOptions = mergeOptions(this.#options, changes);
    const next = {
      ...mergedOptions,
      tabs: [...mergedOptions.tabs],
      panels: [...mergedOptions.panels],
    };

    this.#validateOptions(next);

    const previousTab = this.#selectedTab;
    const previousIndex = this.selectedIndex;

    this.#teardown();

    this.#options = next;
    this.#selectedTab = this.#selectionAfterUpdate(previousTab, previousIndex);
    this.#setup();
  }

  focusSelectedTab(): void {
    this.#selectedTab.focus();
  }

  get selectedTab(): HTMLElement {
    return this.#selectedTab;
  }

  get selectedIndex(): number {
    return this.#options.tabs.indexOf(this.#selectedTab);
  }

  destroy(): void {
    this.#teardown();
    this.#destroyed = true;
  }
}
