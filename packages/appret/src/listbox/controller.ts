import { AttributeRecorder } from "../shared/attributeRecorder.js";
import { triggerCustomEvent } from "../shared/customEvents.js";
import { flatTreeContains, isTreeRoot } from "../shared/tree.js";

type Label =
  | { label?: string; labelledBy?: never; labelledByElements?: never }
  | { labelledBy?: string; label?: never; labelledByElements?: never }
  | { labelledByElements?: Element[]; label?: never; labelledBy?: never };

export type ListboxGroup = {
  group: HTMLElement;
  options: HTMLElement[];
} & Label;

type Options =
  | { options: HTMLElement[]; groups?: never }
  | { groups: ListboxGroup[]; options?: never };

type Selection =
  | {
      multiple?: false;
      initialSelectedOption?: HTMLElement;
      selectionFollowsFocus?: boolean;
      selectOptionOnListFocus?: boolean;
    }
  | {
      multiple: true;
      initialSelectedOptions?: HTMLElement[];
      selectionFollowsFocus?: never;
      selectOptionOnListFocus?: never;
    };

export type ListboxControllerOptions = {
  list: HTMLElement;
  orientation?: "horizontal" | "vertical";
} & Label &
  Options &
  Selection;

export type ListboxChangeDetail = {};

export type ListboxChangeEvent = CustomEvent<ListboxChangeDetail>;

declare global {
  interface HTMLElementEventMap {
    "appret-listbox-change": ListboxChangeEvent;
  }
}

export class ListboxController {
  readonly host: HTMLElement;
  #options: ListboxControllerOptions;
  #attributeRecorder = new AttributeRecorder();
  #abort!: AbortController;

  #typeahead = "";
  #typeaheadTimeout: ReturnType<typeof setTimeout> | undefined;

  #selectedOption: HTMLElement | null = null;
  #activeOption: HTMLElement | null = null;

  //  When multiple
  #selectedOptions: HTMLElement[] = [];
  //  Anchor to toggle options when user types Shift + " "
  #lastSelectedOption: HTMLElement | null = null;

  #destroyed = false;

  constructor(host: HTMLElement, options: ListboxControllerOptions) {
    this.host = host;
    this.#validateOptions(options);

    this.#options = options;
    const flatOptions = this.#getFlatOptions();

    if (!options.multiple && options.initialSelectedOption !== undefined) {
      if (!flatOptions.includes(options.initialSelectedOption)) {
        console.warn(
          "Appret listbox: the initial selected option is not among the options.",
        );
      } else if (this.#isDisabled(options.initialSelectedOption)) {
        console.warn(
          "Appret listbox: the initial selected option is disabled.",
          options.initialSelectedOption,
        );
      } else {
        this.#selectedOption = options.initialSelectedOption;
      }
    }

    if (options.multiple && options.initialSelectedOptions?.length) {
      const initialSelectedOptionsNotInListbox =
        options.initialSelectedOptions.filter((o) => !flatOptions.includes(o));
      if (initialSelectedOptionsNotInListbox.length > 0) {
        console.warn(
          "Appret listbox: some of the initial selected options are not among the options:",
          initialSelectedOptionsNotInListbox,
        );
      }

      const disabledInitialSelectedOptions =
        options.initialSelectedOptions.filter((o) => this.#isDisabled(o));
      if (disabledInitialSelectedOptions?.length) {
        console.warn(
          "Appret listbox: some of the initial selected options are disabled.",
          disabledInitialSelectedOptions,
        );
      }

      this.#selectedOptions = options.initialSelectedOptions.filter(
        (o) =>
          !initialSelectedOptionsNotInListbox.includes(o) &&
          !disabledInitialSelectedOptions.includes(o),
      );
    }

    this.#setup();
  }

  #setup() {
    this.#abort = new AbortController();

    this.#setAriaRoles();
    this.#setLabels(this.#options.list, this.#options);
    for (const group of this.#options.groups ?? []) {
      this.#setLabels(group.group, group);
    }
    this.#setOrientation();
    this.#setMultiselectable();
    this.#setListeners();

    if (this.#options.multiple) {
      this.#setSelectedOptions(this.#selectedOptions, { notify: false });

      const firstSelected = this.#getFlatOptions().find((o) =>
        this.#selectedOptions.includes(o),
      );
      this.#setActiveOption(
        firstSelected ??
          this.#findNonDisabledOption(-1, 1) ??
          this.#getFlatOptions()[0]!,
      );
    } else {
      //  When setting up on init or after update set the selected and active option
      if (this.#selectedOption) {
        this.#attributeRecorder.set(
          this.#selectedOption,
          "aria-selected",
          "true",
        );
      }
      this.#setActiveOption(
        this.#selectedOption ??
          this.#findNonDisabledOption(-1, 1) ??
          this.#getFlatOptions()[0]!,
      );
    }
  }

  #validateOptions(newOptions: ListboxControllerOptions) {
    const { list, options, groups } = newOptions;

    if (!list) {
      throw new Error("Appret listbox: `list` is required.");
    }

    if (options && groups) {
      throw new Error(
        "Appret listbox: pass either `options` or `groups`, not both.",
      );
    }

    const flatOptions =
      options ?? groups?.flatMap((g) => g.options ?? []) ?? [];

    if (flatOptions.length === 0) {
      throw new Error("Appret listbox: no options found.");
    }

    const invalidGroups = (groups ?? []).filter(
      (g) => !g.group || !g.options?.length || !flatTreeContains(list, g.group),
    );

    if (invalidGroups.length > 0) {
      console.warn(
        "Appret listbox: invalid groups:",
        invalidGroups.map((g) => g.group),
      );
    }

    const misplacedOptions = (groups ?? []).flatMap((g) =>
      g.group
        ? (g.options ?? []).filter((o) => !flatTreeContains(g.group, o))
        : [],
    );
    if (misplacedOptions.length > 0) {
      console.warn(
        "Appret listbox: these options aren't inside their group:",
        misplacedOptions,
      );
    }

    const outsideOptions = flatOptions.filter(
      (o) => !flatTreeContains(list, o),
    );
    if (outsideOptions.length > 0) {
      console.warn(
        "Appret listbox: these options aren't inside `list`:",
        outsideOptions,
      );
    }
  }

  #setAriaRoles() {
    this.#attributeRecorder.set(this.#options.list, "role", "listbox");

    for (const option of this.#options.options ?? []) {
      this.#attributeRecorder.set(option, "role", "option");
    }
    for (const group of this.#options.groups ?? []) {
      this.#attributeRecorder.set(group.group, "role", "group");

      for (const groupOption of group.options) {
        this.#attributeRecorder.set(groupOption, "role", "option");
      }
    }
  }

  #setLabels(element: HTMLElement, labelObj: Label) {
    const { label, labelledBy, labelledByElements } = labelObj;

    if (label) {
      this.#attributeRecorder.set(element, "aria-label", label);
      return;
    }

    if (labelledBy) {
      this.#attributeRecorder.set(element, "aria-labelledby", labelledBy);

      const root = element.getRootNode();
      if (isTreeRoot(root)) {
        const ids = labelledBy.trim().split(/\s+/);

        const labelElements = ids
          .map((id) => root.getElementById(id))
          .filter((el) => el !== null);

        const unreachableIds = ids.filter((id) => !root.getElementById(id));

        if (unreachableIds.length > 0) {
          console.warn(
            "Appret listbox: ID missing in the element's document or shadow root:",
            unreachableIds,
          );
        }

        this.#hideLabelRoles(labelElements);
      }
      return;
    }

    if (labelledByElements?.length) {
      this.#attributeRecorder.setElements(
        element,
        "ariaLabelledByElements",
        labelledByElements,
      );

      this.#hideLabelRoles(labelledByElements);

      //  Label elements might be dropped when they are in another shadow root
      const listAriaLabelledElements = element.ariaLabelledByElements;
      const dropped = labelledByElements.filter(
        (el) => !(listAriaLabelledElements ?? []).includes(el),
      );

      if (dropped.length > 0) {
        console.warn(
          "Appret listbox: these labelledByElements can't label the element because they're inside another shadow root:",
          dropped,
        );
      }
      return;
    }

    //  If the list has no accessible labels in the end (labels may have been added in other ways)
    if (
      !element.getAttribute("aria-label") &&
      !element.getAttribute("aria-labelledby") &&
      !element.ariaLabelledByElements?.length
    ) {
      console.warn(
        "Appret listbox: the element is missing an accessible label.",
        element,
      );
    }
  }

  //  Add a presentation role for labels that would be inside the list
  #hideLabelRoles(labelElements: Element[]) {
    for (const el of labelElements) {
      if (flatTreeContains(this.#options.list, el)) {
        this.#attributeRecorder.set(el, "role", "presentation");
      }
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

  #setMultiselectable() {
    if (this.#options.multiple !== undefined) {
      this.#attributeRecorder.set(
        this.#options.list,
        "aria-multiselectable",
        this.#options.multiple.toString(),
      );
    }
  }

  #setListeners() {
    const {
      list,
      orientation,
      multiple,
      selectionFollowsFocus,
      selectOptionOnListFocus,
    } = this.#options;
    const flatOptions = this.#getFlatOptions();

    list.addEventListener(
      "focusin",
      (e) => {
        if (
          !selectOptionOnListFocus ||
          this.#selectedOption ||
          this.#selectedOptions.length
        ) {
          return;
        }

        if (
          e.relatedTarget instanceof Node &&
          flatTreeContains(list, e.relatedTarget)
        ) {
          return;
        }

        const option = flatOptions.find((o) => o === e.target);
        if (option) {
          this.#setSelectedOption(option);
        }
      },
      { signal: this.#abort.signal },
    );

    for (const [i, option] of flatOptions.entries()) {
      option.addEventListener(
        "click",
        (e) => {
          if (e.defaultPrevented || this.#isDisabled(option)) {
            return;
          }

          this.#setActiveOption(option);
          if (multiple) {
            this.#toggleSelectedOption(option);
          } else {
            this.#setSelectedOption(option);
          }
          option.focus();
        },
        { signal: this.#abort.signal },
      );

      option.addEventListener(
        "keydown",
        (e: KeyboardEvent) => {
          if (e.defaultPrevented) {
            return;
          }

          const nonDisabled = flatOptions.filter((o) => !this.#isDisabled(o));

          if (
            multiple &&
            (e.ctrlKey || e.metaKey) &&
            e.key.toLowerCase() === "a"
          ) {
            e.preventDefault();
            const selectedOptions = nonDisabled.every((o) =>
              this.#selectedOptions.includes(o),
            );
            this.#setSelectedOptions(selectedOptions ? [] : nonDisabled);
            return;
          }

          if (
            e.altKey ||
            e.isComposing ||
            (!multiple && (e.ctrlKey || e.metaKey))
          ) {
            return;
          }

          const previousOption = this.#findNonDisabledOption(i, -1);
          const nextOption = this.#findNonDisabledOption(i, 1);

          const horizontal = orientation === "horizontal";
          const rtl = horizontal && getComputedStyle(list).direction === "rtl";

          let target;

          switch (e.key) {
            case "ArrowUp": {
              if (!horizontal) {
                target = previousOption;
              }
              break;
            }
            case "ArrowDown": {
              if (!horizontal) {
                target = nextOption;
              }
              break;
            }
            case "ArrowLeft": {
              if (horizontal) {
                target = rtl ? nextOption : previousOption;
              }
              break;
            }
            case "ArrowRight": {
              if (horizontal) {
                target = rtl ? previousOption : nextOption;
              }
              break;
            }
            case "Home": {
              target = this.#findNonDisabledOption(-1, 1);
              break;
            }
            case "End": {
              target = this.#findNonDisabledOption(flatOptions.length, -1);
              break;
            }
            case " ": {
              e.preventDefault();

              if (this.#typeahead) {
                target = this.#findOptionByText(" ", i);
                break;
              }

              if (multiple) {
                if (e.shiftKey && this.#lastSelectedOption) {
                  //  Select all options from the last seelcted one to the active one
                  const from = flatOptions.indexOf(this.#lastSelectedOption);
                  const to = i;
                  this.#selectOptionsRange(from, to);
                } else {
                  this.#toggleSelectedOption(option);
                }

                break;
              }

              if (!selectionFollowsFocus) {
                this.#setSelectedOption(option);
              }
              break;
            }
            default: {
              if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                target = this.#findOptionByText(e.key, i);
              }
            }
          }

          if (
            target &&
            multiple &&
            e.shiftKey &&
            ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
          ) {
            this.#toggleSelectedOption(target);
          }

          if (target) {
            e.preventDefault();
            this.#setActiveOption(target);
            target.focus();

            if (selectionFollowsFocus) {
              this.#setSelectedOption(target);
            }
          }

          if (
            e.key === "Home" &&
            target &&
            multiple &&
            e.shiftKey &&
            e.ctrlKey
          ) {
            //  Select all options from beginning to active option
            const from = 0;
            const to = i;
            this.#selectOptionsRange(from, to);
          }

          if (
            e.key === "End" &&
            target &&
            multiple &&
            e.shiftKey &&
            e.ctrlKey
          ) {
            //  Select all options from active option to end
            const from = i;
            const to = flatOptions.length;
            this.#selectOptionsRange(from, to);
          }
        },
        { signal: this.#abort.signal },
      );
    }
  }

  #setSelectedOption(optionToSelect: HTMLElement, { notify = true } = {}) {
    if (this.#isDisabled(optionToSelect)) {
      return;
    }

    const flatOptions = this.#getFlatOptions();

    for (const option of flatOptions) {
      if (option === optionToSelect) {
        this.#attributeRecorder.set(option, "aria-selected", "true");
      } else {
        if (option.getAttribute("aria-selected") === "true") {
          this.#attributeRecorder.remove(option, "aria-selected");
        }
      }
    }

    if (notify && optionToSelect !== this.#selectedOption) {
      triggerCustomEvent(this.host, "appret-listbox-change", {
        option: optionToSelect,
      });
    }

    this.#selectedOption = optionToSelect;
  }

  #setSelectedOptions(optionsToSelect: HTMLElement[], { notify = true } = {}) {
    const selected = this.#getFlatOptions().filter(
      (o) => optionsToSelect.includes(o) && !this.#isDisabled(o),
    );

    const flatOptions = this.#getFlatOptions();

    for (const option of flatOptions) {
      if (selected.includes(option)) {
        this.#attributeRecorder.set(option, "aria-selected", "true");
      } else {
        this.#attributeRecorder.set(option, "aria-selected", "false");
      }
    }

    if (notify && !areSameElementsLists(selected, this.#selectedOptions)) {
      triggerCustomEvent(this.host, "appret-listbox-change", {
        options: selected,
      });
    }

    this.#selectedOptions = selected;
  }

  #toggleSelectedOption(o: HTMLElement) {
    const isAlreadySelected = this.#selectedOptions.find((s) => s === o);
    if (!isAlreadySelected) {
      this.#lastSelectedOption = o;
    }

    return this.#setSelectedOptions(
      this.#selectedOptions.includes(o)
        ? this.#selectedOptions.filter((s) => s !== o)
        : [...this.#selectedOptions, o],
    );
  }

  #selectOptionsRange(from: number, to: number) {
    const [start, end] = from < to ? [from, to] : [to, from];
    this.#setSelectedOptions([
      ...this.#selectedOptions,
      ...this.#getFlatOptions().slice(start, end + 1),
    ]);
  }

  #setActiveOption(optionToActivate: HTMLElement) {
    for (const option of this.#getFlatOptions()) {
      this.#attributeRecorder.set(
        option,
        "tabindex",
        option === optionToActivate ? "0" : "-1",
      );
    }
    this.#activeOption = optionToActivate;
  }

  #isDisabled(option: HTMLElement): boolean {
    const group = this.#options.groups?.find((g) => g.options.includes(option));

    return [option, group?.group, this.#options.list].some(
      (el) => el?.getAttribute("aria-disabled") === "true",
    );
  }

  #findNonDisabledOption(
    fromIndex: number,
    step: 1 | -1,
  ): HTMLElement | undefined {
    const flatOptions = this.#getFlatOptions();

    for (
      let i = fromIndex + step;
      i >= 0 && i < flatOptions.length;
      i += step
    ) {
      const option = flatOptions[i]!;
      if (!this.#isDisabled(option)) {
        return option;
      }
    }

    return undefined;
  }

  #getFlatOptions() {
    return (
      this.#options.options ??
      (this.#options.groups ?? []).flatMap((g) => g.options)
    );
  }

  #findOptionByText(
    key: string,
    startFromIndex: number,
  ): HTMLElement | undefined {
    clearTimeout(this.#typeaheadTimeout);
    this.#typeaheadTimeout = setTimeout(() => (this.#typeahead = ""), 500);

    this.#typeahead += key.toLowerCase();

    // Pressing the same letter again cycles through the options starting with it
    const search = [...this.#typeahead].every((c) => c === this.#typeahead[0])
      ? this.#typeahead[0]!
      : this.#typeahead;

    const flatOptions = this.#getFlatOptions();
    const start = search.length === 1 ? startFromIndex + 1 : startFromIndex;

    for (let i = 0; i < flatOptions.length; i++) {
      const option = flatOptions[(start + i) % flatOptions.length]!;
      const text = (option.textContent ?? "").trim().toLowerCase();

      if (!this.#isDisabled(option) && text.startsWith(search)) {
        return option;
      }
    }

    return undefined;
  }

  #teardown(): void {
    this.#abort.abort();
    this.#attributeRecorder.restore();
    clearTimeout(this.#typeaheadTimeout);
    this.#typeahead = "";
    this.#lastSelectedOption = null;
  }

  destroy(): void {
    this.#teardown();
    this.#destroyed = true;
  }
}

function areSameElementsLists(listA: HTMLElement[], listB: HTMLElement[]) {
  return (
    listA.length === listB.length && listA.every((el) => listB.includes(el))
  );
}
