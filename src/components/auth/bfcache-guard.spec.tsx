import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BfcacheGuard } from "@/components/auth/bfcache-guard";

const reload = vi.fn();
let originalLocation: Location;

beforeEach(() => {
  reload.mockReset();
  originalLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, reload },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

/** jsdom has no bfcache, so the restore is simulated by the event it fires. */
function firePageShow(persisted: boolean) {
  const event = new Event("pageshow") as PageTransitionEvent;
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
}

describe("BfcacheGuard", () => {
  it("renders nothing", () => {
    const { container } = render(<BfcacheGuard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reloads when the page is restored from the back/forward cache", () => {
    // This is the case that matters: the browser hands back a fully-rendered
    // auth form without asking the server, so the session guard never ran.
    render(<BfcacheGuard />);

    firePageShow(true);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing on a normal page load", () => {
    // `pageshow` also fires on every ordinary load. Reloading there would be
    // an infinite loop.
    render(<BfcacheGuard />);

    firePageShow(false);

    expect(reload).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", () => {
    const { unmount } = render(<BfcacheGuard />);
    unmount();

    firePageShow(true);

    expect(reload).not.toHaveBeenCalled();
  });
});
