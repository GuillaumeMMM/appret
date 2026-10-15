import { AttributeRecorder } from "./shared/attributeRecorder.js";
import { triggerCustomEvent } from "./shared/customEvents.js";
import { flatTreeContains, isTreeRoot } from "./shared/tree.js";

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
    initialSelectedTab?: HTMLElement;
    activation?: "manual" | "automatic";
  };

export class TabsController {
  readonly host: HTMLElement;
  #options: TabsControllerOptions;
  #attributeRecorder = new AttributeRecorder();
  #abort = new AbortController();
  #selectedTab: HTMLElement;

  constructor(host: HTMLElement, options: TabsControllerOptions) {
    this.host = host;
    this.#options = options;
    const { tabs, panels, initialSelectedTab } = this.#options;

    if (this.#options.tabs.length === 0) {
      throw new Error("Appret tabs: no tabs found.");
    }

    if (tabs.length !== panels.length) {
      throw new Error("Appret tabs: tabs and panels must be the same length.");
    }

    const outside = options.tabs.filter(
      (tab) => !flatTreeContains(options.list, tab),
    );
    if (outside.length > 0) {
      console.warn("Appret tabs: these tabs aren't inside `list`:", outside);
    }

    const isInitialSelectedTabValid =
      initialSelectedTab && tabs.includes(initialSelectedTab);

    if (initialSelectedTab && !isInitialSelectedTabValid) {
      console.warn("Appret tabs: the initial selected tab is not among tabs.");
    }

    this.#selectedTab =
      isInitialSelectedTabValid && !this.#isDisabled(initialSelectedTab!)
        ? initialSelectedTab!
        : (this.#findEnabledTab(-1, 1) ?? tabs[0]!);

    this.#setAriaRoles();
    this.#setFocusablePanels();
    this.#setTabPanelLink();
    this.#setLabels();
    this.#setOtherOptions();

    this.#setListeners();

    this.#setSelectedTab(this.#selectedTab);
  }

  #setAriaRoles() {
    this.#attributeRecorder.set(this.#options.list, "role", "tablist");

    for (const tab of this.#options.tabs) {
      this.#attributeRecorder.set(tab, "role", "tab");
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

  #setOtherOptions() {
    if (this.#options.orientation) {
      this.#attributeRecorder.set(
        this.#options.list,
        "aria-orientation",
        this.#options.orientation,
      );
    }
  }

  #setSelectedTab(tabToSelect: HTMLElement) {
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

    if (tabToSelect !== this.#selectedTab) {
      triggerCustomEvent(this.host, "appret-tabs-change", {
        tab: tabToSelect,
        panel: this.#options.panels[selectedIndex],
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
        () => {
          if (!this.#isDisabled(tab)) {
            this.#setSelectedTab(tab);
          }
        },
        { signal: this.#abort.signal },
      );

      tab.addEventListener(
        "keydown",
        (e: KeyboardEvent) => {
          if (e.altKey || e.ctrlKey || e.metaKey) {
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
    const { tabs } = this.#options;
    for (let i = 1; i <= tabs.length; i++) {
      const tab = tabs[(currentIndex + step * i + tabs.length) % tabs.length]!;
      if (!this.#isDisabled(tab)) return tab;
    }
    return undefined;
  }

  destroy(): void {
    this.#attributeRecorder.restore();
    this.#abort.abort();
  }
}
