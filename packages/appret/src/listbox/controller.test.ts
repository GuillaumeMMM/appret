import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ListboxController,
  type ListboxControllerConfig,
} from "./controller.js";

const fruits = ["Apple", "Avocado", "Banana", "Blueberry", "Cherry"];

type Setup = {
  texts?: string[];
  disabled?: number[];
  dir?: "ltr" | "rtl";
  selectedIndex?: number;
  selectedIndexes?: number[];
  config?: Partial<ListboxControllerConfig>;
};

let controllers: ListboxController[] = [];
let warn: ReturnType<typeof vi.spyOn>;

function setup({
  texts = fruits,
  disabled = [],
  dir,
  selectedIndex,
  selectedIndexes,
  config = {},
}: Setup = {}) {
  const host = document.createElement("div");
  const list = document.createElement("ul");
  const items = texts.map((text, i) => {
    const item = document.createElement("li");
    item.textContent = text;
    if (disabled.includes(i)) item.setAttribute("aria-disabled", "true");
    return item;
  });

  list.append(...items);
  if (dir) host.dir = dir;
  host.append(list);
  document.body.append(host);

  const controller = new ListboxController(host, {
    list,
    options: items,
    label: "Fruit",
    ...(selectedIndex !== undefined && {
      initialSelection: items[selectedIndex],
    }),
    ...(selectedIndexes && {
      multiple: true,
      initialSelection: selectedIndexes.map((i) => items[i]),
    }),
    ...config,
  } as ListboxControllerConfig);
  controllers.push(controller);

  return { host, list, items, controller };
}

type GroupsSetup = {
  disabledGroups?: number[];
  config?: Partial<ListboxControllerConfig>;
};

const meals: [string, string[]][] = [
  ["Starters", ["Soup", "Salad"]],
  ["Mains", ["Pasta", "Risotto", "Curry"]],
  ["Desserts", ["Cake", "Sorbet"]],
];

function setupGroups({ disabledGroups = [], config = {} }: GroupsSetup = {}) {
  const host = document.createElement("div");
  const list = document.createElement("div");
  host.append(list);
  document.body.append(host);

  const groups = meals.map(([name, texts], g) => {
    const group = document.createElement("ul");
    const heading = document.createElement("li");
    heading.id = `group-${g}`;
    heading.textContent = name;
    const options = texts.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    });
    if (disabledGroups.includes(g)) group.setAttribute("aria-disabled", "true");
    group.append(heading, ...options);
    list.append(group);
    return { group, heading, options };
  });

  const controller = new ListboxController(host, {
    list,
    label: "Meal",
    options: groups.map(({ group, heading, options }) => ({
      group,
      options,
      label: { byId: heading.id },
    })),
    ...config,
  } as ListboxControllerConfig);
  controllers.push(controller);

  return {
    host,
    list,
    groups,
    items: groups.flatMap((g) => g.options),
    controller,
  };
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.activeElement!.dispatchEvent(event);
  return event;
}

function selected(items: HTMLElement[]): number[] {
  return items.flatMap((item, i) =>
    item.getAttribute("aria-selected") === "true" ? [i] : [],
  );
}

function tabStops(items: HTMLElement[]): number[] {
  return items.flatMap((item, i) =>
    item.getAttribute("tabindex") === "0" ? [i] : [],
  );
}

function focused(items: HTMLElement[]): number {
  return items.indexOf(document.activeElement as HTMLElement);
}

function changes(host: HTMLElement): unknown[] {
  const details: unknown[] = [];
  host.addEventListener("appret-listbox-change", (e) => details.push(e.detail));
  return details;
}

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const controller of controllers) {
    controller.destroy();
  }
  controllers = [];
  document.body.innerHTML = "";
  warn.mockRestore();
});

describe("roles, states and properties", () => {
  it("gives the list the listbox role and each option the option role", () => {
    const { list, items } = setup();
    expect(list.getAttribute("role")).toBe("listbox");
    for (const item of items) {
      expect(item.getAttribute("role")).toBe("option");
    }
  });

  it("labels the listbox with aria-label", () => {
    const { list } = setup();
    expect(list.getAttribute("aria-label")).toBe("Fruit");
  });

  it("labels the listbox with aria-labelledby", () => {
    const heading = document.createElement("h2");
    heading.id = "fruit-heading";
    document.body.append(heading);
    const { list } = setup({
      config: { label: { byId: "fruit-heading" } },
    });
    expect(list.getAttribute("aria-labelledby")).toBe("fruit-heading");
    expect(heading.hasAttribute("role")).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("leaves aria-orientation unset by default", () => {
    const { list } = setup();
    expect(list.hasAttribute("aria-orientation")).toBe(false);
  });

  it("sets aria-orientation", () => {
    const { list } = setup({ config: { orientation: "horizontal" } });
    expect(list.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("leaves aria-multiselectable unset by default", () => {
    const { list } = setup();
    expect(list.hasAttribute("aria-multiselectable")).toBe(false);
  });

  it("sets aria-multiselectable for multiple selection", () => {
    const { list } = setup({ config: { multiple: true } });
    expect(list.getAttribute("aria-multiselectable")).toBe("true");
  });

  it("makes only the first option reachable with Tab when nothing is selected", () => {
    const { items } = setup();
    expect(tabStops(items)).toEqual([0]);
  });

  it("makes the first enabled option reachable when the first one is disabled", () => {
    const { items } = setup({ disabled: [0, 1] });
    expect(tabStops(items)).toEqual([2]);
  });

  it("keeps the first option reachable when every option is disabled", () => {
    const { items } = setup({ disabled: [0, 1, 2, 3, 4] });
    expect(tabStops(items)).toEqual([0]);
  });
});

describe("single selection", () => {
  it("selects nothing by default", () => {
    const { items } = setup();
    for (const item of items) {
      expect(item.getAttribute("aria-selected")).toBe("false");
    }
  });

  it("selects initialSelection and makes it the tab stop", () => {
    const { items } = setup({
      selectedIndex: 2,
    });
    expect(selected(items)).toEqual([2]);
    expect(tabStops(items)).toEqual([2]);
  });

  it("sets aria-selected false on the options that aren't selected", () => {
    const { items } = setup({
      selectedIndex: 2,
    });
    expect(items[0]!.getAttribute("aria-selected")).toBe("false");
  });

  it("warns and selects nothing when initialSelection is disabled", () => {
    const { items } = setup({
      disabled: [2],
      selectedIndex: 2,
    });
    expect(selected(items)).toEqual([]);
    expect(tabStops(items)).toEqual([0]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("disabled"), [
      items[2],
    ]);
  });

  it("warns when initialSelection isn't one of the options", () => {
    const outsider = document.createElement("li");
    const { items } = setup({ config: { initialSelection: outsider } });
    expect(selected(items)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("aren't among the options"),
      [outsider],
    );
  });

  it("doesn't fire appret-listbox-change for the initial selection", () => {
    const details: unknown[] = [];
    document.body.addEventListener("appret-listbox-change", (e) =>
      details.push(e.detail),
    );
    setup({ selectedIndex: 1 });
    expect(details).toEqual([]);
  });

  describe("clicks", () => {
    it("select the option, focus it and make it the tab stop", () => {
      const { items } = setup();
      items[2]!.click();
      expect(selected(items)).toEqual([2]);
      expect(tabStops(items)).toEqual([2]);
      expect(focused(items)).toBe(2);
    });

    it("replace the previous selection", () => {
      const { items } = setup();
      items[2]!.click();
      items[3]!.click();
      expect(selected(items)).toEqual([3]);
      expect(items[2]!.getAttribute("aria-selected")).toBe("false");
    });

    it("are ignored on a disabled option", () => {
      const { items } = setup({ disabled: [2] });
      items[2]!.click();
      expect(selected(items)).toEqual([]);
      expect(tabStops(items)).toEqual([0]);
    });

    it("are ignored when the event was already handled", () => {
      const { items } = setup();
      items[2]!.addEventListener("click", (e) => e.preventDefault(), {
        capture: true,
      });
      items[2]!.click();
      expect(selected(items)).toEqual([]);
    });
  });

  describe("appret-listbox-change", () => {
    it("fires with the selected option", () => {
      const { host, items } = setup();
      const details = changes(host);
      items[1]!.click();
      expect(details).toEqual([{ option: items[1], options: [items[1]] }]);
    });

    it("doesn't fire when the selected option is selected again", () => {
      const { host, items } = setup();
      const details = changes(host);
      items[1]!.click();
      items[1]!.click();
      expect(details).toHaveLength(1);
    });

    it("bubbles from the host", () => {
      const { items } = setup();
      const details: unknown[] = [];
      document.body.addEventListener("appret-listbox-change", (e) =>
        details.push(e.detail),
      );
      items[1]!.click();
      expect(details).toEqual([{ option: items[1], options: [items[1]] }]);
    });
  });
});

describe("keyboard", () => {
  it("Down Arrow moves focus and the tab stop to the next option", () => {
    const { items } = setup();
    items[0]!.focus();
    const event = press("ArrowDown");
    expect(focused(items)).toBe(1);
    expect(tabStops(items)).toEqual([1]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Up Arrow moves focus to the previous option", () => {
    const { items } = setup();
    items[0]!.focus();
    press("ArrowDown");
    press("ArrowDown");
    press("ArrowUp");
    expect(focused(items)).toBe(1);
  });

  it("doesn't change the selection by default", () => {
    const { items } = setup({
      selectedIndex: 0,
    });
    items[0]!.focus();
    press("ArrowDown");
    expect(selected(items)).toEqual([0]);
  });

  it("doesn't wrap at the end", () => {
    const { items } = setup();
    items[0]!.focus();
    press("End");
    const event = press("ArrowDown");
    expect(focused(items)).toBe(4);
    expect(event.defaultPrevented).toBe(false);
  });

  it("doesn't wrap at the start", () => {
    const { items } = setup();
    items[0]!.focus();
    const event = press("ArrowUp");
    expect(focused(items)).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("Home and End move focus to the first and last options", () => {
    const { items } = setup();
    items[0]!.focus();
    press("End");
    expect(focused(items)).toBe(4);
    press("Home");
    expect(focused(items)).toBe(0);
  });

  it("Space selects the focused option", () => {
    const { items } = setup();
    items[0]!.focus();
    press("ArrowDown");
    const event = press(" ");
    expect(selected(items)).toEqual([1]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves Enter to the page", () => {
    const { items } = setup();
    items[0]!.focus();
    const event = press("Enter");
    expect(selected(items)).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves Tab to the page", () => {
    const { items } = setup({ texts: ["Apple", "Tablet"] });
    items[0]!.focus();
    const event = press("Tab");
    expect(focused(items)).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores keys with Ctrl, Meta or Alt", () => {
    const { items } = setup();
    items[0]!.focus();
    press("ArrowDown", { ctrlKey: true });
    press("ArrowDown", { metaKey: true });
    press("ArrowDown", { altKey: true });
    expect(focused(items)).toBe(0);
  });

  it("ignores keys already handled", () => {
    const { items } = setup();
    items[0]!.focus();
    items[0]!.addEventListener("keydown", (e) => e.preventDefault(), {
      capture: true,
    });
    press("ArrowDown");
    expect(focused(items)).toBe(0);
  });

  describe("leaving the listbox", () => {
    function leave() {
      const outside = document.createElement("button");
      document.body.append(outside);
      outside.focus();
    }

    it("brings Tab back to the selected option after focus moved without selecting", () => {
      const { items } = setup({ selectedIndex: 1 });
      items[1]!.focus();
      press("ArrowDown");
      press("ArrowDown");
      leave();
      expect(tabStops(items)).toEqual([1]);
    });

    it("brings Tab back to the first enabled option when nothing is selected", () => {
      const { items } = setup({ disabled: [0] });
      items[1]!.focus();
      press("End");
      leave();
      expect(tabStops(items)).toEqual([1]);
    });

    it("brings Tab back to the first selected option in multiple selection", () => {
      const { items } = setup({ selectedIndexes: [3, 1] });
      items[1]!.focus();
      press("End");
      leave();
      expect(tabStops(items)).toEqual([1]);
    });

    it("keeps the tab stop on the focused option while focus stays inside", () => {
      const { items } = setup({ selectedIndex: 0 });
      items[0]!.focus();
      press("ArrowDown");
      expect(tabStops(items)).toEqual([1]);
      expect(focused(items)).toBe(1);
    });
  });

  describe("disabled options", () => {
    it("are skipped by Down and Up Arrows", () => {
      const { items } = setup({ disabled: [1, 2] });
      items[0]!.focus();
      press("ArrowDown");
      expect(focused(items)).toBe(3);
      press("ArrowUp");
      expect(focused(items)).toBe(0);
    });

    it("are skipped by Home and End", () => {
      const { items } = setup({ disabled: [0, 4] });
      items[1]!.focus();
      press("End");
      expect(focused(items)).toBe(3);
      press("Home");
      expect(focused(items)).toBe(1);
    });

    it("stop the arrows when no enabled option is left in that direction", () => {
      const { items } = setup({ disabled: [3, 4] });
      items[0]!.focus();
      press("ArrowDown");
      press("ArrowDown");
      expect(focused(items)).toBe(2);
      press("ArrowDown");
      expect(focused(items)).toBe(2);
    });

    it("can't be selected with Space", () => {
      const { items } = setup({ disabled: [2] });
      items[2]!.focus();
      press(" ");
      expect(selected(items)).toEqual([]);
    });

    it("are read when the key is pressed", () => {
      const { items } = setup();
      items[1]!.setAttribute("aria-disabled", "true");
      items[0]!.focus();
      press("ArrowDown");
      expect(focused(items)).toBe(2);
    });

    it("include every option of a disabled listbox", () => {
      const { list, items } = setup();
      list.setAttribute("aria-disabled", "true");
      items[0]!.click();
      expect(selected(items)).toEqual([]);
    });
  });

  describe("horizontal", () => {
    it("Right and Left Arrows move focus", () => {
      const { items } = setup({ config: { orientation: "horizontal" } });
      items[0]!.focus();
      press("ArrowRight");
      press("ArrowRight");
      expect(focused(items)).toBe(2);
      press("ArrowLeft");
      expect(focused(items)).toBe(1);
    });

    it("leaves Down and Up Arrows to the page", () => {
      const { items } = setup({ config: { orientation: "horizontal" } });
      items[0]!.focus();
      const event = press("ArrowDown");
      expect(focused(items)).toBe(0);
      expect(event.defaultPrevented).toBe(false);
    });

    it("swaps Left and Right in right-to-left", () => {
      const { items } = setup({
        dir: "rtl",
        config: { orientation: "horizontal" },
      });
      items[0]!.focus();
      press("ArrowLeft");
      expect(focused(items)).toBe(1);
      press("ArrowRight");
      expect(focused(items)).toBe(0);
    });
  });

  describe("vertical", () => {
    it("leaves Left and Right Arrows to the page", () => {
      const { items } = setup();
      items[0]!.focus();
      const event = press("ArrowRight");
      expect(focused(items)).toBe(0);
      expect(event.defaultPrevented).toBe(false);
    });

    it("doesn't change Down and Up in right-to-left", () => {
      const { items } = setup({ dir: "rtl" });
      items[0]!.focus();
      press("ArrowDown");
      expect(focused(items)).toBe(1);
    });
  });

  describe("selectionFollowsFocus", () => {
    it("selects the option focus moves to", () => {
      const { host, items } = setup({
        selectedIndex: 0,
        config: { selectionFollowsFocus: true },
      });
      const details = changes(host);
      items[0]!.focus();
      press("ArrowDown");
      expect(selected(items)).toEqual([1]);
      press("End");
      expect(selected(items)).toEqual([4]);
      expect(details).toEqual([
        { option: items[1], options: [items[1]] },
        { option: items[4], options: [items[4]] },
      ]);
    });

    it("selects the option that gets focus when focus enters the listbox", () => {
      const { host, items } = setup({ config: { selectionFollowsFocus: true } });
      const details = changes(host);
      items[0]!.focus();
      expect(selected(items)).toEqual([0]);
      expect(details).toEqual([{ option: items[0], options: [items[0]] }]);
    });

    it("doesn't change an existing selection when focus enters the listbox", () => {
      const { items } = setup({
        selectedIndex: 2,
        config: { selectionFollowsFocus: true },
      });
      items[0]!.focus();
      expect(selected(items)).toEqual([2]);
    });

    it("doesn't select disabled options, since focus skips them", () => {
      const { items } = setup({
        disabled: [1],
        config: { selectionFollowsFocus: true },
      });
      items[0]!.focus();
      press("ArrowDown");
      expect(selected(items)).toEqual([2]);
    });
  });

  it("doesn't select on focus by default", () => {
    const { items } = setup();
    items[0]!.focus();
    expect(selected(items)).toEqual([]);
  });
});

describe("type-ahead", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves focus to the next option starting with the typed character", () => {
    const { items } = setup();
    items[0]!.focus();
    const event = press("b");
    expect(focused(items)).toBe(2);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores case", () => {
    const { items } = setup();
    items[0]!.focus();
    press("B", { shiftKey: true });
    expect(focused(items)).toBe(2);
  });

  it("matches the characters typed in quick succession", () => {
    const { items } = setup();
    items[0]!.focus();
    press("b");
    press("l");
    expect(focused(items)).toBe(3);
  });

  it("cycles through the options starting with a repeated character", () => {
    const { items } = setup();
    items[0]!.focus();
    press("b");
    press("b");
    expect(focused(items)).toBe(3);
    press("b");
    expect(focused(items)).toBe(2);
  });

  it("starts a new search after a pause", () => {
    const { items } = setup();
    items[0]!.focus();
    press("b");
    vi.advanceTimersByTime(500);
    press("a");
    expect(focused(items)).toBe(0);
  });

  it("wraps around to the start", () => {
    const { items } = setup();
    items[0]!.focus();
    press("End");
    press("a");
    expect(focused(items)).toBe(0);
  });

  it("skips disabled options", () => {
    const { items } = setup({ disabled: [0] });
    items[4]!.focus();
    press("a");
    expect(focused(items)).toBe(1);
  });

  it("ignores leading whitespace in the option's text", () => {
    const { items } = setup({ texts: ["Apple", "\n  Banana\n"] });
    items[0]!.focus();
    press("b");
    expect(focused(items)).toBe(1);
  });

  it("leaves focus where it is when nothing matches", () => {
    const { items } = setup();
    items[0]!.focus();
    const event = press("z");
    expect(focused(items)).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("matches an option's aria-label before its text", () => {
    const { items } = setup({ texts: ["Apple", "🍌", "Cherry"] });
    items[1]!.setAttribute("aria-label", "Banana");
    items[0]!.focus();
    press("b");
    expect(focused(items)).toBe(1);
  });

  it("treats Space as part of the search while typing", () => {
    const { items } = setup({
      texts: ["New Delhi", "Newcastle", "New York"],
    });
    items[0]!.focus();
    for (const key of ["n", "e", "w", " ", "y"]) press(key);
    expect(focused(items)).toBe(2);
    expect(selected(items)).toEqual([]);
  });

  it("selects the option when selection follows focus", () => {
    const { items } = setup({ config: { selectionFollowsFocus: true } });
    items[0]!.focus();
    press("c");
    expect(selected(items)).toEqual([4]);
  });

  it("leaves Ctrl and Meta shortcuts to the page in multiple selection", () => {
    const { items } = setup({ config: { multiple: true } });
    items[0]!.focus();
    const ctrl = press("b", { ctrlKey: true });
    const meta = press("c", { metaKey: true });
    expect(focused(items)).toBe(0);
    expect(ctrl.defaultPrevented).toBe(false);
    expect(meta.defaultPrevented).toBe(false);
  });

  it("clears its timer on destroy()", () => {
    const { items, controller } = setup();
    items[0]!.focus();
    press("b");
    const pending = vi.getTimerCount();
    controller.destroy();
    expect(vi.getTimerCount()).toBe(pending - 1);
  });
});

describe("multiple selection", () => {
  const multiple = (config: Partial<ListboxControllerConfig> = {}) =>
    ({ multiple: true, ...config }) as Partial<ListboxControllerConfig>;

  it("sets aria-selected false on the options that aren't selected", () => {
    const { items } = setup({ config: multiple() });
    for (const item of items) {
      expect(item.getAttribute("aria-selected")).toBe("false");
    }
  });

  it("selects initialSelectedOptions", () => {
    const { items } = setup({
      selectedIndexes: [3, 1],
    });
    expect(selected(items)).toEqual([1, 3]);
  });

  it("makes the first selected option, in DOM order, the only tab stop", () => {
    const { items } = setup({
      selectedIndexes: [3, 1],
    });
    expect(tabStops(items)).toEqual([1]);
  });

  it("warns about initialSelection options that are disabled or not among the options", () => {
    const outsider = document.createElement("li");
    const list = document.createElement("ul");
    const items = fruits.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    });
    items[2]!.setAttribute("aria-disabled", "true");
    list.append(...items);
    document.body.append(list);
    controllers.push(
      new ListboxController(list, {
        list,
        options: items,
        label: "Fruit",
        multiple: true,
        initialSelection: [items[0]!, items[2]!, outsider],
      }),
    );
    expect(selected(items)).toEqual([0]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("aren't among the options"),
      [outsider],
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("disabled"), [
      items[2],
    ]);
  });

  it("Space toggles the focused option", () => {
    const { items } = setup({ config: multiple() });
    items[0]!.focus();
    press(" ");
    expect(selected(items)).toEqual([0]);
    press("ArrowDown");
    press(" ");
    expect(selected(items)).toEqual([0, 1]);
    press(" ");
    expect(selected(items)).toEqual([0]);
  });

  it("arrows move focus without changing the selection", () => {
    const { items } = setup({
      selectedIndexes: [0],
    });
    items[0]!.focus();
    press("ArrowDown");
    press("End");
    expect(selected(items)).toEqual([0]);
    expect(focused(items)).toBe(4);
  });

  it("clicks toggle the clicked option", () => {
    const { items } = setup({ config: multiple() });
    items[1]!.click();
    items[3]!.click();
    expect(selected(items)).toEqual([1, 3]);
    items[1]!.click();
    expect(selected(items)).toEqual([3]);
    expect(focused(items)).toBe(1);
  });

  it("Shift + Down Arrow moves focus and toggles the next option", () => {
    const { items } = setup({ config: multiple() });
    items[0]!.focus();
    press("ArrowDown", { shiftKey: true });
    press("ArrowDown", { shiftKey: true });
    expect(focused(items)).toBe(2);
    expect(selected(items)).toEqual([1, 2]);
  });

  it("Shift + Up Arrow moves focus and toggles the previous option", () => {
    const { items } = setup({ config: multiple() });
    items[0]!.focus();
    press("End");
    press("ArrowUp", { shiftKey: true });
    expect(focused(items)).toBe(3);
    expect(selected(items)).toEqual([3]);
  });

  it("Shift + arrows skip disabled options", () => {
    const { items } = setup({ disabled: [1], config: multiple() });
    items[0]!.focus();
    press("ArrowDown", { shiftKey: true });
    expect(selected(items)).toEqual([2]);
  });

  it("Ctrl + A selects every enabled option, then unselects them", () => {
    const { items } = setup({ disabled: [2], config: multiple() });
    items[0]!.focus();
    const event = press("a", { ctrlKey: true });
    expect(selected(items)).toEqual([0, 1, 3, 4]);
    expect(event.defaultPrevented).toBe(true);
    press("a", { ctrlKey: true });
    expect(selected(items)).toEqual([]);
  });

  it("Cmd + A works like Ctrl + A", () => {
    const { items } = setup({ config: multiple() });
    items[0]!.focus();
    press("a", { metaKey: true });
    expect(selected(items)).toEqual([0, 1, 2, 3, 4]);
  });

  it("Ctrl + A does nothing in single selection", () => {
    const { items } = setup();
    items[0]!.focus();
    const event = press("a", { ctrlKey: true });
    expect(selected(items)).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  describe("Shift + Space", () => {
    it("selects from the last selected option down to the focused one", () => {
      const { items } = setup({ config: multiple() });
      items[0]!.focus();
      press(" ");
      press("ArrowDown");
      press("ArrowDown");
      press("ArrowDown");
      press(" ", { shiftKey: true });
      expect(selected(items)).toEqual([0, 1, 2, 3]);
    });

    it("selects from the last selected option up to the focused one", () => {
      const { items } = setup({ config: multiple() });
      items[0]!.focus();
      press("End");
      press(" ");
      press("ArrowUp");
      press("ArrowUp");
      press(" ", { shiftKey: true });
      expect(selected(items)).toEqual([2, 3, 4]);
    });

    it("uses the option selected most recently, not the last one in the list", () => {
      const { items } = setup({ config: multiple() });
      items[4]!.click();
      items[1]!.click();
      items[1]!.focus();
      press("ArrowDown");
      press("ArrowDown");
      press(" ", { shiftKey: true });
      expect(selected(items)).toEqual([1, 2, 3, 4]);
    });

    it("keeps the options already selected outside the range", () => {
      const { items } = setup({
        selectedIndexes: [4],
      });
      items[0]!.focus();
      press(" ");
      press("ArrowDown");
      press(" ", { shiftKey: true });
      expect(selected(items)).toEqual([0, 1, 4]);
    });

    it("skips disabled options in the range", () => {
      const { items } = setup({ disabled: [1], config: multiple() });
      items[0]!.focus();
      press(" ");
      press("ArrowDown");
      press(" ", { shiftKey: true });
      expect(selected(items)).toEqual([0, 2]);
    });

    it("toggles the focused option when nothing was selected yet", () => {
      const { items } = setup({ config: multiple() });
      items[0]!.focus();
      press("ArrowDown");
      press(" ", { shiftKey: true });
      expect(selected(items)).toEqual([1]);
    });
  });

  describe("Ctrl + Shift + Home and End", () => {
    it("Home selects from the focused option to the first one and moves focus there", () => {
      const { items } = setup({ config: multiple() });
      items[0]!.focus();
      press("ArrowDown");
      press("ArrowDown");
      press("Home", { ctrlKey: true, shiftKey: true });
      expect(selected(items)).toEqual([0, 1, 2]);
      expect(focused(items)).toBe(0);
    });

    it("End selects from the focused option to the last one and moves focus there", () => {
      const { items } = setup({ config: multiple() });
      items[0]!.focus();
      press("ArrowDown");
      press("ArrowDown");
      press("End", { ctrlKey: true, shiftKey: true });
      expect(selected(items)).toEqual([2, 3, 4]);
      expect(focused(items)).toBe(4);
    });

    it("keep the options already selected", () => {
      const { items } = setup({
        selectedIndexes: [4],
      });
      items[0]!.focus();
      press("ArrowDown");
      press("Home", { ctrlKey: true, shiftKey: true });
      expect(selected(items)).toEqual([0, 1, 4]);
    });
  });

  describe("appret-listbox-change", () => {
    it("fires with the selected options in DOM order", () => {
      const { host, items } = setup({ config: multiple() });
      const details = changes(host);
      items[3]!.click();
      items[1]!.click();
      expect(details).toEqual([
        { option: items[3], options: [items[3]] },
        { option: items[1], options: [items[1], items[3]] },
      ]);
    });

    it("fires with an empty list when the last option is unselected", () => {
      const { host, items } = setup({ config: multiple() });
      const details = changes(host);
      items[1]!.click();
      items[1]!.click();
      expect(details.at(-1)).toEqual({ option: null, options: [] });
    });

    it("doesn't fire when the selection doesn't change", () => {
      const { host, items } = setup({
        selectedIndexes: [0, 1],
      });
      const details = changes(host);
      items[0]!.click();
      items[0]!.click();
      items[1]!.focus();
      press(" ", { shiftKey: true });
      expect(details).toHaveLength(2);
    });
  });
});

describe("groups", () => {
  it("gives each group the group role and labels it", () => {
    const { groups } = setupGroups();
    groups.forEach(({ group, heading }) => {
      expect(group.getAttribute("role")).toBe("group");
      expect(group.getAttribute("aria-labelledby")).toBe(heading.id);
    });
  });

  it("gives the options the option role", () => {
    const { items } = setupGroups();
    for (const item of items) {
      expect(item.getAttribute("role")).toBe("option");
    }
  });

  it("gives a group label inside the listbox the presentation role", () => {
    const { groups } = setupGroups();
    for (const { heading } of groups) {
      expect(heading.getAttribute("role")).toBe("presentation");
    }
  });

  it("labels a group with aria-label", () => {
    const { list, groups, controller } = setupGroups();
    controller.destroy();
    controllers.push(
      new ListboxController(list, {
        list,
        label: "Meal",
        options: groups.map(({ group, options }, i) => ({
          group,
          options,
          label: meals[i]![0],
        })),
      }),
    );
    expect(groups[1]!.group.getAttribute("aria-label")).toBe("Mains");
    expect(groups[1]!.heading.hasAttribute("role")).toBe(false);
  });

  it("moves focus across groups with the arrows", () => {
    const { items } = setupGroups();
    items[0]!.focus();
    press("ArrowDown");
    press("ArrowDown");
    expect(items[focused(items)]!.textContent).toBe("Pasta");
    press("ArrowUp");
    expect(items[focused(items)]!.textContent).toBe("Salad");
  });

  it("Home and End go to the first and last options of the whole listbox", () => {
    const { items } = setupGroups();
    items[3]!.focus();
    press("End");
    expect(items[focused(items)]!.textContent).toBe("Sorbet");
    press("Home");
    expect(items[focused(items)]!.textContent).toBe("Soup");
  });

  it("skips the options of a disabled group", () => {
    const { items } = setupGroups({ disabledGroups: [1] });
    items[0]!.focus();
    press("ArrowDown");
    press("ArrowDown");
    expect(items[focused(items)]!.textContent).toBe("Cake");
  });

  it("doesn't select the options of a disabled group", () => {
    const { groups } = setupGroups({ disabledGroups: [1] });
    groups[1]!.options[0]!.click();
    expect(selected(groups[1]!.options)).toEqual([]);
  });

  it("type-ahead searches every group", () => {
    vi.useFakeTimers();
    const { items } = setupGroups();
    items[0]!.focus();
    press("c");
    expect(items[focused(items)]!.textContent).toBe("Curry");
    vi.useRealTimers();
  });

  it("Ctrl + A selects the options of every group in multiple selection", () => {
    const { items } = setupGroups({
      disabledGroups: [2],
      config: { multiple: true },
    });
    items[0]!.focus();
    press("a", { ctrlKey: true });
    expect(selected(items)).toEqual([0, 1, 2, 3, 4]);
  });

  it("Shift + Space selects a range across groups", () => {
    const { items } = setupGroups({ config: { multiple: true } });
    items[1]!.click();
    items[1]!.focus();
    press("ArrowDown");
    press("ArrowDown");
    press(" ", { shiftKey: true });
    expect(selected(items)).toEqual([1, 2, 3]);
  });
});

describe("errors and warnings", () => {
  it("throws without a list", () => {
    expect(
      () =>
        new ListboxController(document.createElement("div"), {
          options: [document.createElement("li")],
        } as unknown as ListboxControllerConfig),
    ).toThrow("`list` is required");
  });

  it("throws when there are no options", () => {
    expect(() => setup({ texts: [] })).toThrow("no options found");
  });

  it("throws when the groups have no options", () => {
    const list = document.createElement("div");
    const group = document.createElement("ul");
    list.append(group);
    expect(
      () =>
        new ListboxController(list, {
          list,
          label: "Empty",
          options: [{ group, options: [] }],
        }),
    ).toThrow("no options found");
  });

  it("throws when options mixes options and groups", () => {
    const list = document.createElement("div");
    const option = document.createElement("div");
    const group = document.createElement("ul");
    const grouped = document.createElement("li");
    group.append(grouped);
    list.append(option, group);
    expect(
      () =>
        new ListboxController(list, {
          list,
          options: [option, { group, options: [grouped] }],
        } as unknown as ListboxControllerConfig),
    ).toThrow("not both");
  });

  it("changes nothing in the markup when it throws", () => {
    const list = document.createElement("ul");
    const html = list.outerHTML;
    expect(
      () => new ListboxController(list, { list, options: [], label: "None" }),
    ).toThrow();
    expect(list.outerHTML).toBe(html);
  });

  it("warns about options that aren't inside the list", () => {
    const outsider = document.createElement("li");
    document.body.append(outsider);
    const list = document.createElement("ul");
    const inside = document.createElement("li");
    list.append(inside);
    document.body.append(list);
    controllers.push(
      new ListboxController(list, {
        list,
        options: [inside, outsider],
        label: "Fruit",
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("aren't inside `list`"),
      [outsider],
    );
  });

  it("warns about options that aren't inside their group", () => {
    const list = document.createElement("div");
    const first = document.createElement("ul");
    const second = document.createElement("ul");
    const misplaced = document.createElement("li");
    const option = document.createElement("li");
    first.append(option);
    second.append(misplaced);
    list.append(first, second);
    document.body.append(list);
    controllers.push(
      new ListboxController(list, {
        list,
        label: "Meal",
        options: [{ group: first, options: [option, misplaced], label: "One" }],
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("aren't inside their group"),
      [misplaced],
    );
  });

  it("warns about groups that are empty or outside the list", () => {
    const list = document.createElement("div");
    const group = document.createElement("ul");
    const empty = document.createElement("ul");
    const outside = document.createElement("ul");
    const option = document.createElement("li");
    const outsideOption = document.createElement("li");
    group.append(option);
    outside.append(outsideOption);
    list.append(group, empty);
    document.body.append(list, outside);
    controllers.push(
      new ListboxController(list, {
        list,
        label: "Meal",
        options: [
          { group, options: [option], label: "One" },
          { group: empty, options: [], label: "Two" },
          { group: outside, options: [outsideOption], label: "Three" },
        ],
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("invalid groups"),
      [empty, outside],
    );
  });

  it("warns when the listbox has no label", () => {
    const { list } = setup({ config: { label: undefined } });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("missing an accessible label"),
      list,
    );
  });

  it("doesn't warn when the markup already labels the listbox", () => {
    const list = document.createElement("ul");
    list.setAttribute("aria-label", "Fruit");
    const option = document.createElement("li");
    list.append(option);
    document.body.append(list);
    controllers.push(new ListboxController(list, { list, options: [option] }));
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when a group has no label", () => {
    const list = document.createElement("div");
    const group = document.createElement("ul");
    const option = document.createElement("li");
    group.append(option);
    list.append(group);
    document.body.append(list);
    controllers.push(
      new ListboxController(list, {
        list,
        label: "Meal",
        options: [{ group, options: [option] }],
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("missing an accessible label"),
      group,
    );
  });

  it("warns about label IDs that don't exist in the listbox's root", () => {
    setup({ config: { label: { byId: "nowhere elsewhere" } } });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ID missing"), [
      "nowhere",
      "elsewhere",
    ]);
  });

  it("warns about options with aria-checked", () => {
    const list = document.createElement("ul");
    const checked = document.createElement("li");
    checked.setAttribute("aria-checked", "true");
    list.append(checked);
    document.body.append(list);
    controllers.push(
      new ListboxController(list, { list, options: [checked], label: "Fruit" }),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("aria-checked"),
      [checked],
    );
  });

  it("treats blank label IDs as no label", () => {
    const { list } = setup({ config: { label: { byId: "  " } } });
    expect(list.hasAttribute("aria-labelledby")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("missing an accessible label"),
      list,
    );
  });

  it("doesn't warn for a working setup", () => {
    setup();
    setupGroups();
    setup({ config: { multiple: true, initialSelection: [] } });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("shadow DOM", () => {
  function setupInShadowRoot(byId: string) {
    const component = document.createElement("div");
    document.body.append(component);
    const root = component.attachShadow({ mode: "open" });
    root.innerHTML = `<span id="inner-label">Fruit</span><ul><li>Apple</li><li>Banana</li></ul>`;
    const list = root.querySelector("ul")!;
    const items = [...root.querySelectorAll("li")];
    controllers.push(
      new ListboxController(component, {
        list,
        options: items,
        label: { byId },
      }),
    );
    return { root, list, items };
  }

  it("finds label IDs in the listbox's shadow root", () => {
    const { list } = setupInShadowRoot("inner-label");
    expect(list.getAttribute("aria-labelledby")).toBe("inner-label");
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns about label IDs that are only in the page", () => {
    const heading = document.createElement("h2");
    heading.id = "page-label";
    document.body.append(heading);
    setupInShadowRoot("page-label");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ID missing"), [
      "page-label",
    ]);
  });

  it("handles the keyboard inside the shadow root", () => {
    const { root, items } = setupInShadowRoot("inner-label");
    items[0]!.focus();
    items[0]!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(root.activeElement).toBe(items[1]);
  });
});

describe("label elements", () => {
  let uninstall: () => void;

  beforeAll(() => {
    uninstall = installAriaElementReflection();
  });
  afterAll(() => {
    uninstall();
  });

  it("labels the listbox with the given elements", () => {
    const heading = document.createElement("h2");
    document.body.append(heading);
    const { list } = setup({
      config: { label: { byElements: [heading] } },
    });
    expect(list.ariaLabelledByElements).toEqual([heading]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("gives a label element inside the listbox the presentation role", () => {
    const { list, items } = setup();
    controllers.pop()!.destroy();
    const heading = document.createElement("li");
    list.prepend(heading);
    controllers.push(
      new ListboxController(list, {
        list,
        options: items,
        label: { byElements: [heading] },
      }),
    );
    expect(heading.getAttribute("role")).toBe("presentation");
  });

  it("warns about elements inside another shadow root", () => {
    const component = document.createElement("div");
    document.body.append(component);
    const root = component.attachShadow({ mode: "open" });
    const hidden = document.createElement("span");
    root.append(hidden);
    setup({ config: { label: { byElements: [hidden] } } });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("inside another shadow root"),
      [hidden],
    );
  });
});

describe("select()", () => {
  it("selects an option", () => {
    const { items, controller } = setup();
    controller.select(items[2]!);
    expect(selected(items)).toEqual([2]);
    expect(controller.selectedOption).toBe(items[2]);
    expect(controller.selectedOptions).toEqual([items[2]]);
  });

  it("clears the selection with null", () => {
    const { items, controller } = setup({ selectedIndex: 2 });
    controller.select(null);
    expect(selected(items)).toEqual([]);
    expect(items[2]!.getAttribute("aria-selected")).toBe("false");
    expect(controller.selectedOption).toBeNull();
    expect(controller.selectedOptions).toEqual([]);
  });

  it("doesn't fire appret-listbox-change", () => {
    const { host, items, controller } = setup();
    const details = changes(host);
    controller.select(items[2]!);
    expect(details).toEqual([]);
  });

  it("moves the tab stop to the selected option", () => {
    const { items, controller } = setup();
    controller.select(items[3]!);
    expect(tabStops(items)).toEqual([3]);
  });

  it("leaves the tab stop with the user when focus is in the listbox", () => {
    const { items, controller } = setup();
    items[0]!.focus();
    press("ArrowDown");
    controller.select(items[3]!);
    expect(tabStops(items)).toEqual([1]);
    expect(focused(items)).toBe(1);
  });

  it("keeps the tab stop when the selection is cleared", () => {
    const { items, controller } = setup({ selectedIndex: 2 });
    controller.select(null);
    expect(tabStops(items)).toEqual([2]);
  });

  it("doesn't move focus", () => {
    const { items, controller } = setup();
    items[0]!.focus();
    controller.select(items[3]!);
    expect(focused(items)).toBe(0);
  });

  it("warns and ignores an element that isn't one of the options", () => {
    const { items, controller } = setup({ selectedIndex: 1 });
    const outsider = document.createElement("li");
    controller.select(outsider);
    expect(selected(items)).toEqual([1]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("aren't among the options"),
      [outsider],
    );
  });

  it("warns and ignores a disabled option", () => {
    const { items, controller } = setup({ disabled: [2], selectedIndex: 1 });
    controller.select(items[2]!);
    expect(selected(items)).toEqual([1]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("disabled"), [
      items[2],
    ]);
  });

  it("replaces the selection with that option in multiple selection", () => {
    const { items, controller } = setup({ selectedIndexes: [0, 1] });
    controller.select(items[3]!);
    expect(selected(items)).toEqual([3]);
    controller.select(null);
    expect(selected(items)).toEqual([]);
  });

  it("warns and does nothing after destroy()", () => {
    const { items, controller } = setup();
    controller.destroy();
    controller.select(items[1]!);
    expect(items[1]!.hasAttribute("aria-selected")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("after destroy()"),
    );
  });
});

describe("select() with multiple selection", () => {
  it("replaces the selection", () => {
    const { items, controller } = setup({ selectedIndexes: [0] });
    controller.select([items[4]!, items[2]!]);
    expect(selected(items)).toEqual([2, 4]);
    expect(controller.selectedOptions).toEqual([items[2], items[4]]);
    expect(controller.selectedOption).toBe(items[2]);
  });

  it("clears the selection with an empty array", () => {
    const { items, controller } = setup({ selectedIndexes: [0, 1] });
    controller.select([]);
    expect(selected(items)).toEqual([]);
    expect(items[0]!.getAttribute("aria-selected")).toBe("false");
  });

  it("doesn't fire appret-listbox-change", () => {
    const { host, items, controller } = setup({ selectedIndexes: [] });
    const details = changes(host);
    controller.select([items[1]!]);
    expect(details).toEqual([]);
  });

  it("moves the tab stop to the first selected option", () => {
    const { items, controller } = setup({ selectedIndexes: [] });
    controller.select([items[4]!, items[2]!]);
    expect(tabStops(items)).toEqual([2]);
  });

  it("warns about options that aren't among the options and selects the others", () => {
    const { items, controller } = setup({ selectedIndexes: [0] });
    const outsider = document.createElement("li");
    controller.select([items[1]!, outsider]);
    expect(selected(items)).toEqual([1]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("aren't among the options"),
      [outsider],
    );
  });

  it("warns about disabled options and selects the others", () => {
    const { items, controller } = setup({
      disabled: [2],
      selectedIndexes: [0],
    });
    controller.select([items[1]!, items[2]!]);
    expect(selected(items)).toEqual([1]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("disabled"), [
      items[2],
    ]);
  });

  it("keeps the selection when none of the options can be selected", () => {
    const { items, controller } = setup({
      disabled: [2],
      selectedIndexes: [0],
    });
    controller.select([items[2]!, document.createElement("li")]);
    expect(selected(items)).toEqual([0]);
  });

  it("accepts an array of one option in single selection", () => {
    const { items, controller } = setup();
    controller.select([items[1]!]);
    expect(selected(items)).toEqual([1]);
  });

  it("warns and does nothing with several options in single selection", () => {
    const { items, controller } = setup({ selectedIndex: 0 });
    controller.select([items[1]!, items[2]!]);
    expect(selected(items)).toEqual([0]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("only one option can be selected"),
      [items[1], items[2]],
    );
  });

  it("returns a copy of the selection", () => {
    const { items, controller } = setup({ selectedIndexes: [0] });
    controller.selectedOptions.push(items[1]!);
    expect(controller.selectedOptions).toEqual([items[0]]);
  });

  it("warns and does nothing after destroy()", () => {
    const { items, controller } = setup({ selectedIndexes: [] });
    controller.destroy();
    controller.select([items[1]!]);
    expect(items[1]!.hasAttribute("aria-selected")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("after destroy()"),
    );
  });
});

describe("update()", () => {
  function addItem(list: HTMLElement, text: string) {
    const item = document.createElement("li");
    item.textContent = text;
    list.append(item);
    return item;
  }

  describe("selection", () => {
    it("keeps the selected option when it's still there", () => {
      const { list, items, controller } = setup({ selectedIndex: 2 });
      const added = addItem(list, "Date");
      controller.update({ options: [...items, added] });
      expect(controller.selectedOption).toBe(items[2]);
      expect(items[2]!.getAttribute("aria-selected")).toBe("true");
    });

    it("selects nothing when the selected option is removed", () => {
      const { items, controller } = setup({ selectedIndex: 2 });
      controller.update({ options: items.filter((_, i) => i !== 2) });
      expect(controller.selectedOption).toBeNull();
      expect(items[2]!.hasAttribute("aria-selected")).toBe(false);
    });

    it("drops the selected option when it became disabled", () => {
      const { items, controller } = setup({ selectedIndex: 2 });
      items[2]!.setAttribute("aria-disabled", "true");
      controller.update({});
      expect(controller.selectedOption).toBeNull();
    });

    it("keeps the selected options that are still there in multiple selection", () => {
      const { items, controller } = setup({ selectedIndexes: [1, 3] });
      controller.update({ options: items.filter((_, i) => i !== 1) });
      expect(controller.selectedOptions).toEqual([items[3]]);
      expect(items[3]!.getAttribute("aria-selected")).toBe("true");
    });

    it("doesn't fire appret-listbox-change", () => {
      const { host, items, controller } = setup({ selectedIndex: 2 });
      const details = changes(host);
      controller.update({ options: items.slice(0, 2) });
      expect(details).toEqual([]);
    });

    it("keeps the selection when switching to multiple selection", () => {
      const { items, controller } = setup({ selectedIndex: 2 });
      controller.update({ multiple: true });
      expect(controller.selectedOptions).toEqual([items[2]]);
      expect(items[0]!.getAttribute("aria-selected")).toBe("false");
      items[0]!.click();
      expect(controller.selectedOptions).toEqual([items[0], items[2]]);
    });

    it("keeps the first selected option when switching to single selection", () => {
      const { list, items, controller } = setup({ selectedIndexes: [1, 3] });
      controller.update({ multiple: false });
      expect(controller.selectedOptions).toEqual([items[1]]);
      expect(list.getAttribute("aria-multiselectable")).toBe("false");
      expect(items[3]!.getAttribute("aria-selected")).toBe("false");
      expect(items[0]!.getAttribute("aria-selected")).toBe("false");
    });

    it("stops selection from following focus after switching to multiple selection", () => {
      const { items, controller } = setup({
        config: { selectionFollowsFocus: true },
      });
      controller.update({ multiple: true });
      items[0]!.focus();
      press("ArrowDown");
      expect(selected(items)).toEqual([]);
    });
  });

  describe("tab stop", () => {
    it("stays on the active option when it's still there", () => {
      const { list, items, controller } = setup();
      items[0]!.focus();
      press("ArrowDown");
      press("ArrowDown");
      controller.update({ options: [...items, addItem(list, "Date")] });
      expect(tabStops(items)).toEqual([2]);
    });

    it("goes to the selected option when the active one is removed", () => {
      const { items, controller } = setup({ selectedIndex: 1 });
      items[1]!.focus();
      press("ArrowDown");
      press("ArrowDown");
      controller.update({ options: items.filter((_, i) => i !== 3) });
      expect(tabStops(items)).toEqual([1]);
    });

    it("goes to the first enabled option when nothing is selected", () => {
      const { items, controller } = setup({ disabled: [1] });
      controller.update({ options: items.slice(1, 3) });
      expect(tabStops(items)).toEqual([2]);
    });
  });

  describe("added and removed options", () => {
    it("handle roles, keyboard and clicks for added options", () => {
      const { list, items, controller } = setup();
      const added = addItem(list, "Date");
      controller.update({ options: [...items, added] });
      expect(added.getAttribute("role")).toBe("option");
      items[0]!.focus();
      press("End");
      expect(document.activeElement).toBe(added);
      added.click();
      expect(controller.selectedOption).toBe(added);
    });

    it("give removed options their original markup back", () => {
      const { items, controller } = setup({ selectedIndex: 4 });
      controller.update({ options: items.slice(0, 3) });
      for (const item of items.slice(3)) {
        expect(item.hasAttribute("role")).toBe(false);
        expect(item.hasAttribute("tabindex")).toBe(false);
        expect(item.hasAttribute("aria-selected")).toBe(false);
      }
    });

    it("stop handling clicks and keys on removed options", () => {
      const { items, controller } = setup();
      controller.update({ options: items.slice(0, 3) });
      items[4]!.click();
      expect(controller.selectedOption).toBeNull();
      items[4]!.focus();
      const event = press("ArrowUp");
      expect(event.defaultPrevented).toBe(false);
    });

    it("doesn't duplicate listeners on options that stay", () => {
      const { host, items, controller } = setup({ selectedIndexes: [] });
      controller.update({});
      controller.update({});
      const details = changes(host);
      items[1]!.click();
      expect(details).toHaveLength(1);
      expect(controller.selectedOptions).toEqual([items[1]]);
    });

    it("ignores changes to the arrays until update() is called", () => {
      const { list, items, controller } = setup();
      const added = addItem(list, "Date");
      items.push(added);
      expect(added.hasAttribute("role")).toBe(false);
      controller.update({});
      expect(added.hasAttribute("role")).toBe(false);
      controller.update({ options: items });
      expect(added.getAttribute("role")).toBe("option");
    });
  });

  describe("config", () => {
    it("can switch from options to groups", () => {
      const { list, controller, items } = setup();
      const group = document.createElement("ul");
      group.append(...items.slice(0, 2));
      list.prepend(group);
      controller.update({
        options: [{ group, options: items.slice(0, 2), label: "Favourites" }],
      });
      expect(group.getAttribute("role")).toBe("group");
      expect(items[2]!.hasAttribute("role")).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    });

    it("can switch from groups to options", () => {
      const { groups, items, controller } = setupGroups();
      controller.update({ options: items });
      expect(groups[0]!.group.hasAttribute("role")).toBe(false);
      expect(items[0]!.getAttribute("role")).toBe("option");
    });

    it("can switch to a horizontal listbox", () => {
      const { list, items, controller } = setup();
      controller.update({ orientation: "horizontal" });
      expect(list.getAttribute("aria-orientation")).toBe("horizontal");
      items[0]!.focus();
      press("ArrowRight");
      expect(focused(items)).toBe(1);
    });

    it("keeps settings that aren't passed", () => {
      const { list, controller } = setup({ config: { orientation: "horizontal" } });
      controller.update({ label: "Fruits" });
      expect(list.getAttribute("aria-orientation")).toBe("horizontal");
      expect(list.getAttribute("aria-label")).toBe("Fruits");
    });

    it("replaces a text label with label IDs", () => {
      const heading = document.createElement("h2");
      heading.id = "fruit-heading";
      document.body.append(heading);
      const { list, controller } = setup();
      controller.update({ label: { byId: "fruit-heading" } });
      expect(list.hasAttribute("aria-label")).toBe(false);
      expect(list.getAttribute("aria-labelledby")).toBe("fruit-heading");
    });
  });

  describe("invalid updates", () => {
    it("throw and leave the listbox working", () => {
      const { items, controller } = setup({ selectedIndex: 1 });
      expect(() => controller.update({ options: [] })).toThrow(
        "no options found",
      );
      expect(selected(items)).toEqual([1]);
      items[0]!.focus();
      press("ArrowDown");
      expect(focused(items)).toBe(1);
    });
  });

  it("warns and does nothing after destroy()", () => {
    const { list, controller } = setup();
    controller.destroy();
    controller.update({ label: "Fruits" });
    expect(list.hasAttribute("aria-label")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("after destroy()"),
    );
  });
});

describe("focus()", () => {
  it("moves focus to the active option", () => {
    const { items, controller } = setup({ selectedIndex: 3 });
    controller.focus();
    expect(focused(items)).toBe(3);
  });

  it("brings focus back after the focused option was removed", () => {
    const { items, controller } = setup();
    items[0]!.focus();
    press("End");
    items[4]!.remove();
    controller.update({ options: items.slice(0, 4) });
    controller.focus();
    expect(focused(items)).toBe(0);
  });
});

describe("destroy()", () => {
  it("restores the original markup", () => {
    const host = document.createElement("div");
    host.innerHTML = `<ul class="list"><li>Apple</li><li tabindex="3">Banana</li><li>Cherry</li></ul>`;
    document.body.append(host);
    const html = host.innerHTML;
    const list = host.querySelector<HTMLElement>(".list")!;
    const items = [...host.querySelectorAll<HTMLElement>("li")];
    const controller = new ListboxController(host, {
      list,
      options: items,
      label: "Fruit",
      orientation: "horizontal",
      initialSelection: items[1],
    });
    items[2]!.click();
    controller.destroy();
    expect(host.innerHTML).toBe(html);
  });

  it("restores the markup of groups and their labels", () => {
    const { list, controller } = setupGroups({ config: { multiple: true } });
    controller.destroy();
    for (const el of [list, ...list.querySelectorAll("*")]) {
      expect(el.hasAttribute("role")).toBe(false);
      expect(el.hasAttribute("tabindex")).toBe(false);
      expect(el.hasAttribute("aria-selected")).toBe(false);
    }
  });

  it("can be called twice", () => {
    const { controller } = setup();
    controller.destroy();
    expect(() => controller.destroy()).not.toThrow();
  });

  it("stops handling clicks and keys", () => {
    const { host, items, controller } = setup();
    const details = changes(host);
    controller.destroy();
    items[1]!.click();
    items[0]!.focus();
    const event = press("ArrowDown");
    expect(selected(items)).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
    expect(details).toEqual([]);
  });
});

function installAriaElementReflection() {
  const properties = {
    ariaLabelledByElements: "aria-labelledby",
  } as const;
  const stored = new WeakMap<Element, Map<string, Element[]>>();

  const isReachable = (from: Element, target: Element) => {
    for (
      let root: Node | null = from.getRootNode();
      root;
      root = root instanceof ShadowRoot ? root.host.getRootNode() : null
    ) {
      if (target.getRootNode() === root) return true;
    }
    return false;
  };

  for (const [property, attribute] of Object.entries(properties)) {
    Object.defineProperty(Element.prototype, property, {
      configurable: true,
      get(this: Element) {
        const elements = stored.get(this)?.get(property);
        return elements ? elements.filter((el) => isReachable(this, el)) : null;
      },
      set(this: Element, value: Element[] | null) {
        let map = stored.get(this);
        if (!map) stored.set(this, (map = new Map()));
        if (value === null) {
          map.delete(property);
          this.removeAttribute(attribute);
        } else {
          map.set(property, [...value]);
          this.setAttribute(attribute, "");
        }
      },
    });
  }

  return () => {
    for (const property of Object.keys(properties)) {
      delete (Element.prototype as unknown as Record<string, unknown>)[
        property
      ];
    }
  };
}
