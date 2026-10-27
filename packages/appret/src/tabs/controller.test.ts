import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { TabsController, type TabsControllerConfig } from "./controller.js";

type Setup = {
  count?: number;
  tabTag?: "button" | "div";
  disabled?: number[];
  nativeDisabled?: number[];
  dir?: "ltr" | "rtl";
  config?: Partial<TabsControllerConfig>;
};

let controllers: TabsController[] = [];

function setup({
  count = 3,
  tabTag = "button",
  disabled = [],
  nativeDisabled = [],
  dir,
  config = {},
}: Setup = {}) {
  const host = document.createElement("div");
  const list = document.createElement("div");
  const tabs: HTMLElement[] = [];
  const panels: HTMLElement[] = [];

  for (let i = 0; i < count; i++) {
    const tab = document.createElement(tabTag);
    tab.textContent = `Tab ${i + 1}`;
    if (disabled.includes(i)) tab.setAttribute("aria-disabled", "true");
    if (nativeDisabled.includes(i)) tab.setAttribute("disabled", "");
    list.append(tab);
    tabs.push(tab);

    const panel = document.createElement("section");
    panel.textContent = `Panel ${i + 1}`;
    panels.push(panel);
  }

  if (dir) host.dir = dir;
  host.append(list, ...panels);
  document.body.append(host);

  const controller = new TabsController(host, {
    list,
    tabs,
    panels,
    label: "Sections",
    ...config,
  } as TabsControllerConfig);
  controllers.push(controller);

  return { host, list, tabs, panels, controller };
}

function press(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement!.dispatchEvent(event);
  return event;
}

function expectSelected(
  tabs: HTMLElement[],
  panels: HTMLElement[],
  index: number,
) {
  tabs.forEach((tab, i) => {
    expect(tab.getAttribute("aria-selected")).toBe(String(i === index));
  });
  panels.forEach((panel, i) => {
    expect(panel.hidden).toBe(i !== index);
  });
}

afterEach(() => {
  for (const controller of controllers) {
    controller.destroy();
  }
  controllers = [];
  document.body.innerHTML = "";
});

describe("roles, states and properties", () => {
  it("gives the container the tablist role", () => {
    const { list } = setup();
    expect(list.getAttribute("role")).toBe("tablist");
  });

  it("gives each tab the tab role, inside the tablist", () => {
    const { list, tabs } = setup();
    for (const tab of tabs) {
      expect(tab.getAttribute("role")).toBe("tab");
      expect(list.contains(tab)).toBe(true);
    }
  });

  it("gives each panel the tabpanel role", () => {
    const { panels } = setup();
    for (const panel of panels) {
      expect(panel.getAttribute("role")).toBe("tabpanel");
    }
  });

  it("labels the tablist with aria-label when there is no visible label", () => {
    const { list } = setup({ config: { label: "Account settings" } });
    expect(list.getAttribute("aria-label")).toBe("Account settings");
  });

  it("labels the tablist with aria-labelledby when there is a visible label", () => {
    const heading = document.createElement("h2");
    heading.id = "settings-heading";
    heading.textContent = "Settings";
    document.body.append(heading);

    const { list } = setup({
      config: { label: { byId: "settings-heading" } },
    });
    expect(list.getAttribute("aria-labelledby")).toBe("settings-heading");
    expect(list.hasAttribute("aria-label")).toBe(false);
  });

  it("points each tab's aria-controls at its panel", () => {
    const { tabs, panels } = setup();
    tabs.forEach((tab, i) => {
      const id = tab.getAttribute("aria-controls");
      expect(id).toBeTruthy();
      expect(document.getElementById(id!)).toBe(panels[i]);
    });
  });

  it("keeps ids the author already set", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="list"><button id="t1">One</button><button id="t2">Two</button></div>
      <section id="p1">One</section><section id="p2">Two</section>`;
    document.body.append(host);
    const tabs = [...host.querySelectorAll<HTMLElement>("button")];
    const panels = [...host.querySelectorAll<HTMLElement>("section")];
    controllers.push(
      new TabsController(host, {
        list: host.querySelector(".list")!,
        tabs,
        panels,
        label: "Sections",
      }),
    );

    expect(tabs.map((t) => t.getAttribute("aria-controls"))).toEqual([
      "p1",
      "p2",
    ]);
    expect(panels.map((p) => p.getAttribute("aria-labelledby"))).toEqual([
      "t1",
      "t2",
    ]);
  });

  it("points each panel's aria-labelledby at its tab", () => {
    const { tabs, panels } = setup();
    panels.forEach((panel, i) => {
      const id = panel.getAttribute("aria-labelledby");
      expect(id).toBeTruthy();
      expect(document.getElementById(id!)).toBe(tabs[i]);
    });
  });

  it("sets aria-selected true on the active tab and false on the others", () => {
    const { tabs, panels } = setup();
    expectSelected(tabs, panels, 0);
  });

  it("moves aria-selected when another tab is clicked", () => {
    const { tabs, panels } = setup();
    tabs[1]!.click();
    expectSelected(tabs, panels, 1);
  });

  it("sets aria-orientation to vertical for a vertical tablist", () => {
    const { list } = setup({ config: { orientation: "vertical" } });
    expect(list.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("leaves aria-orientation unset by default (horizontal)", () => {
    const { list } = setup();
    expect(list.hasAttribute("aria-orientation")).toBe(false);
  });

  it("keeps an author-set aria-haspopup on a tab", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="list"><button aria-haspopup="menu">One</button><button>Two</button></div>
      <section>One</section><section>Two</section>`;
    document.body.append(host);
    const tabs = [...host.querySelectorAll<HTMLElement>("button")];
    controllers.push(
      new TabsController(host, {
        list: host.querySelector(".list")!,
        tabs,
        panels: [...host.querySelectorAll<HTMLElement>("section")],
        label: "Sections",
      }),
    );
    expect(tabs[0]!.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("makes only the active tab reachable with Tab (roving tabindex)", () => {
    const { tabs } = setup();
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual([
      "0",
      "-1",
      "-1",
    ]);
  });

  it("makes panels focusable so Tab moves from the tablist into the panel", () => {
    const { panels } = setup();
    for (const panel of panels) {
      expect(panel.getAttribute("tabindex")).toBe("0");
    }
  });
});

describe("keyboard: selection follows focus", () => {
  it("Right Arrow moves focus to the next tab and selects it", () => {
    const { tabs, panels } = setup();
    tabs[0]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[1]);
    expectSelected(tabs, panels, 1);
  });

  it("Right Arrow on the last tab wraps to the first", () => {
    const { tabs, panels } = setup();
    tabs[2]!.click();
    tabs[2]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[0]);
    expectSelected(tabs, panels, 0);
  });

  it("Left Arrow moves focus to the previous tab and selects it", () => {
    const { tabs, panels } = setup();
    tabs[1]!.click();
    tabs[1]!.focus();
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs[0]);
    expectSelected(tabs, panels, 0);
  });

  it("Left Arrow on the first tab wraps to the last", () => {
    const { tabs, panels } = setup();
    tabs[0]!.focus();
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs[2]);
    expectSelected(tabs, panels, 2);
  });

  it("Home moves focus to the first tab", () => {
    const { tabs, panels } = setup();
    tabs[2]!.click();
    tabs[2]!.focus();
    press("Home");
    expect(document.activeElement).toBe(tabs[0]);
    expectSelected(tabs, panels, 0);
  });

  it("End moves focus to the last tab", () => {
    const { tabs, panels } = setup();
    tabs[0]!.focus();
    press("End");
    expect(document.activeElement).toBe(tabs[2]);
    expectSelected(tabs, panels, 2);
  });

  it("prevents the default action of the keys it handles", () => {
    const { tabs } = setup();
    tabs[0]!.focus();
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
      expect(press(key).defaultPrevented).toBe(true);
    }
  });

  describe("vertical tablist", () => {
    it("Down Arrow performs as Right Arrow", () => {
      const { tabs, panels } = setup({ config: { orientation: "vertical" } });
      tabs[0]!.focus();
      press("ArrowDown");
      expect(document.activeElement).toBe(tabs[1]);
      expectSelected(tabs, panels, 1);
    });

    it("Up Arrow performs as Left Arrow", () => {
      const { tabs, panels } = setup({ config: { orientation: "vertical" } });
      tabs[0]!.focus();
      press("ArrowUp");
      expect(document.activeElement).toBe(tabs[2]);
      expectSelected(tabs, panels, 2);
    });
  });
});

describe("keyboard: selection doesn't follow focus", () => {
  it("arrow keys move focus without changing the selection", () => {
    const { tabs, panels } = setup({ config: { selectionFollowsFocus: false } });
    tabs[0]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[1]);
    expectSelected(tabs, panels, 0);
  });

  it("Home and End move focus without changing the selection", () => {
    const { tabs, panels } = setup({ config: { selectionFollowsFocus: false } });
    tabs[0]!.focus();
    press("End");
    expect(document.activeElement).toBe(tabs[2]);
    press("Home");
    expect(document.activeElement).toBe(tabs[0]);
    expectSelected(tabs, panels, 0);
  });

  it("keeps tabindex=0 on the selected tab while focus moves", () => {
    const { tabs } = setup({ config: { selectionFollowsFocus: false } });
    tabs[0]!.focus();
    press("ArrowRight");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual([
      "0",
      "-1",
      "-1",
    ]);
  });

  it.each(["Enter", " "])("%j activates the focused tab", (key) => {
    const { tabs, panels } = setup({
      tabTag: "div",
      config: { selectionFollowsFocus: false },
    });
    tabs[0]!.focus();
    press("ArrowRight");
    const event = press(key);
    expect(event.defaultPrevented).toBe(true);
    expectSelected(tabs, panels, 1);
  });

  it("button tabs activate through their native click", () => {
    // In a browser, Enter/Space on a <button> fire click; jsdom doesn't, so click directly.
    const { tabs, panels } = setup({ config: { selectionFollowsFocus: false } });
    tabs[0]!.focus();
    press("ArrowRight");
    tabs[1]!.click();
    expectSelected(tabs, panels, 1);
  });
});

// ---------------------------------------------------------------------------
// Behaviours beyond the APG pattern
// ---------------------------------------------------------------------------

describe("link tabs", () => {
  function setupLinkTabs() {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="list"><a href="#one">One</a><a href="#two">Two</a></div>
      <section>One</section><section>Two</section>`;
    document.body.append(host);
    const tabs = [...host.querySelectorAll<HTMLElement>("a")];
    const panels = [...host.querySelectorAll<HTMLElement>("section")];
    controllers.push(
      new TabsController(host, {
        list: host.querySelector<HTMLElement>(".list")!,
        tabs,
        panels,
        label: "Sections",
      }),
    );
    return { tabs, panels };
  }

  it("selects a link tab on a plain click", () => {
    const { tabs, panels } = setupLinkTabs();
    tabs[1]!.click();
    expectSelected(tabs, panels, 1);
  });

  it.each([["metaKey"], ["ctrlKey"], ["shiftKey"]])(
    "doesn't select a link tab on a click with %s, which opens it elsewhere",
    (modifier) => {
      const { tabs, panels } = setupLinkTabs();
      tabs[1]!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, [modifier]: true }),
      );
      expectSelected(tabs, panels, 0);
    },
  );

  it("still selects a button tab on a click with a modifier", () => {
    const { tabs, panels } = setup();
    tabs[1]!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }),
    );
    expectSelected(tabs, panels, 1);
  });
});

describe("disabled tabs", () => {
  it("Right Arrow skips an aria-disabled tab", () => {
    const { tabs, panels } = setup({ disabled: [1] });
    tabs[0]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[2]);
    expectSelected(tabs, panels, 2);
  });

  it("Left Arrow skips an aria-disabled tab", () => {
    const { tabs, panels } = setup({ disabled: [1] });
    tabs[2]!.click();
    tabs[2]!.focus();
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs[0]);
    expectSelected(tabs, panels, 0);
  });

  it("skips disabled tabs when wrapping around", () => {
    const { tabs, panels } = setup({ count: 4, disabled: [0] });
    tabs[3]!.click();
    tabs[3]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[1]);
    expectSelected(tabs, panels, 1);
  });

  it("skips natively disabled <button> tabs", () => {
    const { tabs, panels } = setup({ nativeDisabled: [1] });
    tabs[0]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[2]);
    expectSelected(tabs, panels, 2);
  });

  it("Home goes to the first enabled tab", () => {
    const { tabs, panels } = setup({ count: 4, disabled: [0] });
    tabs[3]!.click();
    tabs[3]!.focus();
    press("Home");
    expect(document.activeElement).toBe(tabs[1]);
    expectSelected(tabs, panels, 1);
  });

  it("End goes to the last enabled tab", () => {
    const { tabs, panels } = setup({ count: 4, disabled: [3] });
    tabs[0]!.focus();
    press("End");
    expect(document.activeElement).toBe(tabs[2]);
    expectSelected(tabs, panels, 2);
  });

  it("ignores clicks on an aria-disabled tab", () => {
    const { tabs, panels } = setup({ disabled: [1] });
    tabs[1]!.click();
    expectSelected(tabs, panels, 0);
  });

  it("ignores Enter on a disabled tab when selection doesn't follow focus", () => {
    const { tabs, panels } = setup({
      tabTag: "div",
      config: { selectionFollowsFocus: false },
    });
    tabs[1]!.setAttribute("aria-disabled", "true");
    tabs[1]!.focus();
    press("Enter");
    expectSelected(tabs, panels, 0);
  });

  it("starts on the first enabled tab when the first tab is disabled", () => {
    const { tabs, panels } = setup({ disabled: [0] });
    expectSelected(tabs, panels, 1);
  });

  it("does nothing on arrow keys when every tab is disabled", () => {
    const { tabs, panels } = setup({ disabled: [0, 1, 2] });
    tabs[0]!.focus();
    const event = press("ArrowRight");
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(tabs[0]);
    expectSelected(tabs, panels, 0);
  });

  it("picks up aria-disabled changes made after setup", () => {
    const { tabs, panels } = setup();
    tabs[1]!.setAttribute("aria-disabled", "true");
    tabs[0]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[2]);

    tabs[1]!.removeAttribute("aria-disabled");
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs[1]);
    expectSelected(tabs, panels, 1);
  });
});

describe("right-to-left", () => {
  it("Left Arrow moves to the next tab", () => {
    const { tabs, panels } = setup({ dir: "rtl" });
    tabs[0]!.focus();
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs[1]);
    expectSelected(tabs, panels, 1);
  });

  it("Right Arrow moves to the previous tab", () => {
    const { tabs, panels } = setup({ dir: "rtl" });
    tabs[1]!.click();
    tabs[1]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[0]);
    expectSelected(tabs, panels, 0);
  });

  it("does not swap Up and Down in a vertical tablist", () => {
    const { tabs } = setup({
      dir: "rtl",
      config: { orientation: "vertical" },
    });
    tabs[0]!.focus();
    press("ArrowDown");
    expect(document.activeElement).toBe(tabs[1]);
    press("ArrowUp");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("swaps Left and Right in a vertical tablist too", () => {
    const { tabs } = setup({
      dir: "rtl",
      config: { orientation: "vertical" },
    });
    tabs[0]!.focus();
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs[1]);
  });

  it("does not change Home and End", () => {
    const { tabs } = setup({ dir: "rtl" });
    tabs[1]!.focus();
    press("Home");
    expect(document.activeElement).toBe(tabs[0]);
    press("End");
    expect(document.activeElement).toBe(tabs[2]);
  });

  it("follows a direction change made after setup", () => {
    const { host, tabs } = setup();
    host.dir = "rtl";
    tabs[0]!.focus();
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs[1]);
  });
});

describe("initialSelection", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockClear();
  });
  afterAll(() => {
    warn.mockRestore();
  });

  it("selects a tab passed as an element", () => {
    const { host, list, tabs, panels, controller } = setup();
    controller.destroy();
    controllers.push(
      new TabsController(host, {
        list,
        tabs,
        panels,
        label: "Sections",
        initialSelection: tabs[2],
      }),
    );
    expectSelected(tabs, panels, 2);
  });

  it("selects a tab passed as an index", () => {
    const { tabs, panels } = setup({ config: { initialSelection: 2 } });
    expectSelected(tabs, panels, 2);
    expect(warn).not.toHaveBeenCalled();
  });

  it("treats index 0 as a valid selection", () => {
    const { tabs, panels } = setup({
      disabled: [1],
      config: { initialSelection: 0 },
    });
    expectSelected(tabs, panels, 0);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([3, -1, 1.5])(
    "warns and falls back to the first enabled tab for index %s",
    (index) => {
      const { tabs, panels } = setup({
        disabled: [0],
        config: { initialSelection: index },
      });
      expectSelected(tabs, panels, 1);
      expect(warn).toHaveBeenCalledWith(
        "Appret tabs: the initial selected tab is not among tabs.",
      );
    },
  );

  it("falls back to the first enabled tab when the index points to a disabled tab", () => {
    const { tabs, panels } = setup({
      disabled: [2],
      config: { initialSelection: 2 },
    });
    expectSelected(tabs, panels, 0);
  });

  it("doesn't fire appret-tabs-change for the initial selection", () => {
    const listener = vi.fn();
    document.addEventListener("appret-tabs-change", listener);
    setup({ config: { initialSelection: 1 } });
    document.removeEventListener("appret-tabs-change", listener);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("loop: false", () => {
  it("Right Arrow on the last tab stays on it", () => {
    const { tabs, panels } = setup({ config: { loop: false } });
    tabs[2]!.click();
    tabs[2]!.focus();
    const event = press("ArrowRight");
    expect(document.activeElement).toBe(tabs[2]);
    expectSelected(tabs, panels, 2);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Left Arrow on the first tab stays on it", () => {
    const { tabs, panels } = setup({ config: { loop: false } });
    tabs[0]!.focus();
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs[0]);
    expectSelected(tabs, panels, 0);
  });

  it("still moves between tabs that aren't at an edge", () => {
    const { tabs, panels } = setup({ config: { loop: false } });
    tabs[0]!.focus();
    press("ArrowRight");
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[2]);
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs[1]);
    expectSelected(tabs, panels, 1);
  });

  it("doesn't wrap when the remaining tabs before the edge are disabled", () => {
    const { tabs, panels } = setup({ disabled: [2], config: { loop: false } });
    tabs[1]!.click();
    tabs[1]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[1]);
    expectSelected(tabs, panels, 1);
  });

  it("doesn't wrap backwards past disabled tabs at the start", () => {
    const { tabs, panels } = setup({ disabled: [0], config: { loop: false } });
    tabs[1]!.focus();
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs[1]);
    expectSelected(tabs, panels, 1);
  });

  it("stops at the edges of a vertical tablist", () => {
    const { tabs } = setup({
      config: { loop: false, orientation: "vertical" },
    });
    tabs[0]!.focus();
    press("ArrowUp");
    expect(document.activeElement).toBe(tabs[0]);
    tabs[2]!.focus();
    press("ArrowDown");
    expect(document.activeElement).toBe(tabs[2]);
  });

  it("stops at the edges in right-to-left", () => {
    const { tabs } = setup({ dir: "rtl", config: { loop: false } });
    tabs[2]!.focus();
    press("ArrowLeft");
    expect(document.activeElement).toBe(tabs[2]);
    tabs[0]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("doesn't change Home and End", () => {
    const { tabs } = setup({ config: { loop: false } });
    tabs[1]!.focus();
    press("End");
    expect(document.activeElement).toBe(tabs[2]);
    press("Home");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("stops focus at the edges when selection doesn't follow focus", () => {
    const { tabs, panels } = setup({
      config: { loop: false, selectionFollowsFocus: false },
    });
    tabs[2]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[2]);
    expectSelected(tabs, panels, 0);
  });

  it("wraps by default", () => {
    const { tabs } = setup();
    tabs[2]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[0]);
  });
});

describe("select() API", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockClear();
  });
  afterAll(() => {
    warn.mockRestore();
  });

  it("selects a tab by index", () => {
    const { tabs, panels, controller } = setup();
    controller.select(2);
    expectSelected(tabs, panels, 2);
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual([
      "-1",
      "-1",
      "0",
    ]);
  });

  it("selects a tab by element", () => {
    const { tabs, panels, controller } = setup();
    controller.select(tabs[1]!);
    expectSelected(tabs, panels, 1);
  });

  it("exposes the selected tab and index", () => {
    const { tabs, controller } = setup();
    expect(controller.selectedTab).toBe(tabs[0]);
    expect(controller.selectedIndex).toBe(0);

    controller.select(2);
    expect(controller.selectedTab).toBe(tabs[2]);
    expect(controller.selectedIndex).toBe(2);
  });

  it("keeps selectedTab in sync with clicks and keys", () => {
    const { tabs, controller } = setup();
    tabs[1]!.click();
    expect(controller.selectedTab).toBe(tabs[1]);

    tabs[1]!.focus();
    press("ArrowRight");
    expect(controller.selectedIndex).toBe(2);
  });

  it("doesn't fire appret-tabs-change", () => {
    const { host, controller } = setup();
    const listener = vi.fn();
    host.addEventListener("appret-tabs-change", listener);
    controller.select(2);
    expect(listener).not.toHaveBeenCalled();
  });

  it("still fires appret-tabs-change for user actions", () => {
    const { host, tabs, panels } = setup();
    const listener = vi.fn();
    host.addEventListener("appret-tabs-change", listener);
    tabs[1]!.click();
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      tab: tabs[1],
      panel: panels[1],
      index: 1,
    });
  });

  it("doesn't move focus", () => {
    const { tabs, controller } = setup();
    tabs[0]!.focus();
    controller.select(2);
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("ignores an index out of range", () => {
    const { tabs, panels, controller } = setup();
    controller.select(5);
    controller.select(-1);
    expectSelected(tabs, panels, 0);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("ignores an element that isn't one of the tabs", () => {
    const { tabs, panels, controller } = setup();
    const other = document.createElement("button");
    controller.select(other);
    expectSelected(tabs, panels, 0);
    expect(warn).toHaveBeenCalledWith(
      "Appret tabs: selected tab is not among tabs:",
      other,
    );
  });

  it("ignores a disabled tab", () => {
    const { tabs, panels, controller } = setup({ disabled: [1] });
    controller.select(1);
    expectSelected(tabs, panels, 0);
    expect(warn).toHaveBeenCalledWith(
      "Appret tabs: can't select a disabled tab:",
      tabs[1],
    );
  });

  it("does nothing after destroy()", () => {
    const { list, tabs, controller } = setup();
    const before = list.parentElement!.innerHTML;
    controller.destroy();
    const restored = list.parentElement!.innerHTML;
    expect(restored).not.toBe(before);

    controller.select(1);
    expect(list.parentElement!.innerHTML).toBe(restored);
    expect(tabs[1]!.hasAttribute("aria-selected")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "Appret tabs: select() called after destroy().",
    );
  });
});

describe("focus()", () => {
  it("moves focus to the selected tab", () => {
    const { tabs, controller } = setup({ config: { initialSelection: 2 } });
    controller.focus();
    expect(document.activeElement).toBe(tabs[2]);
  });
});

describe("update()", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockClear();
  });
  afterAll(() => {
    warn.mockRestore();
  });

  /** Creates a tab and panel pair inside the given list and host, like an author would. */
  function addPair(
    list: HTMLElement,
    host: HTMLElement,
    name: string,
  ): [HTMLElement, HTMLElement] {
    const tab = document.createElement("button");
    tab.textContent = name;
    list.append(tab);
    const panel = document.createElement("section");
    panel.textContent = `${name} panel`;
    host.append(panel);
    return [tab, panel];
  }

  function without<T>(items: T[], index: number): T[] {
    return items.filter((_, i) => i !== index);
  }

  describe("selection", () => {
    it("keeps the selected tab when it's still there", () => {
      const { list, host, tabs, panels, controller } = setup();
      controller.select(1);
      const [newTab, newPanel] = addPair(list, host, "New");
      list.prepend(newTab);

      controller.update({
        tabs: [newTab, ...tabs],
        panels: [newPanel, ...panels],
      });
      expect(controller.selectedTab).toBe(tabs[1]);
      expect(controller.selectedIndex).toBe(2);
      expectSelected([newTab, ...tabs], [newPanel, ...panels], 2);
    });

    it("selects the tab now at the same position when the selected one is removed", () => {
      const { tabs, panels, controller } = setup({ count: 4 });
      controller.select(1);
      controller.update({ tabs: without(tabs, 1), panels: without(panels, 1) });
      expect(controller.selectedTab).toBe(tabs[2]);
    });

    it("selects the tab now at the same position when the arrays are mutated in place", () => {
      const { tabs, panels, controller } = setup({ count: 4 });
      controller.select(1);

      // The same arrays that were passed to the controller.
      tabs.splice(1, 1)[0]!.remove();
      panels.splice(1, 1)[0]!.remove();
      controller.update({ tabs, panels });

      expect(controller.selectedTab.textContent).toBe("Tab 3");
      expectSelected(tabs, panels, 1);
    });

    it("manages a tab pushed into the same array once update() is called", () => {
      const { list, host, tabs, panels, controller } = setup();
      const [tab, panel] = addPair(list, host, "New");
      tabs.push(tab);
      panels.push(panel);
      controller.update({ tabs, panels });

      expect(tab.getAttribute("role")).toBe("tab");
      expect(controller.selectedIndex).toBe(0);
    });

    it("ignores changes to the arrays until update() is called", () => {
      const { list, host, tabs, panels } = setup();
      const [tab, panel] = addPair(list, host, "New");
      tabs.push(tab);
      panels.push(panel);

      tabs[0]!.focus();
      press("End");
      expect(document.activeElement).toBe(tabs[2]);
      expect(tab.hasAttribute("role")).toBe(false);
    });

    it("selects the new last tab when the selected last tab is removed", () => {
      const { tabs, panels, controller } = setup();
      controller.select(2);
      controller.update({ tabs: tabs.slice(0, 2), panels: panels.slice(0, 2) });
      expect(controller.selectedTab).toBe(tabs[1]);
      expectSelected(tabs.slice(0, 2), panels.slice(0, 2), 1);
    });

    it("skips forward past disabled tabs", () => {
      const { tabs, panels, controller } = setup({ count: 4, disabled: [2] });
      controller.select(1);
      controller.update({ tabs: without(tabs, 1), panels: without(panels, 1) });
      expect(controller.selectedTab).toBe(tabs[3]);
    });

    it("goes back to the nearest enabled tab when none follow, even with loop: false", () => {
      const { tabs, panels, controller } = setup({
        count: 4,
        disabled: [2],
        config: { loop: false },
      });
      controller.select(3);
      controller.update({ tabs: tabs.slice(0, 3), panels: panels.slice(0, 3) });
      expect(controller.selectedTab).toBe(tabs[1]);
    });

    it("moves the selection when the selected tab became disabled", () => {
      const { tabs, panels, controller } = setup();
      controller.select(1);
      tabs[1]!.setAttribute("aria-disabled", "true");
      controller.update({ tabs, panels });
      expect(controller.selectedTab).toBe(tabs[2]);
    });

    it("doesn't fire appret-tabs-change, even when the selection moves", () => {
      const { host, tabs, panels, controller } = setup();
      const listener = vi.fn();
      host.addEventListener("appret-tabs-change", listener);
      controller.select(2);
      controller.update({ tabs: tabs.slice(0, 2), panels: panels.slice(0, 2) });
      expect(controller.selectedTab).toBe(tabs[1]);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("added tabs", () => {
    it("get roles, links and roving tabindex", () => {
      const { list, host, tabs, panels, controller } = setup();
      const [newTab, newPanel] = addPair(list, host, "New");
      controller.update({
        tabs: [...tabs, newTab],
        panels: [...panels, newPanel],
      });

      expect(newTab.getAttribute("role")).toBe("tab");
      expect(newPanel.getAttribute("role")).toBe("tabpanel");
      expect(newTab.getAttribute("aria-controls")).toBe(newPanel.id);
      expect(newPanel.getAttribute("aria-labelledby")).toBe(newTab.id);
      expect(newTab.getAttribute("aria-selected")).toBe("false");
      expect(newTab.getAttribute("tabindex")).toBe("-1");
      expect(newPanel.hidden).toBe(true);
    });

    it("are reachable with the keyboard and selectable by click", () => {
      const { list, host, tabs, panels, controller } = setup();
      const [newTab, newPanel] = addPair(list, host, "New");
      const allTabs = [...tabs, newTab];
      const allPanels = [...panels, newPanel];
      controller.update({ tabs: allTabs, panels: allPanels });

      tabs[0]!.focus();
      press("End");
      expect(document.activeElement).toBe(newTab);
      expectSelected(allTabs, allPanels, 3);

      press("ArrowRight");
      expect(document.activeElement).toBe(tabs[0]);

      newTab.click();
      expectSelected(allTabs, allPanels, 3);
    });
  });

  describe("removed tabs", () => {
    it("get their original markup back", () => {
      const host = document.createElement("div");
      host.innerHTML = `
        <div class="list"><button>One</button><button id="author-id">Two</button></div>
        <section>One</section><section tabindex="-1">Two</section>`;
      document.body.append(host);
      const tabs = [...host.querySelectorAll<HTMLElement>("button")];
      const panels = [...host.querySelectorAll<HTMLElement>("section")];
      const before = tabs[1]!.outerHTML + panels[1]!.outerHTML;
      const controller = new TabsController(host, {
        list: host.querySelector<HTMLElement>(".list")!,
        tabs,
        panels,
        label: "Sections",
      });
      controllers.push(controller);

      controller.update({ tabs: [tabs[0]!], panels: [panels[0]!] });
      expect(tabs[1]!.outerHTML + panels[1]!.outerHTML).toBe(before);
    });

    it("no longer react to clicks or keys", () => {
      const { host, tabs, panels, controller } = setup();
      const listener = vi.fn();
      host.addEventListener("appret-tabs-change", listener);
      controller.update({ tabs: tabs.slice(0, 2), panels: panels.slice(0, 2) });

      tabs[2]!.click();
      tabs[2]!.focus();
      const event = press("ArrowLeft");

      expect(controller.selectedTab).toBe(tabs[0]);
      expect(event.defaultPrevented).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  it("doesn't duplicate listeners on tabs that stay", () => {
    const { host, tabs, panels, controller } = setup({ count: 4 });
    controller.update({ tabs, panels });
    controller.update({ tabs, panels });

    const listener = vi.fn();
    host.addEventListener("appret-tabs-change", listener);
    tabs[0]!.focus();
    press("ArrowRight"); // duplicated handlers would move two or three steps
    expect(document.activeElement).toBe(tabs[1]);
    expect(listener).toHaveBeenCalledOnce();
  });

  describe("config", () => {
    it("can switch to a vertical tablist", () => {
      const { list, tabs, panels, controller } = setup();
      controller.update({ orientation: "vertical" });
      expect(list.getAttribute("aria-orientation")).toBe("vertical");

      tabs[0]!.focus();
      press("ArrowDown");
      expectSelected(tabs, panels, 1);
    });

    it("can stop selection from following focus", () => {
      const { tabs, panels, controller } = setup();
      controller.update({ selectionFollowsFocus: false });
      tabs[0]!.focus();
      press("ArrowRight");
      expect(document.activeElement).toBe(tabs[1]);
      expectSelected(tabs, panels, 0);
    });

    it("keeps settings that aren't passed", () => {
      const { list, tabs, panels, controller } = setup({
        config: { orientation: "vertical", label: "Sections" },
      });
      controller.update({ tabs, panels });
      expect(list.getAttribute("aria-orientation")).toBe("vertical");
      expect(list.getAttribute("aria-label")).toBe("Sections");
    });

    it("resets a setting passed as undefined", () => {
      const { list, controller } = setup({
        config: { orientation: "vertical" },
      });
      controller.update({ orientation: undefined });
      expect(list.hasAttribute("aria-orientation")).toBe(false);
    });

    it("replaces a text label with label IDs", () => {
      const heading = document.createElement("h2");
      heading.id = "settings-heading";
      document.body.append(heading);
      const { list, controller } = setup({ config: { label: "Sections" } });

      controller.update({ label: { byId: "settings-heading" } });
      expect(list.hasAttribute("aria-label")).toBe(false);
      expect(list.getAttribute("aria-labelledby")).toBe("settings-heading");
    });

    it("replaces label IDs with a text label", () => {
      const heading = document.createElement("h2");
      heading.id = "settings-heading";
      document.body.append(heading);
      const { list, controller } = setup({
        config: { label: { byId: "settings-heading" } },
      });

      controller.update({ label: "Sections" });
      expect(list.hasAttribute("aria-labelledby")).toBe(false);
      expect(list.getAttribute("aria-label")).toBe("Sections");
    });
  });

  describe("invalid updates", () => {
    it("throws and leaves the tabs working", () => {
      const { tabs, panels, controller } = setup();
      controller.select(1);

      expect(() => controller.update({ tabs: tabs.slice(0, 2) })).toThrow(
        "Appret tabs: tabs and panels must be the same length.",
      );
      expect(() => controller.update({ tabs: [], panels: [] })).toThrow(
        "Appret tabs: no tabs found.",
      );

      expect(tabs[2]!.getAttribute("role")).toBe("tab");
      expectSelected(tabs, panels, 1);
      tabs[1]!.focus();
      press("ArrowRight");
      expectSelected(tabs, panels, 2);
    });
  });

  it("does nothing after destroy()", () => {
    const { list, host, tabs, panels, controller } = setup();
    controller.destroy();
    const restored = host.innerHTML;

    controller.update({ tabs, panels, orientation: "vertical" });
    expect(host.innerHTML).toBe(restored);
    expect(list.hasAttribute("role")).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "Appret tabs: update() called after destroy().",
    );
  });
});

describe("errors and warnings", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockClear();
  });
  afterAll(() => {
    warn.mockRestore();
  });

  function make(config: Partial<TabsControllerConfig>, markup?: string) {
    const host = document.createElement("div");
    host.innerHTML =
      markup ??
      `<div class="list"><button>One</button><button>Two</button></div>
       <section>One</section><section>Two</section>`;
    document.body.append(host);
    const controller = new TabsController(host, {
      list: host.querySelector<HTMLElement>(".list")!,
      tabs: [...host.querySelectorAll<HTMLElement>(".list > button")],
      panels: [...host.querySelectorAll<HTMLElement>("section")],
      ...config,
    } as TabsControllerConfig);
    controllers.push(controller);
    return { host, controller };
  }

  it("throws when there are no tabs", () => {
    expect(() => make({}, `<div class="list"></div>`)).toThrow(
      "Appret tabs: no tabs found.",
    );
  });

  it("throws when tabs and panels have different lengths", () => {
    expect(() =>
      make(
        { label: "Sections" },
        `<div class="list"><button>One</button><button>Two</button></div><section>One</section>`,
      ),
    ).toThrow("Appret tabs: tabs and panels must be the same length.");
  });

  it("changes nothing in the markup when it throws", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div class="list"><button>One</button></div>`;
    const before = host.innerHTML;
    expect(
      () =>
        new TabsController(host, {
          list: host.querySelector<HTMLElement>(".list")!,
          tabs: [host.querySelector("button")!],
          panels: [],
          label: "Sections",
        }),
    ).toThrow();
    expect(host.innerHTML).toBe(before);
  });

  it("warns about tabs that aren't inside the list", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="list"><button>One</button></div><button class="stray">Two</button>
      <section>One</section><section>Two</section>`;
    document.body.append(host);
    const list = host.querySelector<HTMLElement>(".list")!;
    const stray = host.querySelector<HTMLElement>(".stray")!;
    controllers.push(
      new TabsController(host, {
        list,
        tabs: [list.querySelector("button")!, stray],
        panels: [...host.querySelectorAll<HTMLElement>("section")],
        label: "Sections",
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      "Appret tabs: these tabs aren't inside `list`:",
      [stray],
    );
  });

  it("warns when initialSelection isn't one of the tabs", () => {
    make({
      label: "Sections",
      initialSelection: document.createElement("button"),
    });
    expect(warn).toHaveBeenCalledWith(
      "Appret tabs: the initial selected tab is not among tabs.",
    );
  });

  it("warns when the tablist has no accessible label", () => {
    const { host } = make({});
    expect(warn).toHaveBeenCalledWith(
      "Appret tabs: the tablist is missing an accessible label.",
      host.querySelector(".list"),
    );
  });

  it("doesn't warn when the markup already labels the tablist", () => {
    make(
      {},
      `<div class="list" aria-label="Sections"><button>One</button><button>Two</button></div>
       <section>One</section><section>Two</section>`,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns about label IDs that don't exist in the tablist's root", () => {
    const heading = document.createElement("h2");
    heading.id = "real-heading";
    document.body.append(heading);
    make({ label: { byId: " real-heading missing-heading " } });
    expect(warn).toHaveBeenCalledWith(
      "Appret tabs: ID missing in the tablist's document or shadow root:",
      ["missing-heading"],
    );
  });

  it("doesn't warn for a working setup", () => {
    make({ label: "Sections" });
    expect(warn).not.toHaveBeenCalled();
  });
});

// jsdom doesn't implement ARIA element reflection (ariaLabelledByElements...),
// so install a stand-in that follows the browser rule: an element can only
// reference elements in its own root or in an outer (shadow-including ancestor) root.
function installAriaElementReflection() {
  const properties = {
    ariaLabelledByElements: "aria-labelledby",
    ariaDescribedByElements: "aria-describedby",
    ariaControlsElements: "aria-controls",
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

describe("label elements", () => {
  let uninstall: () => void;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    uninstall = installAriaElementReflection();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockClear();
  });
  afterAll(() => {
    warn.mockRestore();
    uninstall();
  });

  it("labels the tablist with the given elements, in order", () => {
    const title = document.createElement("h2");
    const subtitle = document.createElement("p");
    document.body.append(title, subtitle);
    const { list } = setup({
      config: { label: { byElements: [title, subtitle] } },
    });
    expect(list.ariaLabelledByElements).toEqual([title, subtitle]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("works for a tablist in a shadow root labelled from the page", () => {
    const heading = document.createElement("h2");
    const component = document.createElement("div");
    document.body.append(heading, component);
    const root = component.attachShadow({ mode: "open" });
    root.innerHTML = `<div class="list"><button>One</button></div><section>One</section>`;
    const list = root.querySelector<HTMLElement>(".list")!;

    controllers.push(
      new TabsController(component, {
        list,
        tabs: [root.querySelector("button")!],
        panels: [root.querySelector("section")!],
        label: { byElements: [heading] },
      }),
    );
    expect(list.ariaLabelledByElements).toEqual([heading]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns about labels inside a shadow root the tablist can't see", () => {
    const other = document.createElement("div");
    document.body.append(other);
    const hidden = document.createElement("h2");
    other.attachShadow({ mode: "open" }).append(hidden);
    const visible = document.createElement("h2");
    document.body.append(visible);

    setup({
      config: { label: { byElements: [visible, hidden] } },
    });
    expect(warn).toHaveBeenCalledWith(
      "Appret tabs: these label elements can't label the tablist because they're inside another shadow root:",
      [hidden],
    );
  });
});

describe("tabs passed through slots", () => {
  let uninstall: () => void;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    uninstall = installAriaElementReflection();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockClear();
  });
  afterAll(() => {
    warn.mockRestore();
    uninstall();
  });

  // <my-tabs>
  //   <button slot="tab">  ← light DOM (page)
  //   #shadow-root
  //     <div class="list"><slot name="tab"></div>
  //     <section> panels   ← shadow root
  function slottedTabs(count = 3) {
    const component = document.createElement("div");
    const tabs: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
      const tab = document.createElement("button");
      tab.slot = "tab";
      tab.textContent = `Tab ${i + 1}`;
      tabs.push(tab);
    }
    component.append(...tabs);
    document.body.append(component);

    const root = component.attachShadow({ mode: "open" });
    root.innerHTML = `<div class="list"><slot name="tab"></slot></div>`;
    const panels = tabs.map((_, i) => {
      const panel = document.createElement("section");
      panel.textContent = `Panel ${i + 1}`;
      root.append(panel);
      return panel;
    });
    const list = root.querySelector<HTMLElement>(".list")!;

    controllers.push(
      new TabsController(component, { list, tabs, panels, label: "Sections" }),
    );
    return { component, root, list, tabs, panels };
  }

  it("treats slotted tabs as inside the list", () => {
    const { tabs } = slottedTabs();
    expect(warn).not.toHaveBeenCalled();
    for (const tab of tabs) expect(tab.getAttribute("role")).toBe("tab");
  });

  it("labels each panel with its slotted tab through element references", () => {
    const { tabs, panels } = slottedTabs();
    panels.forEach((panel, i) => {
      expect(panel.ariaLabelledByElements).toEqual([tabs[i]]);
    });
  });

  it("supports the keyboard across slotted tabs", () => {
    const { tabs, panels } = slottedTabs();
    tabs[0]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[1]);
    expectSelected(tabs, panels, 1);
  });

  it("uses plain ids when tabs and panels are both slotted", () => {
    const component = document.createElement("div");
    component.innerHTML = `
      <button slot="tab">One</button><button slot="tab">Two</button>
      <section slot="panel">One</section><section slot="panel">Two</section>`;
    document.body.append(component);
    const root = component.attachShadow({ mode: "open" });
    root.innerHTML = `<div class="list"><slot name="tab"></slot></div><slot name="panel"></slot>`;
    const tabs = [...component.querySelectorAll<HTMLElement>("button")];
    const panels = [...component.querySelectorAll<HTMLElement>("section")];

    controllers.push(
      new TabsController(component, {
        list: root.querySelector<HTMLElement>(".list")!,
        tabs,
        panels,
        label: "Sections",
      }),
    );
    tabs.forEach((tab, i) => {
      expect(tab.getAttribute("aria-controls")).toBe(panels[i]!.id);
      expect(panels[i]!.getAttribute("aria-labelledby")).toBe(tab.id);
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when a panel can't reference its tab", () => {
    // Panel in the page, tab inside a nested shadow root: the panel can't see it.
    const host = document.createElement("div");
    const list = document.createElement("div");
    const wrapper = document.createElement("div");
    list.append(wrapper);
    const tab = document.createElement("button");
    wrapper.attachShadow({ mode: "open" }).append(tab);
    const panel = document.createElement("section");
    host.append(list, panel);
    document.body.append(host);

    controllers.push(
      new TabsController(host, {
        list,
        tabs: [tab],
        panels: [panel],
        label: "Sections",
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      "Appret tabs: this panel can't be labelled by its tab, because the tab is inside a shadow root the panel can't see:",
      panel,
    );
  });
});
