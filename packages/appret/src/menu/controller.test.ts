import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MenuController,
  type MenuControllerConfig,
  type MenuItem,
} from "./controller.js";

const names = ["Copy", "Cut", "Paste", "Rename", "Delete"];

type Setup = {
  texts?: string[];
  disabled?: number[];
  dir?: "ltr" | "rtl";
  items?: (elements: HTMLElement[]) => MenuControllerConfig["items"];
  config?: Partial<MenuControllerConfig>;
};

let controllers: MenuController[] = [];
let warn: ReturnType<typeof vi.spyOn>;

function setup({
  texts = names,
  disabled = [],
  dir,
  items,
  config = {},
}: Setup = {}) {
  const host = document.createElement("div");
  const menu = document.createElement("div");
  const elements = texts.map((text, i) => {
    const element = document.createElement("div");
    element.textContent = text;
    if (disabled.includes(i)) element.setAttribute("aria-disabled", "true");
    return element;
  });

  menu.append(...elements);
  if (dir) host.dir = dir;
  host.append(menu);
  document.body.append(host);

  const controller = new MenuController(host, {
    menu,
    items: items ? items(elements) : elements,
    label: "Edit",
    ...config,
  });
  controllers.push(controller);

  return { host, menu, elements, controller };
}

//  A "View" menu: an action, two checkbox items, a separator and a group of radio items
function setupView(config: Partial<MenuControllerConfig> = {}) {
  const host = document.createElement("div");
  host.innerHTML = `
    <div class="menu">
      <div class="zoom">Zoom to fit</div>
      <div class="ruler" aria-checked="true">Show ruler</div>
      <div class="wrap">Word wrap</div>
      <hr>
      <div class="sort">
        <div class="label">Sort by</div>
        <div class="name" aria-checked="true">Name</div>
        <div class="date">Date</div>
        <div class="size">Size</div>
      </div>
    </div>`;
  document.body.append(host);

  const get = (selector: string) => host.querySelector<HTMLElement>(selector)!;
  const menu = get(".menu");
  const radio = (selector: string): MenuItem => ({
    type: "radio",
    element: get(selector),
  });

  const controller = new MenuController(host, {
    menu,
    label: "View",
    items: [
      get(".zoom"),
      { type: "checkbox", element: get(".ruler") },
      { type: "checkbox", element: get(".wrap") },
      {
        group: get(".sort"),
        label: { byElements: [get(".label")] },
        items: [radio(".name"), radio(".date"), radio(".size")],
      },
    ],
    separators: [get("hr")],
    ...config,
  });
  controllers.push(controller);

  return {
    host,
    menu,
    controller,
    zoom: get(".zoom"),
    ruler: get(".ruler"),
    wrap: get(".wrap"),
    separator: get("hr"),
    sort: get(".sort"),
    sortLabel: get(".label"),
    name: get(".name"),
    date: get(".date"),
    size: get(".size"),
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

function tabStops(elements: HTMLElement[]): number[] {
  return elements.flatMap((element, i) =>
    element.getAttribute("tabindex") === "0" ? [i] : [],
  );
}

function focused(elements: HTMLElement[]): number {
  return elements.indexOf(document.activeElement as HTMLElement);
}

function listen(host: HTMLElement) {
  const activations: unknown[] = [];
  const closes: unknown[] = [];
  host.addEventListener("appret-menu-activate", (e) => activations.push(e.detail));
  host.addEventListener("appret-menu-close", (e) => closes.push(e.detail));
  return { activations, closes };
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
  it("gives the container the menu role and the items the menuitem role", () => {
    const { menu, elements } = setup();
    expect(menu.getAttribute("role")).toBe("menu");
    for (const element of elements) {
      expect(element.getAttribute("role")).toBe("menuitem");
    }
  });

  it("gives checkbox and radio items their roles", () => {
    const { ruler, name } = setupView();
    expect(ruler.getAttribute("role")).toBe("menuitemcheckbox");
    expect(name.getAttribute("role")).toBe("menuitemradio");
  });

  it("labels the menu", () => {
    const { menu } = setup();
    expect(menu.getAttribute("aria-label")).toBe("Edit");
  });

  it("gives groups the group role and labels them", () => {
    const { sort, sortLabel } = setupView();
    expect(sort.getAttribute("role")).toBe("group");
    expect(sort.ariaLabelledByElements).toEqual([sortLabel]);
  });

  it("gives a group label inside the menu the presentation role", () => {
    const { sortLabel } = setupView();
    expect(sortLabel.getAttribute("role")).toBe("presentation");
  });

  it("gives separators the separator role", () => {
    const { separator } = setupView();
    expect(separator.getAttribute("role")).toBe("separator");
    expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("makes separators vertical in a horizontal menu", () => {
    const { separator } = setupView({ orientation: "horizontal" });
    expect(separator.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("keeps the author's aria-checked and sets false on the others", () => {
    const { ruler, wrap, name, date } = setupView();
    expect(ruler.getAttribute("aria-checked")).toBe("true");
    expect(wrap.getAttribute("aria-checked")).toBe("false");
    expect(name.getAttribute("aria-checked")).toBe("true");
    expect(date.getAttribute("aria-checked")).toBe("false");
  });

  it("doesn't set aria-checked on plain items", () => {
    const { zoom } = setupView();
    expect(zoom.hasAttribute("aria-checked")).toBe(false);
  });

  it("leaves aria-orientation unset by default", () => {
    const { menu } = setup();
    expect(menu.hasAttribute("aria-orientation")).toBe(false);
  });

  it("sets aria-orientation", () => {
    const { menu } = setup({ config: { orientation: "horizontal" } });
    expect(menu.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("makes only the first item reachable with Tab", () => {
    const { elements } = setup();
    expect(tabStops(elements)).toEqual([0]);
  });

  it("makes the first item reachable even when it's disabled", () => {
    const { elements } = setup({ disabled: [0, 1] });
    expect(tabStops(elements)).toEqual([0]);
  });

  it("doesn't move focus at setup", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    setup();
    expect(document.activeElement).toBe(outside);
  });
});

describe("keyboard", () => {
  it("Down Arrow moves focus and the tab stop to the next item", () => {
    const { elements } = setup();
    elements[0]!.focus();
    const event = press("ArrowDown");
    expect(focused(elements)).toBe(1);
    expect(tabStops(elements)).toEqual([1]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Up Arrow moves focus to the previous item", () => {
    const { elements } = setup();
    elements[2]!.focus();
    press("ArrowUp");
    expect(focused(elements)).toBe(1);
  });

  it("wraps at the ends by default", () => {
    const { elements } = setup();
    elements[4]!.focus();
    press("ArrowDown");
    expect(focused(elements)).toBe(0);
    press("ArrowUp");
    expect(focused(elements)).toBe(4);
  });

  it("stops at the ends with loop: false", () => {
    const { elements } = setup({ config: { loop: false } });
    elements[4]!.focus();
    press("ArrowDown");
    expect(focused(elements)).toBe(4);
    elements[0]!.focus();
    press("ArrowUp");
    expect(focused(elements)).toBe(0);
  });

  it("Home and End move focus to the first and last items", () => {
    const { elements } = setup();
    elements[2]!.focus();
    press("End");
    expect(focused(elements)).toBe(4);
    press("Home");
    expect(focused(elements)).toBe(0);
  });

  it("moves through groups and skips separators", () => {
    const { zoom, ruler, wrap, name } = setupView();
    zoom.focus();
    press("ArrowDown");
    expect(document.activeElement).toBe(ruler);
    press("ArrowDown");
    press("ArrowDown");
    expect(wrap.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(name);
  });

  it("leaves Left and Right Arrows to the page in a vertical menu", () => {
    const { elements } = setup();
    elements[0]!.focus();
    const event = press("ArrowRight");
    expect(focused(elements)).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores keys with Ctrl, Meta or Alt", () => {
    const { elements } = setup();
    elements[0]!.focus();
    press("ArrowDown", { ctrlKey: true });
    press("ArrowDown", { metaKey: true });
    press("ArrowDown", { altKey: true });
    expect(focused(elements)).toBe(0);
  });

  it("ignores keys already handled", () => {
    const { elements } = setup();
    elements[0]!.focus();
    elements[0]!.addEventListener("keydown", (e) => e.preventDefault(), {
      capture: true,
    });
    press("ArrowDown");
    expect(focused(elements)).toBe(0);
  });

  describe("horizontal", () => {
    it("Right and Left Arrows move focus", () => {
      const { elements } = setup({ config: { orientation: "horizontal" } });
      elements[0]!.focus();
      press("ArrowRight");
      expect(focused(elements)).toBe(1);
      press("ArrowLeft");
      expect(focused(elements)).toBe(0);
    });

    it("leaves Down and Up Arrows to the page", () => {
      const { elements } = setup({ config: { orientation: "horizontal" } });
      elements[0]!.focus();
      const event = press("ArrowDown");
      expect(focused(elements)).toBe(0);
      expect(event.defaultPrevented).toBe(false);
    });

    it("swaps Left and Right in right-to-left", () => {
      const { elements } = setup({
        dir: "rtl",
        config: { orientation: "horizontal" },
      });
      elements[0]!.focus();
      press("ArrowLeft");
      expect(focused(elements)).toBe(1);
    });
  });

  describe("disabled items", () => {
    it("stay reachable with the arrows, Home and End, as the pattern says", () => {
      const { elements } = setup({ disabled: [0, 2, 4] });
      elements[1]!.focus();
      press("ArrowDown");
      expect(focused(elements)).toBe(2);
      press("End");
      expect(focused(elements)).toBe(4);
      press("Home");
      expect(focused(elements)).toBe(0);
    });

    it("can't be activated with Enter or Space once focused", () => {
      const { elements, host } = setup({ disabled: [1] });
      const { activations, closes } = listen(host);
      elements[0]!.focus();
      press("ArrowDown");
      press("Enter");
      press(" ");
      expect(focused(elements)).toBe(1);
      expect(activations).toEqual([]);
      expect(closes).toEqual([]);
    });

    it("skip natively disabled buttons, which browsers can't focus", () => {
      const host = document.createElement("div");
      host.innerHTML = `<div class="menu"><button>One</button><button disabled>Two</button><button>Three</button></div>`;
      document.body.append(host);
      const buttons = [...host.querySelectorAll("button")];
      controllers.push(
        new MenuController(host, {
          menu: host.querySelector<HTMLElement>(".menu")!,
          items: buttons,
          label: "Numbers",
        }),
      );
      buttons[0]!.focus();
      press("ArrowDown");
      expect(document.activeElement).toBe(buttons[2]);
    });

    it("include every item of a disabled group, which stay reachable", () => {
      const { sort, wrap, name, host } = setupView();
      const { activations } = listen(host);
      sort.setAttribute("aria-disabled", "true");
      wrap.focus();
      press("ArrowDown");
      expect(document.activeElement).toBe(name);
      press(" ");
      expect(activations).toEqual([]);
    });

    it("include every item of a disabled menu", () => {
      const { menu, elements, host } = setup();
      const { activations } = listen(host);
      menu.setAttribute("aria-disabled", "true");
      elements[1]!.click();
      expect(activations).toEqual([]);
    });
  });
});

describe("type-ahead", () => {
  it("moves focus to the next item starting with the typed character", () => {
    const { elements } = setup();
    elements[0]!.focus();
    const event = press("p");
    expect(focused(elements)).toBe(2);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores case", () => {
    const { elements } = setup();
    elements[0]!.focus();
    press("R", { shiftKey: true });
    expect(focused(elements)).toBe(3);
  });

  it("moves to the next match each time the character is typed", () => {
    const { elements } = setup();
    elements[0]!.focus();
    press("c");
    expect(focused(elements)).toBe(1);
    press("c");
    expect(focused(elements)).toBe(0);
  });

  it("only matches the first character", () => {
    const { elements } = setup();
    elements[0]!.focus();
    press("d");
    press("e");
    expect(focused(elements)).toBe(4);
  });

  it("reaches disabled items too", () => {
    const { elements } = setup({ disabled: [1] });
    elements[0]!.focus();
    press("c");
    expect(focused(elements)).toBe(1);
  });

  it("matches an item's aria-label before its text", () => {
    const { elements } = setup({ texts: ["Copy", "✂️"] });
    elements[1]!.setAttribute("aria-label", "Cut");
    elements[0]!.focus();
    press("c");
    expect(focused(elements)).toBe(1);
  });

  it("leaves focus where it is when nothing matches", () => {
    const { elements } = setup();
    elements[0]!.focus();
    const event = press("z");
    expect(focused(elements)).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves Space to activation", () => {
    const { elements, host } = setup({ texts: ["Copy", " Space"] });
    const { activations } = listen(host);
    elements[0]!.focus();
    press(" ");
    expect(focused(elements)).toBe(0);
    expect(activations).toHaveLength(1);
  });
});

describe("activation", () => {
  describe("plain items", () => {
    it("Enter activates the item and asks to close the menu", () => {
      const { elements, host } = setup();
      const { activations, closes } = listen(host);
      elements[1]!.focus();
      const event = press("Enter");
      expect(activations).toEqual([{ item: elements[1], checked: undefined }]);
      expect(closes).toEqual([{ reason: "activate" }]);
      expect(event.defaultPrevented).toBe(true);
    });

    it("Space activates the item and asks to close the menu", () => {
      const { elements, host } = setup();
      const { activations, closes } = listen(host);
      elements[1]!.focus();
      press(" ");
      expect(activations).toHaveLength(1);
      expect(closes).toEqual([{ reason: "activate" }]);
    });

    it("a click activates the item and asks to close the menu", () => {
      const { elements, host } = setup();
      const { activations, closes } = listen(host);
      elements[2]!.click();
      expect(activations).toEqual([{ item: elements[2], checked: undefined }]);
      expect(closes).toEqual([{ reason: "activate" }]);
    });

    it("fires the activation before the close request", () => {
      const { elements, host } = setup();
      const order: string[] = [];
      host.addEventListener("appret-menu-activate", () => order.push("activate"));
      host.addEventListener("appret-menu-close", () => order.push("close"));
      elements[0]!.click();
      expect(order).toEqual(["activate", "close"]);
    });
  });

  describe("checkbox items", () => {
    it("Space toggles the item without closing the menu", () => {
      const { wrap, host } = setupView();
      const { activations, closes } = listen(host);
      wrap.focus();
      press(" ");
      expect(wrap.getAttribute("aria-checked")).toBe("true");
      press(" ");
      expect(wrap.getAttribute("aria-checked")).toBe("false");
      expect(activations).toEqual([
        { item: wrap, checked: true },
        { item: wrap, checked: false },
      ]);
      expect(closes).toEqual([]);
    });

    it("Enter toggles the item and asks to close the menu", () => {
      const { ruler, host } = setupView();
      const { activations, closes } = listen(host);
      ruler.focus();
      press("Enter");
      expect(ruler.getAttribute("aria-checked")).toBe("false");
      expect(activations).toEqual([{ item: ruler, checked: false }]);
      expect(closes).toEqual([{ reason: "activate" }]);
    });

    it("a click toggles the item and asks to close the menu", () => {
      const { wrap, host } = setupView();
      const { closes } = listen(host);
      wrap.click();
      expect(wrap.getAttribute("aria-checked")).toBe("true");
      expect(closes).toEqual([{ reason: "activate" }]);
    });

    it("toggle independently of each other", () => {
      const { ruler, wrap } = setupView();
      wrap.click();
      expect(ruler.getAttribute("aria-checked")).toBe("true");
      expect(wrap.getAttribute("aria-checked")).toBe("true");
    });
  });

  describe("radio items", () => {
    it("Space checks the item, unchecks the others in its group, and keeps the menu open", () => {
      const { name, date, size, host } = setupView();
      const { activations, closes } = listen(host);
      date.focus();
      press(" ");
      expect(
        [name, date, size].map((r) => r.getAttribute("aria-checked")),
      ).toEqual(["false", "true", "false"]);
      expect(activations).toEqual([{ item: date, checked: true }]);
      expect(closes).toEqual([]);
    });

    it("reports checked: true when the item was already checked", () => {
      const { name, host } = setupView();
      const { activations } = listen(host);
      name.focus();
      press(" ");
      expect(name.getAttribute("aria-checked")).toBe("true");
      expect(activations).toEqual([{ item: name, checked: true }]);
    });

    it("Enter checks the item and asks to close the menu", () => {
      const { size, host } = setupView();
      const { closes } = listen(host);
      size.focus();
      press("Enter");
      expect(size.getAttribute("aria-checked")).toBe("true");
      expect(closes).toEqual([{ reason: "activate" }]);
    });

    it("only affect the radio items of the same group", () => {
      const host = document.createElement("div");
      host.innerHTML = `
        <div class="menu">
          <div class="a"><div>Small</div><div aria-checked="true">Large</div></div>
          <div class="b"><div aria-checked="true">Light</div><div>Dark</div></div>
          <div class="loose-1">Left</div>
          <div class="loose-2" aria-checked="true">Right</div>
        </div>`;
      document.body.append(host);
      const group = (selector: string) => {
        const element = host.querySelector<HTMLElement>(selector)!;
        return {
          group: element,
          label: selector,
          items: [...element.children].map((child) => ({
            type: "radio" as const,
            element: child as HTMLElement,
          })),
        };
      };
      const loose = (selector: string) => ({
        type: "radio" as const,
        element: host.querySelector<HTMLElement>(selector)!,
      });
      controllers.push(
        new MenuController(host, {
          menu: host.querySelector<HTMLElement>(".menu")!,
          label: "Settings",
          items: [group(".a"), group(".b"), loose(".loose-1"), loose(".loose-2")],
        }),
      );

      const checked = () =>
        [...host.querySelectorAll("[role=menuitemradio]")].map((r) =>
          r.getAttribute("aria-checked"),
        );

      (host.querySelector(".a")!.firstElementChild as HTMLElement).click();
      expect(checked()).toEqual(["true", "false", "true", "false", "false", "true"]);

      host.querySelector<HTMLElement>(".loose-1")!.click();
      expect(checked()).toEqual(["true", "false", "true", "false", "true", "false"]);
    });
  });

  describe("disabled items", () => {
    it("can't be activated by a click", () => {
      const { elements, host } = setup({ disabled: [1] });
      const { activations, closes } = listen(host);
      elements[1]!.click();
      expect(activations).toEqual([]);
      expect(closes).toEqual([]);
    });

    it("can't be toggled", () => {
      const { wrap } = setupView();
      wrap.setAttribute("aria-disabled", "true");
      wrap.click();
      expect(wrap.getAttribute("aria-checked")).toBe("false");
    });
  });

  it("ignores clicks already handled", () => {
    const { elements, host } = setup();
    const { activations } = listen(host);
    elements[1]!.addEventListener("click", (e) => e.preventDefault(), {
      capture: true,
    });
    elements[1]!.click();
    expect(activations).toEqual([]);
  });
});

describe("link items", () => {
  function setupLinks({ disabled = false } = {}) {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="menu">
        <a href="#profile">Profile</a>
        <a href="#settings"${disabled ? ' aria-disabled="true"' : ""}>Settings</a>
      </div>`;
    document.body.append(host);
    const links = [...host.querySelectorAll("a")];
    controllers.push(
      new MenuController(host, {
        menu: host.querySelector<HTMLElement>(".menu")!,
        items: links,
        label: "Account",
      }),
    );
    const clicks: HTMLElement[] = [];
    for (const link of links) {
      link.addEventListener("click", () => clicks.push(link));
    }
    return { host, links, clicks };
  }

  it("Enter follows the link with a click, which activates it once", () => {
    const { host, links, clicks } = setupLinks();
    const { activations, closes } = listen(host);
    links[1]!.focus();
    press("Enter");
    expect(clicks).toEqual([links[1]]);
    expect(activations).toEqual([{ item: links[1], checked: undefined }]);
    expect(closes).toEqual([{ reason: "activate" }]);
  });

  it("Space follows the link with a click too", () => {
    const { host, links, clicks } = setupLinks();
    const { activations } = listen(host);
    links[0]!.focus();
    const event = press(" ");
    expect(clicks).toEqual([links[0]]);
    expect(activations).toHaveLength(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("a click activates the link item without preventing the navigation", () => {
    const { host, links } = setupLinks();
    const { activations } = listen(host);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    links[0]!.dispatchEvent(event);
    expect(activations).toHaveLength(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([["metaKey"], ["ctrlKey"], ["shiftKey"]])(
    "ignores a click with %s, which opens the link elsewhere",
    (modifier) => {
      const { host, links } = setupLinks();
      const { activations, closes } = listen(host);
      links[0]!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, [modifier]: true }),
      );
      expect(activations).toEqual([]);
      expect(closes).toEqual([]);
    },
  );

  it("doesn't follow a disabled link", () => {
    const { host, links, clicks } = setupLinks({ disabled: true });
    const { activations } = listen(host);
    links[1]!.focus();
    press("Enter");
    expect(clicks).toEqual([]);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    links[1]!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(activations).toEqual([]);
  });

  it("still activates other items with Enter as before", () => {
    const { elements, host } = setup();
    const clicks: unknown[] = [];
    elements[0]!.addEventListener("click", () => clicks.push(1));
    const { activations } = listen(host);
    elements[0]!.focus();
    press("Enter");
    expect(clicks).toEqual([]);
    expect(activations).toHaveLength(1);
  });
});

describe("closing", () => {
  it("Escape asks to close the menu", () => {
    const { elements, host } = setup();
    const { closes } = listen(host);
    elements[0]!.focus();
    const event = press("Escape");
    expect(closes).toEqual([{ reason: "escape" }]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Tab asks to close the menu and leaves focus to move", () => {
    const { elements, host } = setup();
    const { closes } = listen(host);
    elements[0]!.focus();
    const event = press("Tab");
    expect(closes).toEqual([{ reason: "tab" }]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("Shift + Tab asks to close the menu too", () => {
    const { elements, host } = setup();
    const { closes } = listen(host);
    elements[0]!.focus();
    press("Tab", { shiftKey: true });
    expect(closes).toEqual([{ reason: "tab" }]);
  });

  it("fires a close request that can be cancelled", () => {
    const { elements, host } = setup();
    let event: Event | undefined;
    host.addEventListener("appret-menu-close", (e) => {
      event = e;
      e.preventDefault();
    });
    elements[0]!.click();
    expect(event!.cancelable).toBe(true);
    expect(event!.defaultPrevented).toBe(true);
  });

  it("bubbles from the host", () => {
    const { elements } = setup();
    const closes: unknown[] = [];
    document.body.addEventListener("appret-menu-close", (e) => closes.push(e.detail));
    elements[0]!.focus();
    press("Escape");
    expect(closes).toEqual([{ reason: "escape" }]);
  });
});

describe("focus()", () => {
  it("moves focus to the tab stop", () => {
    const { elements, controller } = setup();
    controller.focus();
    expect(focused(elements)).toBe(0);
  });

  it("moves focus and the tab stop to an item", () => {
    const { elements, controller } = setup();
    controller.focus(elements[3]!);
    expect(focused(elements)).toBe(3);
    expect(tabStops(elements)).toEqual([3]);
  });

  it("accepts an item object", () => {
    const { controller, wrap } = setupView();
    controller.focus({ type: "checkbox", element: wrap });
    expect(document.activeElement).toBe(wrap);
  });

  it("focuses a disabled item", () => {
    const { elements, controller } = setup({ disabled: [2] });
    controller.focus(elements[2]!);
    expect(focused(elements)).toBe(2);
  });

  it("warns and does nothing for a natively disabled button", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div class="menu"><button>One</button><button disabled>Two</button></div>`;
    document.body.append(host);
    const buttons = [...host.querySelectorAll("button")];
    const controller = new MenuController(host, {
      menu: host.querySelector<HTMLElement>(".menu")!,
      items: buttons,
      label: "Numbers",
    });
    controllers.push(controller);
    controller.focus(buttons[1]!);
    expect(buttons.map((b) => b.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("natively disabled"),
      buttons[1],
    );
  });

  it("warns and does nothing for an element that isn't an item", () => {
    const { elements, controller } = setup();
    const outsider = document.createElement("div");
    controller.focus(outsider);
    expect(tabStops(elements)).toEqual([0]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("not in menu items"),
      outsider,
    );
  });

  it("focusFirst() and focusLast() focus the first and last items, even when disabled", () => {
    const { elements, controller } = setup({ disabled: [0, 4] });
    controller.focusLast();
    expect(focused(elements)).toBe(4);
    controller.focusFirst();
    expect(focused(elements)).toBe(0);
  });

  it("doesn't fire events", () => {
    const { elements, host, controller } = setup();
    const { activations, closes } = listen(host);
    controller.focus(elements[2]!);
    controller.focusFirst();
    controller.focusLast();
    expect(activations).toEqual([]);
    expect(closes).toEqual([]);
  });
});

describe("setFocusable()", () => {
  it("moves the tab stop without moving focus", () => {
    const { elements, controller } = setup();
    controller.setFocusable(elements[3]!);
    expect(tabStops(elements)).toEqual([3]);
    expect(focused(elements)).toBe(-1);
  });

  it("accepts a disabled item", () => {
    const { elements, controller } = setup({ disabled: [3] });
    controller.setFocusable(elements[3]!);
    expect(tabStops(elements)).toEqual([3]);
  });

  it("warns and does nothing for an element that isn't an item", () => {
    const { elements, controller } = setup();
    controller.setFocusable(document.createElement("div"));
    expect(tabStops(elements)).toEqual([0]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("not among menu items"),
      expect.any(HTMLElement),
    );
  });
});

describe("update()", () => {
  function addItem(menu: HTMLElement, text: string) {
    const item = document.createElement("div");
    item.textContent = text;
    menu.append(item);
    return item;
  }

  it("manages added items", () => {
    const { menu, elements, controller } = setup();
    const added = addItem(menu, "Duplicate");
    controller.update({ items: [...elements, added] });
    expect(added.getAttribute("role")).toBe("menuitem");
    elements[0]!.focus();
    press("End");
    expect(document.activeElement).toBe(added);
  });

  it("gives removed items their original markup back", () => {
    const { elements, controller } = setup();
    controller.update({ items: elements.slice(0, 2) });
    for (const element of elements.slice(2)) {
      expect(element.hasAttribute("role")).toBe(false);
      expect(element.hasAttribute("tabindex")).toBe(false);
    }
  });

  it("keeps the tab stop on its item when it's still there", () => {
    const { menu, elements, controller } = setup();
    elements[0]!.focus();
    press("ArrowDown");
    press("ArrowDown");
    controller.update({ items: [...elements, addItem(menu, "Duplicate")] });
    expect(tabStops(elements)).toEqual([2]);
  });

  it("moves the tab stop to the first item when its item is removed", () => {
    const { elements, controller } = setup({ disabled: [0] });
    controller.setFocusable(elements[3]!);
    controller.update({ items: elements.filter((_, i) => i !== 3) });
    expect(tabStops(elements)).toEqual([0]);
  });

  it("keeps the checked state of items that stay", () => {
    const { controller, ruler, wrap, zoom } = setupView();
    wrap.focus();
    press(" ");
    controller.update({
      items: [zoom, { type: "checkbox", element: ruler }, { type: "checkbox", element: wrap }],
      separators: [],
    });
    expect(wrap.getAttribute("aria-checked")).toBe("true");
  });

  it("doesn't duplicate listeners on items that stay", () => {
    const { elements, host, controller } = setup();
    controller.update({});
    controller.update({});
    const { activations } = listen(host);
    elements[1]!.click();
    expect(activations).toHaveLength(1);
  });

  it("ignores changes to the arrays until update() is called", () => {
    const { menu, elements, controller } = setup();
    const added = addItem(menu, "Duplicate");
    elements.push(added);
    controller.update({});
    expect(added.hasAttribute("role")).toBe(false);
    controller.update({ items: elements });
    expect(added.getAttribute("role")).toBe("menuitem");
  });

  it("can switch to a horizontal menu", () => {
    const { menu, elements, controller } = setup();
    controller.update({ orientation: "horizontal" });
    expect(menu.getAttribute("aria-orientation")).toBe("horizontal");
    elements[0]!.focus();
    press("ArrowRight");
    expect(focused(elements)).toBe(1);
  });

  it("can be emptied and refilled", () => {
    const { elements, controller } = setup();
    controller.update({ items: [] });
    for (const element of elements) {
      expect(element.hasAttribute("role")).toBe(false);
    }
    controller.update({ items: elements });
    expect(tabStops(elements)).toEqual([0]);
    elements[0]!.focus();
    press("ArrowDown");
    expect(focused(elements)).toBe(1);
  });

  it("warns and does nothing after destroy()", () => {
    const { menu, controller } = setup();
    controller.destroy();
    controller.update({ label: "Clipboard" });
    expect(menu.hasAttribute("aria-label")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("after destroy()"));
  });
});

describe("errors and warnings", () => {
  it("accepts no items", () => {
    const { menu, controller } = setup({ texts: [] });
    expect(menu.getAttribute("role")).toBe("menu");
    controller.focus();
    controller.focusFirst();
    controller.focusLast();
    expect(document.activeElement).toBe(document.body);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns about items that aren't inside the menu", () => {
    const outsider = document.createElement("div");
    document.body.append(outsider);
    setup({ items: (elements) => [...elements, outsider] });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("aren't inside `menu`"),
      expect.anything(),
    );
  });

  it("warns when the menu has no label", () => {
    const { menu } = setup({ config: { label: undefined } });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("the menu is missing an accessible label"),
      menu,
    );
  });

  it("warns about label IDs that don't exist", () => {
    setup({ config: { label: { byId: "nowhere" } } });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ID missing"), [
      "nowhere",
    ]);
  });

  it("doesn't warn for a working setup", () => {
    setup();
    setupView();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("destroy()", () => {
  it("restores the original markup", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <div class="menu">
        <button>Copy</button>
        <button tabindex="3" aria-checked="true">Bold</button>
        <hr>
        <div class="group"><button>Left</button><button>Right</button></div>
      </div>`;
    document.body.append(host);
    const html = host.innerHTML;
    const get = (selector: string) => host.querySelector<HTMLElement>(selector)!;
    const buttons = [...host.querySelectorAll("button")];
    const controller = new MenuController(host, {
      menu: get(".menu"),
      label: "Format",
      orientation: "horizontal",
      items: [
        buttons[0]!,
        { type: "checkbox", element: buttons[1]! },
        {
          group: get(".group"),
          label: "Alignment",
          items: [
            { type: "radio", element: buttons[2]! },
            { type: "radio", element: buttons[3]! },
          ],
        },
      ],
      separators: [get("hr")],
    });
    buttons[1]!.click();
    buttons[3]!.click();
    controller.destroy();
    expect(host.innerHTML).toBe(html);
  });

  it("stops handling clicks and keys", () => {
    const { elements, host, controller } = setup();
    const { activations } = listen(host);
    controller.destroy();
    elements[1]!.click();
    elements[0]!.focus();
    const event = press("ArrowDown");
    expect(activations).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("can be called twice", () => {
    const { controller } = setup();
    controller.destroy();
    expect(() => controller.destroy()).not.toThrow();
  });

  it("makes focus methods warn and do nothing", () => {
    const { elements, controller } = setup();
    controller.destroy();
    controller.focus(elements[1]!);
    controller.focusFirst();
    controller.focusLast();
    controller.setFocusable(elements[1]!);
    expect(focused(elements)).toBe(-1);
    expect(warn).toHaveBeenCalledTimes(4);
  });
});
