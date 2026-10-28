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

//  Returns the attribute when it's one of the allowed values, and warns otherwise
export function enumAttribute<T extends string>(
  element: Element,
  name: string,
  allowed: T[],
  prefix: string,
): T | undefined {
  const value = element.getAttribute(name);

  if (value === null) {
    return undefined;
  }

  if (allowed.includes(value as T)) {
    return value as T;
  }

  console.warn(
    `${prefix}: invalid ${name}="${value}". Expected ${allowed.map((v) => `"${v}"`).join(" or ")}.`,
  );

  return undefined;
}

//  The closest ancestor registered with the given class or one of its subclasses,
//  whatever its tag name
export function closestElementOfType(
  node: Element,
  type: CustomElementConstructor,
): Element | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const registered = customElements.get(el.localName);
    if (
      registered &&
      (registered === type || registered.prototype instanceof type)
    ) {
      return el;
    }
  }
  return null;
}
