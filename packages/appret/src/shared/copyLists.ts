// Copies arrays and objects recursively
export function copyLists<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(copyLists) as T;
  }

  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, copyLists(v)]),
    ) as T;
  }

  return value;
}
