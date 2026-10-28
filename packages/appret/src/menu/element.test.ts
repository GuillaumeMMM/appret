import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../define/menu.js";
import { defineElement } from "../shared/element.js";
import { MenuController } from "./controller.js";
import { MenuElement } from "./element.js";

// Covers what the element adds on top of MenuController: finding parts,
// groups, attributes, lifecycle, forwarding the API, and following DOM changes.
// Roles, keyboard and activation rules are covered in controller.test.ts.

const flush = () => new Promise((resolve) => setTimeout(resolve));

function markup(names = ["Copy", "Cut", "Paste"], attributes = 'label="Edit"') {
  return `
    <appret-menu ${attributes}>
      <div data-appret-part="menu.menu">
        ${names.map((n) => `<div data-appret-part="menu.item">${n}</div>`).join("")}
      </div>
    </appret-menu>`;
}

//  An action, two checkbox items, a separator and a labelled group of radio items
function viewMarkup(attributes = 'label="View"', labelId = "") {
  return `
    <appret-menu ${attributes}>
      <div data-appret-part="menu.menu">
        <div data-appret-part="menu.item" class="zoom">Zoom to fit</div>
        <div data-appret-part="menu.checkbox" class="ruler" aria-checked="true">Show ruler</div>
        <div data-appret-part="menu.checkbox" class="wrap">Word wrap</div>
        <hr data-appret-part="menu.separator">
        <div data-appret-part="menu.group" class="sort">
          <p data-appret-part="menu.group-label" class="label"${labelId ? ` id="${labelId}"` : ""}>Sort by</p>
          <div data-appret-part="menu.radio" class="name" aria-checked="true">Name</div>
          <div data-appret-part="menu.radio" class="date">Date</div>
        </div>
        <div data-appret-part="menu.item" class="reset">Reset view</div>
      </div>
    </appret-menu>`;
}

function mount(html = markup()) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const element = template.content.firstElementChild as MenuElement;
  document.body.append(element);
  return element;
}

function get(element: Element, selector: string) {
  return element.querySelector<HTMLElement>(selector)!;
}

function items(element: Element) {
  return [
    ...element.querySelectorAll<HTMLElement>(
      '[data-appret-part~="menu.item"], [data-appret-part~="menu.checkbox"], [data-appret-part~="menu.radio"]',
    ),
  ].filter((el) => el.closest("appret-menu, nested-menu") === element);
}

function addItem(element: Element, name: string, part = "menu.item") {
  const item = document.createElement("div");
  item.dataset.appretPart = part;
  item.textContent = name;
  get(element, '[data-appret-part~="menu.menu"]').append(item);
  return item;
}

function press(key: string, init: KeyboardEventInit = {}) {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
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
  it("registers <appret-menu> from appret/define/menu", () => {
    expect(customElements.get("appret-menu")).toBe(MenuElement);
  });

  it("doesn't throw when the same name is defined twice", () => {
    expect(() => defineElement("appret-menu", class extends MenuElement {})).not.toThrow();
    expect(customElements.get("appret-menu")).toBe(MenuElement);
  });

  it("works under a custom tag name", () => {
    defineElement("acme-menu", class extends MenuElement {});
    const element = mount(markup().replaceAll("appret-menu", "acme-menu"));
    expect(get(element, '[data-appret-part~="menu.menu"]').getAttribute("role")).toBe("menu");
  });
});

describe("setup", () => {
  it("finds its parts and sets up the controller when connected", () => {
    const element = mount();
    const menu = get(element, '[data-appret-part~="menu.menu"]');
    expect(menu.getAttribute("role")).toBe("menu");
    expect(menu.getAttribute("aria-label")).toBe("Edit");
    expect(items(element).map((i) => i.getAttribute("role"))).toEqual([
      "menuitem",
      "menuitem",
      "menuitem",
    ]);
    expect(items(element).map((i) => i.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("accepts parts with several tokens in data-appret-part", () => {
    const element = mount(
      viewMarkup()
        .replace('data-appret-part="menu.checkbox" class="wrap"', 'data-appret-part="menu.checkbox other.part" class="wrap"')
        .replace('data-appret-part="menu.radio" class="date"', 'data-appret-part="other.part menu.radio" class="date"'),
    );
    expect(get(element, ".wrap").getAttribute("role")).toBe("menuitemcheckbox");
    expect(get(element, ".date").getAttribute("role")).toBe("menuitemradio");
  });

  it("does nothing until it's connected", () => {
    const template = document.createElement("template");
    template.innerHTML = markup().trim();
    const element = template.content.firstElementChild!;
    expect(get(element, '[data-appret-part~="menu.menu"]').hasAttribute("role")).toBe(false);
  });

  it("waits for DOMContentLoaded while the document is loading", () => {
    Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" });
    try {
      const element = mount();
      const menu = get(element, '[data-appret-part~="menu.menu"]');
      expect(menu.hasAttribute("role")).toBe(false);

      Object.defineProperty(document, "readyState", { configurable: true, get: () => "interactive" });
      document.dispatchEvent(new Event("DOMContentLoaded"));
      expect(menu.getAttribute("role")).toBe("menu");
    } finally {
      delete (document as unknown as Record<string, unknown>).readyState;
    }
  });

  it("sets up once its children are added after it's connected", async () => {
    const element = document.createElement("appret-menu");
    element.setAttribute("label", "Edit");
    document.body.append(element);
    element.innerHTML = markup().replace(/^\s*<appret-menu[^>]*>|<\/appret-menu>\s*$/g, "");
    await flush();

    expect(get(element, '[data-appret-part~="menu.menu"]').getAttribute("role")).toBe("menu");
    expect(uncaught).toEqual([]);
  });

  it("sets up with no items", () => {
    const element = mount(markup([]));
    expect(get(element, '[data-appret-part~="menu.menu"]').getAttribute("role")).toBe("menu");
    expect(uncaught).toEqual([]);
  });

  it("only manages its own parts when menus are nested", () => {
    const element = mount(
      markup(["Outer"]).replace("</div>\n    </appret-menu>", `${markup(["Inner one", "Inner two"], 'label="Inner"')}</div>\n    </appret-menu>`),
    );
    const inner = element.querySelector("appret-menu")!;
    expect(items(element).map((i) => i.textContent)).toEqual(["Outer"]);
    expect(items(inner).map((i) => i.getAttribute("role"))).toEqual(["menuitem", "menuitem"]);
  });

  it("only manages its own parts when the nested menu has another tag name", () => {
    defineElement("nested-menu", class extends MenuElement {});
    const element = mount(
      viewMarkup().replace(
        '<div data-appret-part="menu.radio" class="date">Date</div>',
        `<div data-appret-part="menu.radio" class="date">Date</div>${markup(["Inner"], 'label="Inner"').replaceAll("appret-menu", "nested-menu")}`,
      ),
    );
    const inner = element.querySelector("nested-menu")!;
    const innerItem = items(inner)[0]!;
    expect(innerItem.getAttribute("role")).toBe("menuitem");

    get(element, ".date").focus();
    press("ArrowDown");
    expect(document.activeElement).toBe(get(element, ".reset"));
  });
});

describe("item types and groups", () => {
  it("gives checkbox and radio items their roles", () => {
    const element = mount(viewMarkup());
    expect(get(element, ".zoom").getAttribute("role")).toBe("menuitem");
    expect(get(element, ".ruler").getAttribute("role")).toBe("menuitemcheckbox");
    expect(get(element, ".name").getAttribute("role")).toBe("menuitemradio");
    expect(get(element, ".wrap").getAttribute("aria-checked")).toBe("false");
  });

  it("keeps items outside groups, in DOM order", () => {
    const element = mount(viewMarkup());
    get(element, ".zoom").focus();
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      order.push(document.activeElement!.className);
      press("ArrowDown");
    }
    expect(order).toEqual(["zoom", "ruler", "wrap", "name", "date", "reset"]);
  });

  it("gives separators the separator role", () => {
    const element = mount(viewMarkup());
    expect(get(element, "hr").getAttribute("role")).toBe("separator");
  });

  it("gives groups the group role and labels them with their group-label", () => {
    const element = mount(viewMarkup());
    const sort = get(element, ".sort");
    expect(sort.getAttribute("role")).toBe("group");
    expect(sort.ariaLabelledByElements).toEqual([get(element, ".label")]);
    expect(get(element, ".label").getAttribute("role")).toBe("presentation");
  });

  it("labels a group with aria-labelledby when its label has an id", () => {
    const element = mount(viewMarkup(undefined, "sort-label"));
    expect(get(element, ".sort").getAttribute("aria-labelledby")).toBe("sort-label");
  });

  it("checks the radio items of a group as a set", () => {
    const element = mount(viewMarkup());
    get(element, ".date").click();
    expect(get(element, ".name").getAttribute("aria-checked")).toBe("false");
    expect(get(element, ".date").getAttribute("aria-checked")).toBe("true");
  });

  it("toggles checkbox items", () => {
    const element = mount(viewMarkup());
    get(element, ".wrap").click();
    expect(get(element, ".wrap").getAttribute("aria-checked")).toBe("true");
  });
});

describe("attributes", () => {
  it("passes labelledby to the controller", () => {
    document.body.insertAdjacentHTML("beforeend", '<p id="heading">Edit</p>');
    const element = mount(markup(undefined, 'labelledby="heading"'));
    expect(get(element, '[data-appret-part~="menu.menu"]').getAttribute("aria-labelledby")).toBe("heading");
  });

  it("passes orientation to the controller", () => {
    const element = mount(markup(undefined, 'label="Edit" orientation="horizontal"'));
    expect(get(element, '[data-appret-part~="menu.menu"]').getAttribute("aria-orientation")).toBe("horizontal");
    items(element)[0]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(items(element)[1]);
  });

  it("ignores an invalid orientation with a warning", () => {
    const element = mount(markup(undefined, 'label="Edit" orientation="diagonal"'));
    expect(get(element, '[data-appret-part~="menu.menu"]').hasAttribute("aria-orientation")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid orientation="diagonal"'));
  });

  it('treats loop="false" as no wrap-around', () => {
    const element = mount(markup(undefined, 'label="Edit" loop="false"'));
    const all = items(element);
    all[2]!.focus();
    press("ArrowDown");
    expect(document.activeElement).toBe(all[2]);
  });

  it("applies attribute changes after setup", () => {
    const element = mount();
    element.setAttribute("label", "Clipboard");
    expect(get(element, '[data-appret-part~="menu.menu"]').getAttribute("aria-label")).toBe("Clipboard");
  });

  it("keeps checked states when an attribute changes", () => {
    const element = mount(viewMarkup());
    get(element, ".wrap").click();
    element.setAttribute("orientation", "horizontal");
    expect(get(element, ".wrap").getAttribute("aria-checked")).toBe("true");
  });
});

describe("API", () => {
  it("focusFirst() and focusLast() move focus to the first and last items", () => {
    const element = mount();
    element.focusLast();
    expect(document.activeElement).toBe(items(element)[2]);
    element.focusFirst();
    expect(document.activeElement).toBe(items(element)[0]);
  });

  it("focus() moves focus to the item reachable with Tab", () => {
    const element = mount();
    items(element)[0]!.focus();
    press("ArrowDown");
    document.body.focus();
    element.focus();
    expect(document.activeElement).toBe(items(element)[1]);
  });

  it("focus() passes focus options without a warning", () => {
    const element = mount();
    element.focus({ preventScroll: true });
    expect(document.activeElement).toBe(items(element)[0]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does nothing before setup", () => {
    const element = document.createElement("appret-menu");
    expect(() => {
      element.focus();
      element.focusFirst();
      element.focusLast();
    }).not.toThrow();
  });

  it("fires appret-menu-activate and appret-menu-close on the element itself", () => {
    const element = mount();
    const activations: Event[] = [];
    const closes: Event[] = [];
    element.addEventListener("appret-menu-activate", (e) => activations.push(e));
    element.addEventListener("appret-menu-close", (e) => closes.push(e));
    items(element)[1]!.click();
    expect(activations).toHaveLength(1);
    expect(activations[0]!.target).toBe(element);
    expect((activations[0] as CustomEvent).detail).toEqual({ item: items(element)[1], checked: undefined });
    expect(closes).toHaveLength(1);
  });

  it("is typed by tag name", () => {
    mount();
    // Type-level check: querySelector returns MenuElement, so focusFirst() exists.
    document.querySelector("appret-menu")!.focusFirst();
    expect(document.activeElement).toBe(items(document.querySelector("appret-menu")!)[0]);
  });
});

describe("following DOM changes", () => {
  it("manages an item added later", async () => {
    const element = mount();
    const item = addItem(element, "Delete");
    await flush();
    expect(item.getAttribute("role")).toBe("menuitem");
  });

  it("manages a checkbox item added later", async () => {
    const element = mount();
    const item = addItem(element, "Bold", "menu.checkbox");
    await flush();
    expect(item.getAttribute("role")).toBe("menuitemcheckbox");
    expect(item.getAttribute("aria-checked")).toBe("false");
  });

  it("follows an item that changes type", async () => {
    const element = mount();
    const item = items(element)[1]!;
    item.dataset.appretPart = "menu.checkbox";
    await flush();
    expect(item.getAttribute("role")).toBe("menuitemcheckbox");
  });

  it("turns an element into a part when data-appret-part is added", async () => {
    const element = mount();
    const item = document.createElement("div");
    get(element, '[data-appret-part~="menu.menu"]').append(item);
    await flush();
    expect(item.hasAttribute("role")).toBe(false);

    item.dataset.appretPart = "menu.item";
    await flush();
    expect(item.getAttribute("role")).toBe("menuitem");
  });

  describe("updates", () => {
    let update: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      update = vi.spyOn(MenuController.prototype, "update");
    });
    afterEach(() => {
      update.mockRestore();
    });

    it("don't happen for changes that don't affect the parts, groups included", async () => {
      const element = mount(viewMarkup());
      get(element, ".name").append(" (A to Z)");
      get(element, ".sort").setAttribute("class", "sort sorting");
      await flush();
      expect(update).not.toHaveBeenCalled();
    });

    it("happen when an item moves into a group", async () => {
      const element = mount(viewMarkup());
      get(element, ".sort").append(get(element, ".reset"));
      await flush();
      expect(update).toHaveBeenCalledOnce();
    });

    it("happen when a group gets a label", async () => {
      const element = mount(viewMarkup());
      const label = get(element, ".label");
      label.remove();
      await flush();
      update.mockClear();

      get(element, ".sort").prepend(label);
      await flush();
      expect(update).toHaveBeenCalledOnce();
      expect(get(element, ".sort").ariaLabelledByElements).toEqual([label]);
    });

    it("happen when the group label's id is replaced", async () => {
      const element = mount(viewMarkup(undefined, "sort-label"));
      const label = get(element, ".label");
      const replacement = label.cloneNode(true) as HTMLElement;
      replacement.id = "sort-heading";
      label.replaceWith(replacement);
      await flush();
      expect(get(element, ".sort").getAttribute("aria-labelledby")).toBe("sort-heading");
    });
  });

  it("keeps checked states when items are added", async () => {
    const element = mount(viewMarkup());
    get(element, ".wrap").click();
    addItem(element, "Fullscreen");
    await flush();
    expect(get(element, ".wrap").getAttribute("aria-checked")).toBe("true");
  });

  it("keeps working while it's emptied, and sets up the items added back", async () => {
    const element = mount();
    for (const item of items(element)) item.remove();
    await flush();
    expect(uncaught).toEqual([]);

    const item = addItem(element, "Paste");
    await flush();
    expect(item.getAttribute("role")).toBe("menuitem");
  });

  it("recovers when the menu part is removed and added back", async () => {
    const element = mount();
    const menu = get(element, '[data-appret-part~="menu.menu"]');
    menu.remove();
    await flush();
    expect(uncaught).toEqual([]);

    element.append(menu);
    await flush();
    expect(menu.getAttribute("role")).toBe("menu");
  });
});

describe("focus recovery", () => {
  it("moves focus back into the menu when the focused item is removed", async () => {
    const element = mount();
    const all = items(element);
    all[0]!.focus();
    press("ArrowDown");
    all[1]!.remove();
    await flush();
    expect(document.activeElement).toBe(all[0]);
  });

  it("doesn't steal focus from elsewhere on the page", async () => {
    const element = mount();
    const outside = document.createElement("input");
    document.body.append(outside);
    const all = items(element);
    all[1]!.focus();
    outside.focus();

    all[1]!.remove();
    await flush();
    expect(document.activeElement).toBe(outside);
  });
});

describe("disconnecting", () => {
  it("restores the original markup when removed", () => {
    const element = mount();
    const original = mount(markup());
    original.remove();
    const originalHtml = original.innerHTML;

    element.remove();
    expect(element.innerHTML).toBe(originalHtml);
  });

  it("keeps the checked states when moved", () => {
    const element = mount(viewMarkup());
    get(element, ".wrap").click();
    get(element, ".date").click();

    const other = document.createElement("div");
    document.body.append(other);
    other.append(element); // disconnect, then connect

    expect(get(element, ".wrap").getAttribute("aria-checked")).toBe("true");
    expect(get(element, ".date").getAttribute("aria-checked")).toBe("true");
    expect(get(element, ".name").getAttribute("aria-checked")).toBe("false");
    expect(get(element, ".wrap").getAttribute("role")).toBe("menuitemcheckbox");
  });

  it("stops following DOM changes once removed", async () => {
    const element = mount();
    element.remove();
    const item = addItem(element, "Delete");
    await flush();
    expect(item.hasAttribute("role")).toBe(false);
    expect(uncaught).toEqual([]);
  });

  it("stops reacting to clicks once removed", () => {
    const element = mount();
    const listener = vi.fn();
    element.addEventListener("appret-menu-activate", listener);
    element.remove();

    items(element)[1]!.click();
    expect(listener).not.toHaveBeenCalled();
  });
});
