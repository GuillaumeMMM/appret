import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../define/listbox.js";
import { defineElement } from "../shared/element.js";
import { ListboxElement } from "./element.js";

// Covers what the element adds on top of ListboxController: finding parts,
// groups, attributes, lifecycle, forwarding the API, and following DOM changes.
// Roles, keyboard and selection rules are covered in controller.test.ts.

const flush = () => new Promise((resolve) => setTimeout(resolve));

function markup(names = ["Apple", "Banana", "Cherry"], attributes = 'label="Fruit"') {
  return `
    <appret-listbox ${attributes}>
      <ul data-appret-part="listbox.list">
        ${names.map((n) => `<li data-appret-part="listbox.option">${n}</li>`).join("")}
      </ul>
    </appret-listbox>`;
}

function groupsMarkup(attributes = 'label="Meal"') {
  return `
    <appret-listbox ${attributes}>
      <div data-appret-part="listbox.list">
        <ul data-appret-part="listbox.group">
          <li data-appret-part="listbox.group-label">Starters</li>
          <li data-appret-part="listbox.option">Soup</li>
          <li data-appret-part="listbox.option">Salad</li>
        </ul>
        <ul data-appret-part="listbox.group">
          <li data-appret-part="listbox.group-label">Desserts</li>
          <li data-appret-part="listbox.option">Cake</li>
        </ul>
      </div>
    </appret-listbox>`;
}

function mount(html = markup()) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const element = template.content.firstElementChild as ListboxElement;
  document.body.append(element);
  return element;
}

function parts(element: Element) {
  const own = (name: string) =>
    [...element.querySelectorAll<HTMLElement>(`[data-appret-part~="listbox.${name}"]`)].filter(
      (el) => el.closest(element.localName) === element,
    );
  return {
    list: own("list")[0]!,
    options: own("option"),
    groups: own("group"),
    labels: own("group-label"),
  };
}

function addOption(element: Element, name: string, container?: Element) {
  const option = document.createElement("li");
  option.dataset.appretPart = "listbox.option";
  option.textContent = name;
  (container ?? parts(element).list).append(option);
  return option;
}

function press(key: string, init: KeyboardEventInit = {}) {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );
}

const selected = (options: HTMLElement[]) =>
  options.flatMap((o, i) => (o.getAttribute("aria-selected") === "true" ? [i] : []));

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
  it("registers <appret-listbox> from appret/define/listbox", () => {
    expect(customElements.get("appret-listbox")).toBe(ListboxElement);
  });

  it("doesn't throw when the same name is defined twice", () => {
    expect(() =>
      defineElement("appret-listbox", class extends ListboxElement {}),
    ).not.toThrow();
    expect(customElements.get("appret-listbox")).toBe(ListboxElement);
  });

  it("works under a custom tag name", () => {
    defineElement("acme-listbox", class extends ListboxElement {});
    const element = mount(markup().replaceAll("appret-listbox", "acme-listbox"));
    expect(parts(element).list.getAttribute("role")).toBe("listbox");
  });
});

describe("setup", () => {
  it("finds its parts and sets up the controller when connected", () => {
    const element = mount();
    const { list, options } = parts(element);
    expect(list.getAttribute("role")).toBe("listbox");
    expect(list.getAttribute("aria-label")).toBe("Fruit");
    expect(options.map((o) => o.getAttribute("role"))).toEqual(["option", "option", "option"]);
    expect(options.map((o) => o.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("accepts parts with several tokens in data-appret-part", () => {
    const element = mount(
      markup().replaceAll(
        'data-appret-part="listbox.option"',
        'data-appret-part="listbox.option other.part"',
      ),
    );
    expect(parts(element).options[0]!.getAttribute("role")).toBe("option");
  });

  it("does nothing until it's connected", () => {
    const template = document.createElement("template");
    template.innerHTML = markup().trim();
    const element = template.content.firstElementChild as ListboxElement;
    expect(parts(element).list.hasAttribute("role")).toBe(false);
  });

  it("waits for DOMContentLoaded while the document is loading", () => {
    Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" });
    try {
      const element = mount();
      expect(parts(element).list.hasAttribute("role")).toBe(false);

      Object.defineProperty(document, "readyState", { configurable: true, get: () => "interactive" });
      document.dispatchEvent(new Event("DOMContentLoaded"));
      expect(parts(element).list.getAttribute("role")).toBe("listbox");
    } finally {
      delete (document as unknown as Record<string, unknown>).readyState;
    }
  });

  it("sets up once its children are added after it's connected", async () => {
    const element = document.createElement("appret-listbox");
    element.setAttribute("label", "Fruit");
    document.body.append(element);
    element.innerHTML = markup().replace(/^\s*<appret-listbox[^>]*>|<\/appret-listbox>\s*$/g, "");
    await flush();

    expect(parts(element).list.getAttribute("role")).toBe("listbox");
    expect(uncaught).toEqual([]);
  });

  it("sets up with no options, and manages the options added later", async () => {
    const element = mount(markup([]));
    expect(parts(element).list.getAttribute("role")).toBe("listbox");
    expect(parts(element).list.getAttribute("tabindex")).toBe("0");

    const option = addOption(element, "Apple");
    await flush();
    expect(option.getAttribute("role")).toBe("option");
    expect(parts(element).list.hasAttribute("tabindex")).toBe(false);
  });

  it("follows a list that's emptied", async () => {
    const element = mount();
    const { options } = parts(element);
    for (const option of options) option.remove();
    await flush();
    expect(parts(element).list.getAttribute("tabindex")).toBe("0");
    expect(options[0]!.hasAttribute("role")).toBe(false);
  });

  it("only manages its own parts when listboxes are nested", () => {
    const element = mount(
      markup(["Outer"]).replace(
        "</ul>",
        `<li>${markup(["Inner one", "Inner two"], 'label="Inner"')}</li></ul>`,
      ),
    );
    const inner = element.querySelector("appret-listbox") as ListboxElement;

    expect(parts(element).options.map((o) => o.textContent)).toEqual(["Outer"]);
    expect(parts(inner).options.map((o) => o.getAttribute("role"))).toEqual(["option", "option"]);
    expect(parts(inner).list.getAttribute("aria-label")).toBe("Inner");
  });
});

describe("groups", () => {
  it("gives each group the group role and labels it with its group-label", () => {
    const element = mount(groupsMarkup());
    const { groups, labels } = parts(element);
    expect(groups.map((g) => g.getAttribute("role"))).toEqual(["group", "group"]);
    expect(groups[0]!.ariaLabelledByElements).toEqual([labels[0]]);
    expect(labels.map((l) => l.getAttribute("role"))).toEqual(["presentation", "presentation"]);
  });

  it("moves through the options of every group", () => {
    const element = mount(groupsMarkup());
    const { options } = parts(element);
    options[1]!.focus();
    press("ArrowDown");
    expect(document.activeElement).toBe(options[2]);
  });

  it("works without a group label", () => {
    const element = mount(groupsMarkup().replace(/<li data-appret-part="listbox.group-label">[^<]*<\/li>/g, ""));
    expect(parts(element).groups[0]!.getAttribute("role")).toBe("group");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("the group is missing an accessible label"),
      parts(element).groups[0],
    );
  });

  it("manages an option added to a group later", async () => {
    const element = mount(groupsMarkup());
    const option = addOption(element, "Sorbet", parts(element).groups[1]);
    await flush();
    expect(option.getAttribute("role")).toBe("option");
  });

  it("follows a group label that changes", async () => {
    const element = mount(groupsMarkup());
    const { groups, labels } = parts(element);
    const heading = document.createElement("li");
    heading.dataset.appretPart = "listbox.group-label";
    heading.textContent = "Soups";
    labels[0]!.replaceWith(heading);
    await flush();
    expect(groups[0]!.ariaLabelledByElements).toEqual([heading]);
    expect(heading.getAttribute("role")).toBe("presentation");
  });
});

describe("attributes", () => {
  it("passes labelledby to the controller", () => {
    document.body.insertAdjacentHTML("beforeend", '<p id="heading">Fruit</p>');
    const element = mount(markup(undefined, 'labelledby="heading"'));
    expect(parts(element).list.getAttribute("aria-labelledby")).toBe("heading");
  });

  it("prefers label over labelledby", () => {
    document.body.insertAdjacentHTML("beforeend", '<p id="heading">Fruit</p>');
    const element = mount(markup(undefined, 'label="Fruit" labelledby="heading"'));
    const { list } = parts(element);
    expect(list.getAttribute("aria-label")).toBe("Fruit");
    expect(list.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("passes orientation to the controller", () => {
    const element = mount(markup(undefined, 'label="Fruit" orientation="horizontal"'));
    const { list, options } = parts(element);
    expect(list.getAttribute("aria-orientation")).toBe("horizontal");
    options[0]!.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(options[1]);
  });

  it("ignores an invalid orientation with a warning", () => {
    const element = mount(markup(undefined, 'label="Fruit" orientation="diagonal"'));
    expect(parts(element).list.hasAttribute("aria-orientation")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid orientation="diagonal"'));
  });

  it("turns on selection-follows-focus with the attribute alone", () => {
    const element = mount(markup(undefined, 'label="Fruit" selection-follows-focus'));
    const { options } = parts(element);
    options[0]!.focus();
    press("ArrowDown");
    expect(element.selectedOption).toBe(options[1]);
  });

  it("doesn't follow focus by default", () => {
    const element = mount();
    const { options } = parts(element);
    options[0]!.focus();
    press("ArrowDown");
    expect(element.selectedOption).toBeNull();
  });

  it("turns on multiple selection with the attribute alone, like <select multiple>", () => {
    const element = mount(markup(undefined, 'label="Fruit" multiple'));
    const { list, options } = parts(element);
    expect(list.getAttribute("aria-multiselectable")).toBe("true");
    options[0]!.click();
    options[2]!.click();
    expect(element.selectedOptions).toEqual([options[0], options[2]]);
  });

  it("applies attribute changes after setup", () => {
    const element = mount();
    const { list } = parts(element);
    element.setAttribute("label", "Fruits");
    expect(list.getAttribute("aria-label")).toBe("Fruits");
    element.setAttribute("multiple", "");
    expect(list.getAttribute("aria-multiselectable")).toBe("true");
    element.removeAttribute("multiple");
    expect(list.getAttribute("aria-multiselectable")).toBe("false");
  });

  it("keeps the selection when an attribute changes", () => {
    const element = mount();
    const { options } = parts(element);
    element.select(options[2]!);
    element.setAttribute("orientation", "horizontal");
    expect(element.selectedOption).toBe(options[2]);
  });

  it("keeps the selection when switching to multiple selection", () => {
    const element = mount();
    const { options } = parts(element);
    element.select(options[1]!);
    element.setAttribute("multiple", "");
    expect(element.selectedOptions).toEqual([options[1]]);
  });
});

describe("API", () => {
  it("forwards select(), selectedOption and selectedOptions", () => {
    const element = mount();
    const { options } = parts(element);
    element.select(options[1]!);
    expect(element.selectedOption).toBe(options[1]);
    expect(element.selectedOptions).toEqual([options[1]]);
    expect(selected(options)).toEqual([1]);

    element.select(null);
    expect(element.selectedOption).toBeNull();
    expect(element.selectedOptions).toEqual([]);
  });

  it("selects several options with multiple", () => {
    const element = mount(markup(undefined, 'label="Fruit" multiple'));
    const { options } = parts(element);
    element.select([options[2]!, options[0]!]);
    expect(element.selectedOptions).toEqual([options[0], options[2]]);
  });

  it("reports nothing selected before setup", () => {
    const element = document.createElement("appret-listbox");
    expect(element.selectedOption).toBeNull();
    expect(element.selectedOptions).toEqual([]);
  });

  it("applies a selection made before setup", () => {
    // Elements parsed in a detached <div> are upgraded; inside a <template> they wouldn't be.
    const container = document.createElement("div");
    container.innerHTML = markup().trim();
    const element = container.firstElementChild as ListboxElement;
    const option = parts(element).options[2]!;

    element.select(option);
    document.body.append(element);
    expect(element.selectedOption).toBe(option);
  });

  it("focus() moves focus to the option reachable with Tab", () => {
    const element = mount();
    const { options } = parts(element);
    element.select(options[2]!);
    element.focus();
    expect(document.activeElement).toBe(options[2]);
  });

  it("fires appret-listbox-change on the element itself", () => {
    const element = mount();
    const listener = vi.fn();
    element.addEventListener("appret-listbox-change", listener);
    const option = parts(element).options[1]!;
    option.click();
    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0]![0] as CustomEvent;
    expect(event.target).toBe(element);
    expect(event.detail).toEqual({ option, options: [option] });
  });

  it("is typed by tag name", () => {
    mount();
    // Type-level check: querySelector returns ListboxElement, so select() exists.
    const element = document.querySelector("appret-listbox")!;
    element.select(parts(element).options[1]!);
    expect(element.selectedOption).toBe(parts(element).options[1]);
  });
});

describe("following DOM changes", () => {
  it("manages an option added later", async () => {
    const element = mount();
    const option = addOption(element, "Date");
    await flush();
    expect(option.getAttribute("role")).toBe("option");
    expect(option.getAttribute("tabindex")).toBe("-1");
  });

  it("drops the selection when the selected option is removed", async () => {
    const element = mount();
    const { options } = parts(element);
    element.select(options[1]!);
    options[1]!.remove();
    await flush();
    expect(element.selectedOption).toBeNull();
  });

  it("turns an element into a part when data-appret-part is added", async () => {
    const element = mount();
    const option = document.createElement("li");
    parts(element).list.append(option);
    await flush();
    expect(option.hasAttribute("role")).toBe(false);

    option.dataset.appretPart = "listbox.option";
    await flush();
    expect(option.getAttribute("role")).toBe("option");
  });

  it("switches to groups when groups are added", async () => {
    const element = mount();
    const { list, options } = parts(element);
    const group = document.createElement("ul");
    group.dataset.appretPart = "listbox.group";
    group.append(...options);
    list.append(group);
    await flush();
    expect(group.getAttribute("role")).toBe("group");
    expect(options[0]!.getAttribute("role")).toBe("option");
  });

  it("doesn't rebuild for changes that don't affect the parts", async () => {
    const element = mount();
    const { options } = parts(element);
    options[0]!.focus();
    press("ArrowDown"); // the tab stop is on the second option now

    options[1]!.append(document.createElement("span"));
    await flush();
    expect(options[1]!.getAttribute("tabindex")).toBe("0");
  });

  it("keeps working while it's emptied, and sets up again when refilled", async () => {
    const element = mount();
    for (const option of parts(element).options) option.remove();
    await flush();
    expect(uncaught).toEqual([]);

    const option = addOption(element, "Kiwi");
    await flush();
    expect(option.getAttribute("role")).toBe("option");
  });

  it("recovers when the list is removed and added back", async () => {
    const element = mount();
    const { list } = parts(element);
    list.remove();
    await flush();
    expect(uncaught).toEqual([]);

    element.prepend(list);
    await flush();
    expect(list.getAttribute("role")).toBe("listbox");
  });
});

describe("focus recovery", () => {
  it("moves focus back into the listbox when the focused option is removed", async () => {
    const element = mount();
    const { options } = parts(element);
    options[0]!.focus();
    press("End");
    options[2]!.remove();
    await flush();
    expect(document.activeElement).toBe(options[0]);
  });

  it("doesn't steal focus from elsewhere on the page", async () => {
    const element = mount();
    const outside = document.createElement("input");
    document.body.append(outside);
    const { options } = parts(element);
    options[1]!.focus();
    outside.focus();

    options[1]!.remove();
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

  it("restores groups when removed", () => {
    const element = mount(groupsMarkup());
    element.remove();
    for (const el of element.querySelectorAll("*")) {
      expect(el.hasAttribute("role")).toBe(false);
    }
  });

  it("keeps the selection when moved", () => {
    const element = mount(markup(undefined, 'label="Fruit" multiple'));
    const { options } = parts(element);
    element.select([options[0]!, options[2]!]);
    const other = document.createElement("div");
    document.body.append(other);

    other.append(element); // disconnect, then connect
    expect(element.selectedOptions).toEqual([options[0], options[2]]);
  });

  it("keeps a single selection when moved", () => {
    const element = mount();
    const { options } = parts(element);
    element.select(options[1]!);
    const other = document.createElement("div");
    document.body.append(other);

    other.append(element);
    expect(element.selectedOption).toBe(options[1]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("stops following DOM changes once removed", async () => {
    const element = mount();
    element.remove();
    const option = addOption(element, "Date");
    await flush();
    expect(option.hasAttribute("role")).toBe(false);
    expect(uncaught).toEqual([]);
  });

  it("stops reacting to clicks once removed", () => {
    const element = mount();
    const listener = vi.fn();
    element.addEventListener("appret-listbox-change", listener);
    element.remove();

    parts(element).options[1]!.click();
    expect(listener).not.toHaveBeenCalled();
  });
});
