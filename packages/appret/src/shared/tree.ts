export function isTreeRoot(node: Node): node is Document | DocumentFragment {
  return (
    node.nodeType === Node.DOCUMENT_NODE ||
    node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
  );
}

function flatParent(node: Node): Node | null {
  if (node instanceof Element && node.assignedSlot) return node.assignedSlot;
  if (node instanceof ShadowRoot) return node.host;
  return node.parentNode;
}

//  Checks if a node is a child of the ancestor in the flatten tree
export function flatTreeContains(ancestor: Node, node: Node): boolean {
  for (let n: Node | null = node; n; n = flatParent(n)) {
    if (n === ancestor) return true;
  }
  return false;
}
