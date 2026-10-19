import type { AttributeRecorder } from "./attributeRecorder.js";
import { isTreeRoot } from "./tree.js";

export type Label =
  | string
  | { byId: string; byElements?: never }
  | { byElements: Element[]; byId?: never };

type LabelContext = {
  recorder: AttributeRecorder;
  prefix: string;
  name: string;
};

//  Labels the element, and returns the label elements if they exist
export function setLabel(
  element: HTMLElement,
  label: Label | undefined,
  { recorder, prefix, name }: LabelContext,
): Element[] {
  if (typeof label === "string" && label) {
    recorder.set(element, "aria-label", label);
    return [];
  }

  if (typeof label === "object" && label.byId?.trim()) {
    recorder.set(element, "aria-labelledby", label.byId);

    const root = element.getRootNode();
    if (!isTreeRoot(root)) {
      return [];
    }

    const ids = label.byId.trim().split(/\s+/);
    const unreachableIds = ids.filter((id) => !root.getElementById(id));
    if (unreachableIds.length > 0) {
      console.warn(
        `${prefix}: ID missing in the ${name}'s document or shadow root:`,
        unreachableIds,
      );
    }

    return ids.map((id) => root.getElementById(id)).filter((el) => el !== null);
  }

  if (typeof label === "object" && label.byElements?.length) {
    recorder.setElements(element, "ariaLabelledByElements", label.byElements);

    //  The browser drops label elements inside another shadow root
    const successfullyAddedLabelledByEls = element.ariaLabelledByElements ?? [];
    const dropped = label.byElements.filter(
      (el) => !successfullyAddedLabelledByEls.includes(el),
    );
    if (dropped.length > 0) {
      console.warn(
        `${prefix}: these label elements can't label the ${name} because they're inside another shadow root:`,
        dropped,
      );
    }

    return label.byElements.filter((el) =>
      successfullyAddedLabelledByEls.includes(el),
    );
  }

  //  The markup may already label the element in other ways
  if (
    !element.getAttribute("aria-label") &&
    !element.getAttribute("aria-labelledby") &&
    !element.ariaLabelledByElements?.length
  ) {
    console.warn(
      `${prefix}: the ${name} is missing an accessible label.`,
      element,
    );
  }

  return [];
}
