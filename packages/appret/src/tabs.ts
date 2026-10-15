export interface TabsControllerOptions {
  tablist: HTMLElement;
  tabs: HTMLElement[];
  tabpanels: HTMLElement[];
}

export class TabsController {
  readonly host: HTMLElement;
  #options: TabsControllerOptions;

  constructor(host: HTMLElement, options: TabsControllerOptions) {
    this.host = host;
    this.#options = options;

    console.log("construct tabs 6");
  }

  destroy(): void {}
}
