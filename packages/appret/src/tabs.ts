export interface TabsControllerOptions {
  tablist: HTMLElement;
  tabs: HTMLElement[];
  panels: HTMLElement[];
}

export class TabsController {
  readonly host: HTMLElement;
  #options: TabsControllerOptions;

  constructor(host: HTMLElement, options: TabsControllerOptions) {
    this.host = host;
    this.#options = options;

    console.log("construct tabs 4");
  }

  destroy(): void {}
}
