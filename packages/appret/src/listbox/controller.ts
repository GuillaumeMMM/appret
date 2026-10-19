import { AttributeRecorder } from "../shared/attributeRecorder.js";
import { copyLists } from "../shared/copyLists.js";
import { triggerCustomEvent } from "../shared/customEvents.js";
import { setLabel, type Label } from "../shared/label.js";
import { flatTreeContains } from "../shared/tree.js";

export type ListboxGroup = {
  group: HTMLElement;
  options: HTMLElement[];
  label?: Label;
};

type Selection =
  | {
      multiple?: false;
      initialSelection?: HTMLElement;
      selectionFollowsFocus?: boolean;
    }
  | {
      multiple: true;
      initialSelection?: HTMLElement[];
      selectionFollowsFocus?: never;
    };

export type ListboxControllerConfig = {
  list: HTMLElement;
  //  Options, or groups of options
  options: HTMLElement[] | ListboxGroup[];
  label?: Label;
  orientation?: "horizontal" | "vertical";
} & Selection;

export type ListboxChangeDetail = {
  //  The first selected option
  option: HTMLElement | null;
  options: HTMLElement[];
};

export type ListboxChangeEvent = CustomEvent<ListboxChangeDetail>;

declare global {
  interface HTMLElementEventMap {
    "appret-listbox-change": ListboxChangeEvent;
  }
}

export class ListboxController {
  readonly host: HTMLElement;
  #config: ListboxControllerConfig;
  #attributeRecorder = new AttributeRecorder();
  #abort!: AbortController;

  #typeahead = "";
  #typeaheadTimeout: ReturnType<typeof setTimeout> | undefined;

  //  In DOM order, with at most one option without `multiple`
  #selected: HTMLElement[] = [];
  #activeOption: HTMLElement | null = null;

  //  Anchor to toggle options when user types Shift + " "
  #lastSelectedOption: HTMLElement | null = null;

  #destroyed = false;

  constructor(host: HTMLElement, config: ListboxControllerConfig) {
    this.host = host;
    this.#validateConfig(config);

    this.#config = copyLists(config);
    if (config.initialSelection !== undefined) {
      this.#selected = this.#validSelection(config.initialSelection) ?? [];
    }

    this.#setup();
  }

  #setup() {
    this.#abort = new AbortController();

    this.#setAriaRoles();
    this.#setLabels(this.#config.list, this.#config.label, "listbox");
    for (const group of this.#getGroups()) {
      this.#setLabels(group.group, group.label, "group");
    }
    this.#setOrientation();
    this.#setMultiselectable();
    this.#setListeners();

    //  When setting up on init or after update set the selected and active option
    this.#setSelected(this.#selected, { notify: false });

    //  After an update, the active option stays active if possible
    const flatOptions = this.#getFlatOptions();
    const keptActiveOption =
      this.#activeOption &&
      flatOptions.includes(this.#activeOption) &&
      !this.#isDisabled(this.#activeOption)
        ? this.#activeOption
        : null;

    this.#setActiveOption(
      keptActiveOption ??
        this.#selected[0] ??
        this.#findNonDisabledOption(-1, 1) ??
        flatOptions[0]!,
    );
  }

  #validateConfig(newConfig: ListboxControllerConfig) {
    const { list, options } = newConfig;

    if (!list) {
      throw new Error("Appret listbox: `list` is required.");
    }

    const groupCount = (options ?? []).filter(isGroup).length;
    if (groupCount > 0 && groupCount < options.length) {
      throw new Error(
        "Appret listbox: `options` must be all options or all groups, not both.",
      );
    }

    const groups = groupCount > 0 ? (options as ListboxGroup[]) : [];
    const flatOptions =
      groupCount > 0
        ? groups.flatMap((g) => g.options ?? [])
        : ((options ?? []) as HTMLElement[]);

    if (flatOptions.length === 0) {
      throw new Error("Appret listbox: no options found.");
    }

    const invalidGroups = groups.filter(
      (g) => !g.group || !g.options?.length || !flatTreeContains(list, g.group),
    );

    if (invalidGroups.length > 0) {
      console.warn(
        "Appret listbox: invalid groups:",
        invalidGroups.map((g) => g.group),
      );
    }

    const misplacedOptions = groups.flatMap((g) =>
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
    this.#attributeRecorder.set(this.#config.list, "role", "listbox");

    for (const group of this.#getGroups()) {
      this.#attributeRecorder.set(group.group, "role", "group");
    }
    for (const option of this.#getFlatOptions()) {
      this.#attributeRecorder.set(option, "role", "option");
    }
  }

  #setLabels(element: HTMLElement, label: Label | undefined, name: string) {
    const labelElements = setLabel(element, label, {
      recorder: this.#attributeRecorder,
      prefix: "Appret listbox",
      name,
    });
    this.#hideLabelRoles(labelElements);
  }

  //  Add a presentation role for labels that would be inside the list
  #hideLabelRoles(labelElements: Element[]) {
    for (const el of labelElements) {
      if (flatTreeContains(this.#config.list, el)) {
        this.#attributeRecorder.set(el, "role", "presentation");
      }
    }
  }

  #setOrientation() {
    if (this.#config.orientation) {
      this.#attributeRecorder.set(
        this.#config.list,
        "aria-orientation",
        this.#config.orientation,
      );
    }
  }

  #setMultiselectable() {
    if (this.#config.multiple !== undefined) {
      this.#attributeRecorder.set(
        this.#config.list,
        "aria-multiselectable",
        this.#config.multiple.toString(),
      );
    }
  }

  #setListeners() {
    const { list, orientation, multiple, selectionFollowsFocus } = this.#config;
    const flatOptions = this.#getFlatOptions();

    list.addEventListener(
      "focusin",
      (e) => {
        //  Selection follows focus into the listbox too, when nothing is selected
        if (multiple || !selectionFollowsFocus || this.#selected.length > 0) {
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
          this.#setSelected([option]);
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
            this.#setSelected([option]);
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
            const allSelected = nonDisabled.every((o) =>
              this.#selected.includes(o),
            );
            this.#setSelected(allSelected ? [] : nonDisabled);
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
                this.#setSelected([option]);
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

            if (!multiple && selectionFollowsFocus) {
              this.#setSelected([target]);
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

  #setSelected(optionsToSelect: HTMLElement[], { notify = true } = {}) {
    const flatOptions = this.#getFlatOptions();
    const selected = flatOptions.filter(
      (o) => optionsToSelect.includes(o) && !this.#isDisabled(o),
    );

    for (const option of flatOptions) {
      if (selected.includes(option)) {
        this.#attributeRecorder.set(option, "aria-selected", "true");
      } else if (this.#config.multiple) {
        //  "false" tells that the option can be selected
        this.#attributeRecorder.set(option, "aria-selected", "false");
      } else if (option.getAttribute("aria-selected") === "true") {
        this.#attributeRecorder.remove(option, "aria-selected");
      }
    }

    if (notify && !areSameElementsLists(selected, this.#selected)) {
      triggerCustomEvent(this.host, "appret-listbox-change", {
        option: selected[0] ?? null,
        options: selected,
      });
    }

    this.#selected = selected;
  }

  //  Returns the options to select, or null when the selection should stay as it is
  #validSelection(
    selection: HTMLElement | HTMLElement[] | null,
  ): HTMLElement[] | null {
    const requested =
      selection === null ? [] : Array.isArray(selection) ? selection : [selection];

    if (!this.#config.multiple && requested.length > 1) {
      console.warn(
        "Appret listbox: only one option can be selected without `multiple`:",
        requested,
      );
      return null;
    }

    const flatOptions = this.#getFlatOptions();
    const unknown = requested.filter((o) => !flatOptions.includes(o));
    if (unknown.length > 0) {
      console.warn(
        "Appret listbox: these options aren't among the options:",
        unknown,
      );
    }

    const disabled = requested.filter(
      (o) => flatOptions.includes(o) && this.#isDisabled(o),
    );
    if (disabled.length > 0) {
      console.warn("Appret listbox: can't select disabled options:", disabled);
    }

    const valid = requested.filter(
      (o) => flatOptions.includes(o) && !this.#isDisabled(o),
    );
    if (requested.length > 0 && valid.length === 0) {
      return null;
    }
    return valid;
  }

  #toggleSelectedOption(o: HTMLElement) {
    const isSelected = this.#selected.includes(o);
    if (!isSelected) {
      this.#lastSelectedOption = o;
    }

    this.#setSelected(
      isSelected ? this.#selected.filter((s) => s !== o) : [...this.#selected, o],
    );
  }

  #selectOptionsRange(from: number, to: number) {
    const [start, end] = from < to ? [from, to] : [to, from];
    this.#setSelected([
      ...this.#selected,
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
    const group = this.#getGroups().find((g) => g.options.includes(option));

    return [option, group?.group, this.#config.list].some(
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

  #activateSelectionFromApi() {
    const first = this.#selected[0];
    if (first && !this.#config.list.matches(":focus-within")) {
      this.#setActiveOption(first);
    }
  }

  #getGroups(): ListboxGroup[] {
    const { options } = this.#config;
    return options.every(isGroup) ? options : [];
  }

  #getFlatOptions(): HTMLElement[] {
    const { options } = this.#config;
    return options.every(isGroup)
      ? options.flatMap((g) => g.options)
      : (options as HTMLElement[]);
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

  //  API
  //  Replaces the selection: an option, several options with `multiple`, or null to clear it
  select(selection: HTMLElement | HTMLElement[] | null): void {
    if (this.#destroyed) {
      console.warn("Appret listbox: select() called after destroy().");
      return;
    }

    const options = this.#validSelection(selection);
    if (!options) {
      return;
    }

    this.#setSelected(options, { notify: false });
    this.#activateSelectionFromApi();
  }

  update(
    changes: Omit<Partial<ListboxControllerConfig>, "initialSelection">,
  ): void {
    if (this.#destroyed) {
      console.warn("Appret listbox: update() called after destroy().");
      return;
    }

    const next = copyLists({
      ...this.#config,
      ...changes,
    } as ListboxControllerConfig);

    this.#validateConfig(next);

    const previousSelection = this.#selected;

    this.#teardown();

    this.#config = next;

    //  Keep the selected options that are still there and not disabled
    const selection = this.#getFlatOptions().filter(
      (o) => previousSelection.includes(o) && !this.#isDisabled(o),
    );
    this.#selected = this.#config.multiple ? selection : selection.slice(0, 1);

    this.#setup();
  }

  //  Moves focus to the option reachable with Tab
  focus(options?: FocusOptions): void {
    this.#activeOption?.focus(options);
  }

  get selectedOption(): HTMLElement | null {
    return this.#selected[0] ?? null;
  }

  get selectedOptions(): HTMLElement[] {
    return [...this.#selected];
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#teardown();
    this.#destroyed = true;
  }
}

function areSameElementsLists(listA: HTMLElement[], listB: HTMLElement[]) {
  return (
    listA.length === listB.length && listA.every((el) => listB.includes(el))
  );
}

function isGroup(option: HTMLElement | ListboxGroup): option is ListboxGroup {
  return "group" in option;
}
