import {
  closestElementOfType,
  enumAttribute,
  HTMLElementBase,
} from "../shared/element.js";
import {
  ListboxController,
  type ListboxControllerConfig,
  type ListboxGroup,
} from "./controller.js";

type ListboxParts = Pick<ListboxControllerConfig, "options"> & {
  list?: ListboxControllerConfig["list"];
};

export class ListboxElement extends HTMLElementBase {
  static observedAttributes = [
    "label",
    "labelledby",
    "orientation",
    "selection-follows-focus",
    "multiple",
  ];
  #controller?: ListboxController;
  //  Register the initial selected options for when the listbox controller is created
  #pendingSelection?: HTMLElement | HTMLElement[] | null;
  #parts?: ListboxParts;
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

    if (!parts.list) {
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
      // e.g. options and groups mixed while the markup changes: keep the current listbox working.
      console.warn("Appret listbox: ignored an invalid change.", error);
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
    if (!parts.list) {
      return;
    }

    try {
      //  The controller checks that the selection fits the mode
      this.#controller = new ListboxController(this, {
        ...parts,
        ...this.#getAttributeConfig(),
        initialSelection: this.#pendingSelection ?? undefined,
      } as ListboxControllerConfig);

      this.#parts = parts as ListboxParts;
      this.#pendingSelection = undefined;
    } catch (error) {
      console.warn("Appret listbox: couldn't set up <appret-listbox>.", error);
    }
  }

  #getParts(): ListboxParts {
    //  The parts of this listbox, and not of a nested one, whatever its tag name
    const getOwnElements = (selector: string, root: Element = this) => {
      return [...root.querySelectorAll<HTMLElement>(selector)].filter(
        (el) => closestElementOfType(el, ListboxElement) === this,
      );
    };

    const groups = getOwnElements('[data-appret-part~="listbox.group"]');
    const options: HTMLElement[] | ListboxGroup[] = groups.length
      ? groups.map((group) => {
          const label = getOwnElements(
            '[data-appret-part~="listbox.group-label"]',
            group,
          )[0];
          return {
            group,
            options: getOwnElements(
              '[data-appret-part~="listbox.option"]',
              group,
            ),
            label: label ? { byElements: [label] } : undefined,
          };
        })
      : getOwnElements('[data-appret-part~="listbox.option"]');

    return {
      list: getOwnElements('[data-appret-part~="listbox.list"]')[0],
      options,
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
        "Appret listbox",
      ),
      selectionFollowsFocus:
        this.getAttribute("selection-follows-focus") === null
          ? undefined
          : this.getAttribute("selection-follows-focus") !== "false",
      //  Like <select multiple>, the attribute alone turns it on
      multiple: this.hasAttribute("multiple"),
    };
  }

  disconnectedCallback() {
    this.#observer.disconnect();

    //  Save the selected options for next initialization
    this.#pendingSelection =
      this.#controller?.selectedOptions ?? this.#pendingSelection;
    this.#controller?.destroy();
    this.#controller = undefined;
    this.#listeners?.abort();
  }

  //  API
  select(selection: HTMLElement | HTMLElement[] | null): void {
    if (this.#controller) {
      this.#controller.select(selection);
    } else {
      //  No controller yet. Save the selected options for when the controller is created
      this.#pendingSelection = selection;
    }
  }

  get selectedOption(): HTMLElement | null {
    const option = this.#controller?.selectedOption;
    return option?.isConnected ? option : null;
  }

  get selectedOptions(): HTMLElement[] {
    return this.#controller?.selectedOptions.filter((o) => o.isConnected) ?? [];
  }

  //  Moves focus to the option reachable with Tab
  override focus(options?: FocusOptions): void {
    this.#controller?.focus(options);
  }
}

//  The list, then each group with its label and options, in order
function partElements({
  list,
  options,
}: ListboxParts): (Element | undefined)[] {
  return [
    list,
    ...options.flatMap((o) =>
      "group" in o
        ? [
            o.group,
            ...(typeof o.label === "object" ? (o.label.byElements ?? []) : []),
            ...o.options,
          ]
        : [o],
    ),
  ];
}

function areSameParts(a: ListboxParts, b: ListboxParts): boolean {
  const x = partElements(a);
  const y = partElements(b);
  return x.length === y.length && x.every((el, i) => el === y[i]);
}
