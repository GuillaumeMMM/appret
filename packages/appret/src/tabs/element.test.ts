import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../define/tabs.js";
import { defineElement } from "../shared/element.js";
import { TabsElement } from "./element.js";

// Covers what the element adds on top of TabsController: finding parts,
// attributes, lifecycle, forwarding the API, and following DOM changes.
// Roles, keyboard and selection rules are covered in controller.test.ts.

const flush = () => new Promise((resolve) => setTimeout(resolve));

function markup(names = ["One", "Two", "Three"], attributes = 'label="Sections"') {
  return `
    <appret-tabs ${attributes}>
      <div data-appret-part="tabs.list">
        ${names.map((n) => `<button data-appret-part="tabs.tab">${n}</button>`).join("")}
      </div>
      ${names.map((n) => `<section data-appret-part="tabs.panel">${n} panel</section>`).join("")}
    </appret-tabs>`;
}

function mount(html = markup()) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const element = template.content.firstElementChild as TabsElement;
  document.body.append(element);
  return element;
}

function parts(element: Element) {
  const own = (name: string) =>
    [...element.querySelectorAll<HTMLElement>(`[data-appret-part~="tabs.${name}"]`)].filter(
      (el) => el.closest(element.localName) === element,
    );
  return { list: own("list")[0]!, tabs: own("tab"), panels: own("panel") };
}

function addPair(element: Element, name: string) {
  const { list } = parts(element);
  const tab = document.createElement("button");
  tab.dataset.appretPart = "tabs.tab";
  tab.textContent = name;
  list.append(tab);
  const panel = document.createElement("section");
  panel.dataset.appretPart = "tabs.panel";
  panel.textContent = `${name} panel`;
  element.append(panel);
  return [tab, panel] as const;
}

function press(key: string) {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

let warn: ReturnType<typeof vi.spyOn>;
let uncaught: string[];
const onError = (event: ErrorEvent) => {
  uncaught.push(event.message);
  event.preventDefault();
};

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  uncaught = [];
  window.addEventListener("error", onError);
});

afterEach(() => {
  window.removeEventListener("error", onError);
  warn.mockRestore();
  document.body.innerHTML = "";
});

describe("registration", () => {
  it("registers <appret-tabs> from appret/define/tabs", () => {
    expect(customElements.get("appret-tabs")).toBe(TabsElement);
  });

  it("doesn't throw when the same name is defined twice", () => {
    expect(() => defineElement("appret-tabs", class extends TabsElement {})).not.toThrow();
    expect(customElements.get("appret-tabs")).toBe(TabsElement);
  });

  it("works under a custom tag name", () => {
    defineElement("acme-tabs", class extends TabsElement {});
    const element = mount(markup().replaceAll("appret-tabs", "acme-tabs"));
    const { list, tabs } = parts(element);
    expect(list.getAttribute("role")).toBe("tablist");
    expect(tabs.map((t) => t.getAttribute("role"))).toEqual(["tab", "tab", "tab"]);
  });
});

describe("setup", () => {
  it("finds its parts and sets up the controller when connected", () => {
    const element = mount();
    const { list, tabs, panels } = parts(element);
    expect(list.getAttribute("role")).toBe("tablist");
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(panels.map((p) => p.hidden)).toEqual([false, true, true]);
  });

  it("accepts parts with several tokens in data-appret-part", () => {
    const element = mount(
      markup().replaceAll('data-appret-part="tabs.tab"', 'data-appret-part="tabs.tab other.part"'),
    );
    expect(parts(element).tabs[0]!.getAttribute("role")).toBe("tab");
  });

  it("does nothing until it's connected", () => {
    const template = document.createElement("template");
    template.innerHTML = markup().trim();
    const element = template.content.firstElementChild as TabsElement;
    expect(parts(element).list.hasAttribute("role")).toBe(false);
  });

  it("waits for DOMContentLoaded while the document is loading", () => {
    Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" });
    try {
      const element = mount();
      expect(parts(element).list.hasAttribute("role")).toBe(false);

      Object.defineProperty(document, "readyState", { configurable: true, get: () => "interactive" });
      document.dispatchEvent(new Event("DOMContentLoaded"));
      expect(parts(element).list.getAttribute("role")).toBe("tablist");
    } finally {
      delete (document as unknown as Record<string, unknown>).readyState;
    }
  });

  it("sets up once its children are added after it's connected", async () => {
    const element = document.createElement("appret-tabs");
    element.setAttribute("label", "Sections");
    document.body.append(element);
    element.innerHTML = markup().replace(/^\s*<appret-tabs[^>]*>|<\/appret-tabs>\s*$/g, "");
    await flush();

    expect(parts(element).list.getAttribute("role")).toBe("tablist");
    expect(uncaught).toEqual([]);
  });

  it("only manages its own parts when tab sets are nested", () => {
    const element = mount(
      markup(["Outer one", "Outer two"]).replace(
        "Outer one panel",
        markup(["Inner one", "Inner two"], 'label="Inner"'),
      ),
    );
    const inner = element.querySelector("appret-tabs") as TabsElement;

    expect(parts(element).tabs.map((t) => t.textContent)).toEqual(["Outer one", "Outer two"]);
    expect(parts(inner).tabs.map((t) => t.getAttribute("role"))).toEqual(["tab", "tab"]);
    expect(parts(inner).list.getAttribute("aria-label")).toBe("Inner");
  });
});

describe("attributes", () => {
  it("passes label, orientation and selection-follows-focus to the controller", () => {
    const element = mount(markup(undefined, 'label="Sections" orientation="vertical" selection-follows-focus="false"'));
    const { list, tabs } = parts(element);
    expect(list.getAttribute("aria-label")).toBe("Sections");
    expect(list.getAttribute("aria-orientation")).toBe("vertical");

    tabs[0]!.focus();
    press("ArrowDown");
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true"); // focus only
  });

  it("passes labelledby to the controller", () => {
    document.body.insertAdjacentHTML("beforeend", `<h2 id="heading">Settings</h2>`);
    const element = mount(markup(undefined, 'labelledby="heading"'));
    expect(parts(element).list.getAttribute("aria-labelledby")).toBe("heading");
  });

  it('treats loop="false" as no wrap-around and any other value as the default', () => {
    const noLoop = mount(markup(undefined, 'label="Sections" loop="false"'));
    const tabs = parts(noLoop).tabs;
    tabs[2]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(tabs[2]);

    const loop = mount(markup(undefined, 'label="Sections" loop'));
    const loopTabs = parts(loop).tabs;
    loopTabs[2]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(loopTabs[0]);
  });

  it("applies attribute changes after setup", () => {
    const element = mount();
    const { list } = parts(element);

    element.setAttribute("orientation", "vertical");
    expect(list.getAttribute("aria-orientation")).toBe("vertical");

    element.setAttribute("label", "Renamed");
    expect(list.getAttribute("aria-label")).toBe("Renamed");

    element.removeAttribute("orientation");
    expect(list.hasAttribute("aria-orientation")).toBe(false);
  });

  it("keeps the selection when an attribute changes", () => {
    const element = mount();
    element.select(2);
    element.setAttribute("orientation", "vertical");
    expect(element.selectedIndex).toBe(2);
  });

  it("ignores an invalid orientation with a warning", () => {
    const element = mount(markup(undefined, 'label="Sections" orientation="diagonal"'));
    const { list, tabs } = parts(element);
    expect(list.hasAttribute("aria-orientation")).toBe(false);
    expect(warn).toHaveBeenCalled();

    // Defaults apply: horizontal, and selection follows focus.
    tabs[0]!.focus();
    press("ArrowRight");
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
  });
});

describe("API", () => {
  it("forwards select(), selectedTab and selectedIndex", () => {
    const element = mount();
    const { tabs } = parts(element);

    element.select(1);
    expect(element.selectedTab).toBe(tabs[1]);
    expect(element.selectedIndex).toBe(1);

    element.select(tabs[2]!);
    expect(element.selectedIndex).toBe(2);
  });

  it("selects through the selectedIndex setter", () => {
    const element = mount();
    element.selectedIndex = 2;
    expect(element.selectedTab).toBe(parts(element).tabs[2]);
  });

  it("reports nothing selected before setup", () => {
    const element = document.createElement("appret-tabs");
    expect(element.selectedTab).toBeNull();
    expect(element.selectedIndex).toBe(-1);
  });

  it("applies a selection made before setup", () => {
    // createElement upgrades immediately; elements inside a <template> wouldn't be.
    const container = document.createElement("div");
    container.innerHTML = markup().trim();
    const element = container.firstElementChild as TabsElement;

    element.select(2);
    document.body.append(element);
    expect(element.selectedIndex).toBe(2);
  });

  it("focus() moves focus to the selected tab", () => {
    const element = mount();
    element.select(1);
    element.focus();
    expect(document.activeElement).toBe(parts(element).tabs[1]);
  });

  it("fires appret-tabs-change on the element itself", () => {
    const element = mount();
    const listener = vi.fn();
    element.addEventListener("appret-tabs-change", listener);
    parts(element).tabs[1]!.click();
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0]![0] as Event).target).toBe(element);
  });

  it("is typed by tag name", () => {
    mount();
    // Type-level check: querySelector returns TabsElement, so select() exists.
    document.querySelector("appret-tabs")!.select(1);
    expect(document.querySelector("appret-tabs")!.selectedIndex).toBe(1);
  });
});

describe("following DOM changes", () => {
  it("manages a tab and panel added later", async () => {
    const element = mount();
    const [tab, panel] = addPair(element, "Four");
    await flush();

    expect(tab.getAttribute("role")).toBe("tab");
    expect(panel.getAttribute("role")).toBe("tabpanel");
    expect(tab.getAttribute("aria-controls")).toBe(panel.id);
  });

  it("falls back to the neighbouring tab when the selected pair is removed", async () => {
    const element = mount();
    element.select(1);
    const { tabs, panels } = parts(element);
    tabs[1]!.remove();
    panels[1]!.remove();
    await flush();

    expect(element.selectedTab).toBe(tabs[2]);
    expect(panels[2]!.hidden).toBe(false);
  });

  it("turns an element into a part when data-appret-part is added", async () => {
    const element = mount();
    const { list } = parts(element);
    const tab = document.createElement("button");
    list.append(tab);
    const panel = document.createElement("section");
    element.append(panel);
    await flush();
    expect(tab.hasAttribute("role")).toBe(false);

    tab.dataset.appretPart = "tabs.tab";
    panel.dataset.appretPart = "tabs.panel";
    await flush();
    expect(tab.getAttribute("role")).toBe("tab");
  });

  it("doesn't rebuild for changes that don't affect the parts", async () => {
    const element = mount();
    const { tabs, panels } = parts(element);
    const generatedId = panels[0]!.id; // a rebuild would generate a new one

    panels[0]!.append(document.createElement("p"));
    panels[0]!.firstChild!.textContent = "Edited";
    await flush();

    expect(panels[0]!.id).toBe(generatedId);
    expect(tabs[0]!.getAttribute("aria-controls")).toBe(generatedId);
  });

  it("doesn't rebuild when a nested tab set changes", async () => {
    const element = mount(
      markup(["Outer one", "Outer two"]).replace(
        "Outer one panel",
        markup(["Inner one", "Inner two"], 'label="Inner"'),
      ),
    );
    const outerPanelId = parts(element).panels[0]!.id;
    addPair(element.querySelector("appret-tabs")!, "Inner three");
    await flush();

    expect(parts(element).panels[0]!.id).toBe(outerPanelId);
  });

  it("keeps working while a tab is removed before its panel", async () => {
    const element = mount();
    const { tabs, panels } = parts(element);
    tabs[2]!.remove();
    await flush();

    expect(uncaught).toEqual([]);
    expect(tabs[0]!.getAttribute("role")).toBe("tab");

    panels[2]!.remove();
    await flush();
    tabs[0]!.focus();
    press("End");
    expect(document.activeElement).toBe(tabs[1]);
  });

  it("keeps the selected position when emptied and refilled later", async () => {
    const element = mount();
    element.select(2);
    const { list } = parts(element);
    for (const el of [...parts(element).tabs, ...parts(element).panels]) el.remove();
    await flush();

    expect(element.selectedTab).toBeNull();
    expect(element.selectedIndex).toBe(-1);

    for (const name of ["A", "B", "C"]) addPair(element, name);
    await flush();

    expect(list.isConnected).toBe(true);
    expect(element.selectedIndex).toBe(2);
    expect(element.selectedTab!.textContent).toBe("C");
  });

  it("recovers when the list is removed and added back", async () => {
    const element = mount();
    const { list } = parts(element);
    list.remove();
    await flush();
    expect(uncaught).toEqual([]);

    element.prepend(list);
    await flush();
    expect(uncaught).toEqual([]);
    expect(list.getAttribute("role")).toBe("tablist");
  });
});

describe("focus recovery", () => {
  it("moves focus to the new selected tab when the focused tab is removed", async () => {
    const element = mount();
    const { tabs, panels } = parts(element);
    tabs[1]!.click();
    tabs[1]!.focus();

    tabs[1]!.remove();
    panels[1]!.remove();
    await flush();

    expect(document.activeElement).toBe(tabs[2]);
  });

  it("moves focus to the new selected tab when focus was inside a removed panel", async () => {
    const element = mount();
    const { tabs, panels } = parts(element);
    element.select(1);
    const button = document.createElement("button");
    panels[1]!.append(button);
    button.focus();

    tabs[1]!.remove();
    panels[1]!.remove();
    await flush();

    expect(document.activeElement).toBe(tabs[2]);
  });

  it("doesn't steal focus from elsewhere on the page", async () => {
    const element = mount();
    const outside = document.createElement("input");
    document.body.append(outside);
    const { tabs, panels } = parts(element);
    tabs[1]!.focus();
    outside.focus();

    tabs[1]!.remove();
    panels[1]!.remove();
    await flush();

    expect(document.activeElement).toBe(outside);
  });

  it("doesn't take focus back after the user left the tabs", async () => {
    const element = mount();
    const { tabs, panels } = parts(element);
    tabs[1]!.focus();
    tabs[1]!.blur(); // e.g. clicking an empty area: focus goes back to the page

    tabs[1]!.remove();
    panels[1]!.remove();
    await flush();

    expect(document.activeElement).toBe(document.body);
  });

  it("doesn't move focus when only a panel's content changes", async () => {
    const element = mount();
    const { panels } = parts(element);
    const button = document.createElement("button");
    panels[0]!.append(button);
    button.focus();

    button.remove();
    await flush();

    expect(document.activeElement).not.toBe(parts(element).tabs[0]);
  });
});

describe("disconnecting", () => {
  it("restores the original markup when removed", () => {
    const element = mount();
    const before = element.innerHTML;
    // A fresh copy that was never set up gives the original markup.
    const original = mount(markup());
    original.remove();
    const originalHtml = original.innerHTML;

    element.remove();
    expect(element.innerHTML).toBe(originalHtml);
    expect(element.innerHTML).not.toBe(before);
  });

  it("keeps the selection when moved", () => {
    const element = mount();
    element.select(2);
    const other = document.createElement("div");
    document.body.append(other);

    other.append(element); // disconnect, then connect
    expect(element.selectedIndex).toBe(2);
    expect(parts(element).list.getAttribute("role")).toBe("tablist");
  });

  it("stops following DOM changes once removed", async () => {
    const element = mount();
    element.remove();
    const [tab] = addPair(element, "Four");
    parts(element).list.remove();
    await flush();

    expect(tab.hasAttribute("role")).toBe(false);
    expect(uncaught).toEqual([]);
  });

  it("stops reacting to clicks once removed", () => {
    const element = mount();
    const listener = vi.fn();
    element.addEventListener("appret-tabs-change", listener);
    element.remove();

    parts(element).tabs[1]!.click();
    expect(listener).not.toHaveBeenCalled();
  });
});
