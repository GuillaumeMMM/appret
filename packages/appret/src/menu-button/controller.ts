import type { MenuCloseEvent, MenuController } from "../menu/controller.js";
import { AttributeRecorder } from "../shared/attributeRecorder.js";
import { copyLists } from "../shared/copyLists.js";
import { triggerCustomEvent } from "../shared/customEvents.js";

export type MenuButtonControllerConfig = {
  button: HTMLElement;
  menu: HTMLElement;
  menuController?: MenuController;
  visibility?: "manual" | "auto";
};

export type MenuButtonChangeDetail = {
  expanded: boolean;
};

export type MenuButtonChangeEvent = CustomEvent<MenuButtonChangeDetail>;

declare global {
  interface HTMLElementEventMap {
    "appret-menu-button-change": MenuButtonChangeEvent;
  }
}

export class MenuButtonController {
  readonly host: HTMLElement;
  #config: MenuButtonControllerConfig;
  #attributeRecorder = new AttributeRecorder();
  #abort!: AbortController;
  #destroyed = false;
  #isExpanded = false;

  constructor(host: HTMLElement, config: MenuButtonControllerConfig) {
    this.host = host;

    this.#config = copyLists(config);

    this.#isExpanded =
      this.#config.button.getAttribute("aria-expanded") === "true";

    this.#setup();
  }

  #setup() {
    this.#abort = new AbortController();

    this.#setAriaAttributes();
    this.#setListeners();

    this.#setMenuVisibility(this.#isExpanded);
  }

  #setAriaAttributes() {
    const { button } = this.#config;

    this.#attributeRecorder.set(button, "aria-haspopup", "menu");

    this.#attributeRecorder.set(
      button,
      "aria-expanded",
      this.#isExpanded.toString(),
    );

    const id = this.#attributeRecorder.ensureId(this.#config.menu);

    this.#attributeRecorder.set(button, "aria-controls", id);

    if (button instanceof HTMLButtonElement && !button.hasAttribute("type")) {
      this.#attributeRecorder.set(button, "type", "button");
    }
  }

  #canButtonOpenMenu(): boolean {
    return !this.#config.button.matches(':disabled, [aria-disabled="true"]');
  }

  #setListeners() {
    const { menuController, menu, button } = this.#config;

    if (menuController) {
      menuController.host.addEventListener(
        "appret-menu-close",
        (e: MenuCloseEvent) => {
          if (e.target !== menuController.host || e.detail.reason === "tab") {
            return;
          }

          queueMicrotask(() => {
            if (!e.defaultPrevented) {
              //  Make sure closing the menu happens after "appret-menu-close" was triggered
              this.#close({ focusButtonAfterClose: true });
            }
          });
        },
        { signal: this.#abort.signal },
      );
    } else {
      menu.addEventListener(
        "keydown",
        (e: KeyboardEvent) => {
          if (e.defaultPrevented) {
            return;
          }

          if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) {
            return;
          }

          if (e.key === "Escape") {
            this.#close({ focusButtonAfterClose: true });

            e.preventDefault();
          }
        },
        { signal: this.#abort.signal },
      );
    }

    document.addEventListener(
      "pointerdown",
      (e: PointerEvent) => {
        if (![menu, button].some((el) => e.composedPath().includes(el))) {
          this.#close({ focusButtonAfterClose: false });
        }
      },
      {
        signal: this.#abort.signal,
      },
    );

    const focusoutButtonOrMenu = (e: FocusEvent) => {
      if (e.relatedTarget === null) {
        return;
      }

      if (
        e.relatedTarget instanceof Node &&
        !(button.contains(e.relatedTarget) || menu.contains(e.relatedTarget))
      ) {
        this.#close({ focusButtonAfterClose: false });
      }
    };

    button.addEventListener("focusout", focusoutButtonOrMenu, {
      signal: this.#abort.signal,
    });

    menu.addEventListener("focusout", focusoutButtonOrMenu, {
      signal: this.#abort.signal,
    });

    button.addEventListener(
      "click",
      (e: MouseEvent) => {
        if (e.defaultPrevented) {
          return;
        }

        if (this.#isExpanded) {
          this.#close({ focusButtonAfterClose: false });
        } else if (this.#canButtonOpenMenu()) {
          this.#open();
          menuController?.focusFirst();
        }
      },
      { signal: this.#abort.signal },
    );

    button.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (e.defaultPrevented) {
          return;
        }

        if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) {
          return;
        }

        if (e.key === "Escape") {
          //  Left to the page when the menu is closed, e.g. to close a dialog
          if (this.#isExpanded) {
            e.preventDefault();
            this.#close({ focusButtonAfterClose: true });
          }
          return;
        }

        if (!this.#isExpanded && !this.#canButtonOpenMenu()) {
          return;
        }

        switch (e.key) {
          case "Enter":
          case " ": {
            e.preventDefault();

            if (this.#isExpanded) {
              this.#close({ focusButtonAfterClose: true });
            } else {
              this.#open();

              menuController?.focusFirst();
            }
            break;
          }
          case "ArrowDown": {
            e.preventDefault();

            this.#open();
            menuController?.focusFirst();
            break;
          }
          case "ArrowUp": {
            e.preventDefault();

            this.#open();
            menuController?.focusLast();
            break;
          }
        }
      },
      { signal: this.#abort.signal },
    );

    menu.addEventListener(
      "toggle",
      (e) => {
        //  When the menu is a popover, keep track of the closed state even after a light dismiss from the browser
        if ((e as ToggleEvent).newState === "closed") {
          this.#close({ focusButtonAfterClose: false });
        }
      },
      {
        signal: this.#abort.signal,
      },
    );
  }

  #close({
    focusButtonAfterClose,
    notify = true,
  }: {
    focusButtonAfterClose: boolean;
    notify?: boolean;
  }) {
    if (!this.#isExpanded) {
      return;
    }

    this.#isExpanded = false;
    this.#attributeRecorder.set(this.#config.button, "aria-expanded", "false");

    if (focusButtonAfterClose) {
      this.#config.button.focus();
    }

    this.#setMenuVisibility(false);

    if (notify) {
      triggerCustomEvent(this.host, "appret-menu-button-change", {
        expanded: false,
      });
    }
  }

  #open({ notify = true } = {}) {
    if (this.#isExpanded) {
      return;
    }

    this.#setMenuVisibility(true);

    this.#isExpanded = true;
    this.#attributeRecorder.set(this.#config.button, "aria-expanded", "true");

    if (notify) {
      triggerCustomEvent(this.host, "appret-menu-button-change", {
        expanded: true,
      });
    }
  }

  #setMenuVisibility(visible: boolean) {
    const { menu, visibility } = this.#config;

    if (visibility === "manual") {
      return;
    }

    if (menu.hasAttribute("popover")) {
      if (visible !== menu.matches(":popover-open")) {
        visible ? menu.showPopover() : menu.hidePopover();
      }
      return;
    }

    if (visible) {
      menu.removeAttribute("hidden");
    } else {
      menu.setAttribute("hidden", "");
    }
  }

  #teardown(): void {
    this.#abort.abort();
    this.#attributeRecorder.restore();
  }

  //  API
  toggleMenu({
    focusButtonAfterClose = false,
  }: { focusButtonAfterClose?: boolean } = {}): void {
    if (this.#destroyed) {
      console.warn("Appret menu button: toggleMenu() called after destroy().");
      return;
    }

    if (this.#isExpanded) {
      this.#close({ focusButtonAfterClose, notify: false });
    } else {
      this.#open({ notify: false });
    }
  }

  update(changes: Partial<MenuButtonControllerConfig>): void {
    if (this.#destroyed) {
      console.warn("Appret menu button: update() called after destroy().");
      return;
    }

    const next = copyLists({ ...this.#config, ...changes });
    this.#teardown();
    this.#config = next;
    this.#setup();
  }

  openMenu(): void {
    if (this.#destroyed) {
      console.warn("Appret menu button: openMenu() called after destroy().");
      return;
    }

    this.#open({ notify: false });
  }

  closeMenu({ focusButtonAfterClose = false } = {}): void {
    if (this.#destroyed) {
      console.warn("Appret menu button: closeMenu() called after destroy().");
      return;
    }

    this.#close({ focusButtonAfterClose, notify: false });
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }

    this.#teardown();
    this.#destroyed = true;
  }
}
