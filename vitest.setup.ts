import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// @testing-library/react's `asyncWrapper` (used by every `userEvent` async
// API under the hood) drains the microtask queue with
// `await new Promise(resolve => { setTimeout(resolve, 0); if
// (jestFakeTimersAreEnabled()) jest.advanceTimersByTime(0); })`. Its fake
// timer detection only recognises a global `jest`, so under Vitest's
// `vi.useFakeTimers()` that branch never runs and the `setTimeout(…, 0)`
// it just scheduled is never flushed — `await user.click(...)` (or any other
// userEvent API) hangs forever, even against a plain, non-React DOM node, with
// zero relation to the component under test. Shimming just enough of `jest`
// for that duck-typed check to fire is the documented workaround for this
// Testing-Library/Vitest gap; it does not change what any test asserts.
(globalThis as unknown as { jest: { advanceTimersByTime: (ms: number) => void } }).jest = {
  advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
};

afterEach(() => {
  cleanup();
});
