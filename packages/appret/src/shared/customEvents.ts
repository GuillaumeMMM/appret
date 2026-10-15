export type CustomEventType = "appret-tabs-change";

export function triggerCustomEvent(
  host: HTMLElement,
  type: CustomEventType,
  detail: unknown,
) {
  host.dispatchEvent(
    new CustomEvent(type, {
      bubbles: true,
      detail,
    }),
  );
}
