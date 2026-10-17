// When SSR HTMLElement doesn't exist
export const HTMLElementBase = (globalThis.HTMLElement ??
  class {}) as typeof HTMLElement;

export function defineElement(
  name: string,
  element: CustomElementConstructor,
): void {
  if (typeof customElements === "undefined") return; //  On the server
  if (customElements.get(name)) return;
  customElements.define(name, element);
}
