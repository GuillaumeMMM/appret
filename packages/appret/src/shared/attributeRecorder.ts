type AttributeName =
  | "role"
  | "id"
  | "tabindex"
  | "hidden"
  | `aria-${string}`
  | "type";

const reflectedAttribute = {
  ariaLabelledByElements: "aria-labelledby",
  ariaDescribedByElements: "aria-describedby",
  ariaControlsElements: "aria-controls",
} as const;

type ReflectedProperty = keyof typeof reflectedAttribute;

const generatedIdPrefix = `appret-${Math.random().toString(36).slice(2, 7)}`;
let counter = 0;
export const generateId = () => `${generatedIdPrefix}-${++counter}`;

export class AttributeRecorder {
  #original = new Map<Element, Map<AttributeName, string | null>>();

  #remember(el: Element, name: AttributeName): void {
    let attribute = this.#original.get(el);
    if (!attribute) this.#original.set(el, (attribute = new Map()));
    if (!attribute.has(name)) attribute.set(name, el.getAttribute(name));
  }

  set(el: Element, name: AttributeName, value: string): void {
    this.#remember(el, name);
    el.setAttribute(name, value);
  }

  setElements(
    el: Element,
    property: ReflectedProperty,
    elements: Element[],
  ): void {
    this.#remember(el, reflectedAttribute[property]);
    el[property] = elements;
  }

  remove(el: Element, name: AttributeName): void {
    this.#remember(el, name);
    el.removeAttribute(name);
  }

  //  Returns the element's id, and create a new one if it doesnt have one yet
  ensureId(el: Element): string {
    if (!el.id) this.set(el, "id", generateId());
    return el.id;
  }

  restore(): void {
    for (const [el, attrs] of this.#original) {
      for (const [name, value] of attrs) {
        if (value === null) {
          el.removeAttribute(name);
        } else {
          el.setAttribute(name, value);
        }
      }
    }
    this.#original.clear();
  }
}
