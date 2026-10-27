type AppretEventType = Extract<keyof HTMLElementEventMap, `appret-${string}`>;

type EventDetail<K extends AppretEventType> =
  HTMLElementEventMap[K] extends CustomEvent<infer Detail> ? Detail : never;

export function triggerCustomEvent<K extends AppretEventType>(
  host: HTMLElement,
  type: K,
  detail: EventDetail<K>,
  options?: { cancelable: boolean },
): void {
  host.dispatchEvent(
    new CustomEvent(type, {
      bubbles: true,
      detail,
      cancelable: options?.cancelable,
    }),
  );
}
