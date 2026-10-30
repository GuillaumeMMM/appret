import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenuController } from "../menu/controller.js";
import {
  MenuButtonController,
  type MenuButtonControllerConfig,
} from "./controller.js";

type Setup = {
  withMenuController?: boolean;
  config?: Partial<MenuButtonControllerConfig>;
  markup?: (parts: { button: HTMLElement; menu: HTMLElement }) => void;
};

let controllers: { destroy(): void }[] = [];
let warn: ReturnType<typeof vi.spyOn>;

function setup({
  withMenuController = true,
  config = {},
  markup,
}: Setup = {}) {
  const host = document.createElement("div");
  host.innerHTML = `
    <button class="button">Edit</button>
    <div class="menu">
      <div class="copy">Copy</div>
      <div class="cut">Cut</div>
      <div class="paste">Paste</div>
    </div>
    <button class="outside">Outside</button>`;
  document.body.append(host);

  const get = (selector: string) => host.querySelector<HTMLElement>(selector)!;
  const button = get(".button");
  const menu = get(".menu");
  const items = [get(".copy"), get(".cut"), get(".paste")] as const;
  markup?.({ button, menu });

  const menuController = withMenuController
    ? new MenuController(host, { menu, items: [...items], label: "Edit" })
    : undefined;
  if (menuController) controllers.push(menuController);

  const controller = new MenuButtonController(host, {
    button,
    menu,
    menuController,
    ...config,
  });
  controllers.push(controller);

  const changes: boolean[] = [];
  host.addEventListener("appret-menu-button-change", (e) =>
    changes.push(e.detail.expanded),
  );

  return {
    host,
    button,
    menu,
    items,
    outside: get(".outside"),
    menuController,
    controller,
    changes,
  };
}

function press(
  key: string,
  target = document.activeElement!,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function pointerdown(target: Element) {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, composed: true }),
  );
}

//  The menu button closes on "appret-menu-close" in a microtask
const flush = () => Promise.resolve();

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

describe("setup", () => {
  it("sets aria-haspopup, aria-expanded and aria-controls on the button", () => {
    const { button, menu } = setup();
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe(menu.id);
  });

  it("generates an id for the menu when it has none", () => {
    const { menu } = setup();
    expect(menu.id).not.toBe("");
  });

  it("keeps the menu's own id", () => {
    const { button } = setup({ markup: ({ menu }) => (menu.id = "edit-menu") });
    expect(button.getAttribute("aria-controls")).toBe("edit-menu");
  });

  it("hides the menu when it starts closed", () => {
    const { menu } = setup();
    expect(menu.hidden).toBe(true);
  });

  it("starts open when the button has aria-expanded=true", () => {
    const { button, menu } = setup({
      markup: ({ button, menu }) => {
        button.setAttribute("aria-expanded", "true");
        menu.hidden = true;
      },
    });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(menu.hidden).toBe(false);
  });

  it("doesn't move focus", () => {
    setup();
    expect(document.activeElement).toBe(document.body);
  });

  it("gives a <button> without a type the button type, so it doesn't submit its form", () => {
    const { button, controller } = setup();
    const form = document.createElement("form");
    const submit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener("submit", submit);
    document.body.append(form);
    form.append(button);

    expect(button.getAttribute("type")).toBe("button");
    button.click();
    expect(submit).not.toHaveBeenCalled();

    controller.destroy();
    expect(button.hasAttribute("type")).toBe(false);
  });

  it("keeps the button's own type", () => {
    const { button } = setup({
      markup: ({ button }) => button.setAttribute("type", "submit"),
    });
    expect(button.getAttribute("type")).toBe("submit");
  });

  it("doesn't set a type on other elements", () => {
    const button = document.createElement("div");
    const menu = document.createElement("div");
    document.body.append(button, menu);
    controllers.push(new MenuButtonController(document.body, { button, menu }));
    expect(button.hasAttribute("type")).toBe(false);
  });
});

describe("disabled button", () => {
  function setupDisabled() {
    return setup({
      markup: ({ button }) => button.setAttribute("aria-disabled", "true"),
    });
  }

  it("doesn't open on click", () => {
    const { button, menu, changes } = setupDisabled();
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(menu.hidden).toBe(true);
    expect(changes).toEqual([]);
  });

  it.each(["Enter", " ", "ArrowDown", "ArrowUp"])(
    "doesn't open with %j, and leaves the key to the page",
    (key) => {
      const { button } = setupDisabled();
      button.focus();
      const event = press(key);
      expect(event.defaultPrevented).toBe(false);
      expect(button.getAttribute("aria-expanded")).toBe("false");
    },
  );

  it("can still close a menu that's open", () => {
    const { button, controller } = setupDisabled();
    controller.openMenu();
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("can still be opened with openMenu()", () => {
    const { button, controller } = setupDisabled();
    controller.openMenu();
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("opening with the button", () => {
  it("opens on click, focuses the first item and fires a change", () => {
    const { button, menu, items, changes } = setup();
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(menu.hidden).toBe(false);
    expect(document.activeElement).toBe(items[0]);
    expect(changes).toEqual([true]);
  });

  it("closes on a second click, without moving focus", () => {
    const { button, menu, outside, changes } = setup({
      withMenuController: false,
    });
    button.click();
    outside.focus();
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(outside);
    expect(changes).toEqual([true, false]);
  });

  it("ignores clicks already handled", () => {
    const { button, changes } = setup();
    button.addEventListener("click", (e) => e.preventDefault(), {
      capture: true,
    });
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(changes).toEqual([]);
  });

  it.each(["Enter", " ", "ArrowDown"])(
    "%j opens and focuses the first item",
    (key) => {
      const { button, items, changes } = setup();
      button.focus();
      const event = press(key);
      expect(event.defaultPrevented).toBe(true);
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(document.activeElement).toBe(items[0]);
      expect(changes).toEqual([true]);
    },
  );

  it("Up Arrow opens and focuses the last item", () => {
    const { button, items } = setup();
    button.focus();
    press("ArrowUp");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(items[2]);
  });

  it("the arrows keep an open menu open", () => {
    const { button, items, changes } = setup();
    button.click();
    button.focus();
    press("ArrowUp");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(items[2]);
    press("ArrowDown", button);
    expect(document.activeElement).toBe(items[0]);
    expect(changes).toEqual([true]);
  });

  it("Enter and Space close an open menu and keep focus on the button", () => {
    const { button, menu, changes } = setup({ withMenuController: false });
    button.focus();
    press("Enter");
    press(" ");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(changes).toEqual([true, false]);
  });

  it("ignores keys with Ctrl, Meta or Alt", () => {
    const { button } = setup();
    button.focus();
    press("ArrowDown", button, { ctrlKey: true });
    press("ArrowDown", button, { metaKey: true });
    press("Enter", button, { altKey: true });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("ignores keys already handled", () => {
    const { button } = setup();
    button.addEventListener("keydown", (e) => e.preventDefault(), {
      capture: true,
    });
    button.focus();
    press("ArrowDown");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("leaves other keys to the page", () => {
    const { button } = setup();
    button.focus();
    const event = press("a");
    expect(event.defaultPrevented).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("Escape on the button closes an open menu and marks the key as handled", () => {
    const { button, menu, changes } = setup({ withMenuController: false });
    button.focus();
    press("Enter");
    const event = press("Escape");
    expect(event.defaultPrevented).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(changes).toEqual([true, false]);
  });

  it("leaves Escape on the button to the page when the menu is closed", () => {
    const { button } = setup();
    button.focus();
    const event = press("Escape");
    expect(event.defaultPrevented).toBe(false);
  });

  it("doesn't move focus without a menu controller", () => {
    const { button } = setup({ withMenuController: false });
    button.focus();
    press("ArrowDown");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(button);
  });
});

describe("closing with a menu controller", () => {
  it("closes on Escape and returns focus to the button", async () => {
    const { button, menu, changes } = setup();
    button.click();
    press("Escape");
    await flush();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(changes).toEqual([true, false]);
  });

  it("closes when an item is activated and returns focus to the button", async () => {
    const { button, items } = setup();
    button.click();
    items[1].click();
    await flush();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("stays open when the close is cancelled, even by a listener higher up", async () => {
    const { button, items } = setup();
    const cancel = (e: Event) => e.preventDefault();
    document.addEventListener("appret-menu-close", cancel);
    button.click();
    press("Escape");
    await flush();
    document.removeEventListener("appret-menu-close", cancel);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(items[0]);
  });

  it("leaves Tab to the focusout, so focus isn't pulled back to the button", async () => {
    const { button, items, outside } = setup();
    button.click();
    press("Tab");
    await flush();
    expect(button.getAttribute("aria-expanded")).toBe("true");

    //  The browser then moves focus out of the menu
    outside.focus();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(outside);
    expect(items[0].isConnected).toBe(true);
  });

  it("ignores close requests from another menu inside the host", async () => {
    const { host, button } = setup();
    const nested = document.createElement("div");
    host.append(nested);
    button.click();
    nested.dispatchEvent(
      new CustomEvent("appret-menu-close", {
        bubbles: true,
        cancelable: true,
        detail: { reason: "escape" },
      }),
    );
    await flush();
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("closing without a menu controller", () => {
  it("closes on Escape in the menu, returns focus and marks the key as handled", () => {
    const { button, items, changes } = setup({ withMenuController: false });
    items.forEach((item) => (item.tabIndex = -1));
    button.click();
    items[0].focus();
    const event = press("Escape");
    expect(event.defaultPrevented).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
    expect(changes).toEqual([true, false]);
  });

  it("ignores an Escape already handled", () => {
    const { button, menu } = setup({ withMenuController: false });
    button.click();
    menu.addEventListener("keydown", (e) => e.preventDefault(), {
      capture: true,
    });
    press("Escape", menu);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("only closes the innermost menu on Escape", () => {
    const { button, menu } = setup({ withMenuController: false });
    const subButton = document.createElement("div");
    const submenu = document.createElement("div");
    const subItem = document.createElement("div");
    subItem.tabIndex = -1;
    submenu.append(subItem);
    menu.append(subButton, submenu);
    controllers.push(
      new MenuButtonController(menu, { button: subButton, menu: submenu }),
    );

    button.click();
    subButton.click();
    subItem.focus();
    press("Escape");
    expect(subButton.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-expanded")).toBe("true");

    press("Escape", menu);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("closing from outside", () => {
  it("closes on a pointerdown outside, without moving focus", () => {
    const { button, outside, changes } = setup();
    button.click();
    pointerdown(outside);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).not.toBe(button);
    expect(changes).toEqual([true, false]);
  });

  it("stays open on a pointerdown in the menu or on the button", () => {
    const { button, items } = setup();
    button.click();
    pointerdown(items[1]);
    pointerdown(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes when focus moves outside, without moving focus back", () => {
    const { button, outside } = setup();
    button.click();
    outside.focus();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(outside);
  });

  it("stays open when focus moves between items or to the button", () => {
    const { button, items } = setup();
    button.click();
    press("ArrowDown");
    expect(document.activeElement).toBe(items[1]);
    button.focus();
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("stays open when focus leaves the page", () => {
    const { button, items } = setup();
    button.click();
    items[0].blur();
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("fires no change when it's already closed", () => {
    const { outside, changes } = setup();
    pointerdown(outside);
    outside.focus();
    expect(changes).toEqual([]);
  });
});

describe("visibility", () => {
  it("leaves the menu alone with visibility: manual", () => {
    const { button, menu, changes } = setup({
      config: { visibility: "manual" },
    });
    expect(menu.hidden).toBe(false);
    button.click();
    expect(menu.hidden).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(changes).toEqual([true]);
  });

  describe("popover", () => {
    //  jsdom doesn't support popovers
    function stubPopover(menu: HTMLElement) {
      let open = false;
      const matches = menu.matches.bind(menu);
      menu.matches = ((selector: string) =>
        selector === ":popover-open"
          ? open
          : matches(selector)) as typeof menu.matches;
      menu.showPopover = vi.fn(() => {
        open = true;
      });
      menu.hidePopover = vi.fn(() => {
        open = false;
      });
      return {
        //  What the browser does on a light dismiss
        lightDismiss() {
          open = false;
          menu.dispatchEvent(
            Object.assign(new Event("toggle"), { newState: "closed" }),
          );
        },
      };
    }

    function setupPopover() {
      let stub!: ReturnType<typeof stubPopover>;
      const parts = setup({
        withMenuController: false,
        markup: ({ menu }) => {
          menu.setAttribute("popover", "manual");
          stub = stubPopover(menu);
        },
      });
      return { ...parts, ...stub };
    }

    it("shows and hides the menu as a popover instead of with hidden", () => {
      const { button, menu } = setupPopover();
      expect(menu.hidden).toBe(false);
      button.click();
      expect(menu.showPopover).toHaveBeenCalledTimes(1);
      button.click();
      expect(menu.hidePopover).toHaveBeenCalledTimes(1);
      expect(menu.hidden).toBe(false);
    });

    it("doesn't hide a popover that's already closed", () => {
      const { menu } = setupPopover();
      expect(menu.hidePopover).not.toHaveBeenCalled();
    });

    it("follows a light dismiss from the browser", () => {
      const { button, changes, lightDismiss } = setupPopover();
      button.click();
      lightDismiss();
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(changes).toEqual([true, false]);
    });
  });
});

describe("API", () => {
  it("openMenu() and closeMenu() change the state without firing a change", () => {
    const { controller, button, menu, changes } = setup();
    controller.openMenu();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(menu.hidden).toBe(false);
    controller.closeMenu();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(menu.hidden).toBe(true);
    expect(changes).toEqual([]);
  });

  it("openMenu() doesn't move focus", () => {
    const { controller } = setup();
    controller.openMenu();
    expect(document.activeElement).toBe(document.body);
  });

  it("closeMenu() moves focus to the button only when asked", () => {
    const { controller, button, items } = setup();
    button.click();
    controller.closeMenu();
    expect(document.activeElement).not.toBe(button);

    controller.openMenu();
    items[0].focus();
    controller.closeMenu({ focusButtonAfterClose: true });
    expect(document.activeElement).toBe(button);
  });

  it("toggleMenu() opens and closes without firing a change", () => {
    const { controller, button, changes } = setup();
    controller.toggleMenu();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    controller.toggleMenu({ focusButtonAfterClose: true });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
    expect(changes).toEqual([]);
  });

  it("warns and does nothing after destroy()", () => {
    const { controller, button } = setup();
    controller.destroy();
    controller.openMenu();
    controller.toggleMenu();
    controller.closeMenu();
    controller.update({});
    expect(button.hasAttribute("aria-expanded")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(4);
  });
});

describe("update()", () => {
  it("keeps the menu open", () => {
    const { controller, button, menu } = setup();
    button.click();
    controller.update({});
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(menu.hidden).toBe(false);
  });

  it("doesn't add listeners twice", () => {
    const { controller, button, changes } = setup({
      withMenuController: false,
    });
    controller.update({});
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(changes).toEqual([true]);
  });

  it("switches to a new menu", () => {
    const { host, controller, button, menu } = setup({
      withMenuController: false,
    });
    const next = document.createElement("div");
    next.id = "next-menu";
    host.append(next);
    controller.update({ menu: next });
    expect(button.getAttribute("aria-controls")).toBe("next-menu");
    expect(next.hidden).toBe(true);
    expect(menu.hasAttribute("id")).toBe(false);
  });
});

describe("destroy()", () => {
  it("restores the button's attributes and the menu's id", () => {
    const { controller, button, menu } = setup({
      markup: ({ button }) => button.setAttribute("aria-expanded", "false"),
    });
    controller.destroy();
    expect(button.hasAttribute("aria-haspopup")).toBe(false);
    expect(button.hasAttribute("aria-controls")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(menu.hasAttribute("id")).toBe(false);
  });

  it("leaves the menu shown or hidden as it is", () => {
    const { controller, button, menu } = setup();
    button.click();
    controller.destroy();
    expect(menu.hidden).toBe(false);
  });

  it("removes listeners", () => {
    const { controller, button, outside, changes } = setup();
    controller.destroy();
    button.click();
    pointerdown(outside);
    expect(button.hasAttribute("aria-expanded")).toBe(false);
    expect(changes).toEqual([]);
  });

  it("can be called twice", () => {
    const { controller } = setup();
    controller.destroy();
    expect(() => controller.destroy()).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });
});
