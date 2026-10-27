export function isLink(element: Element): element is HTMLAnchorElement {
  return element instanceof HTMLAnchorElement && element.hasAttribute("href");
}

export function isOpeningInNewTab(event: MouseEvent): boolean {
  return (
    event.currentTarget instanceof Element &&
    isLink(event.currentTarget) &&
    (event.metaKey || event.ctrlKey || event.shiftKey)
  );
}
