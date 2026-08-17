import { describe, expect, it } from "vitest";
import { getByRole, getByText, queryByRole, within } from "@testing-library/react";

import { renderWithIntl } from "@/test-utils/intl";
import { TransactionPagination } from "@/components/transactions/transaction-pagination";
import { PAGE_SIZE } from "@/lib/validations/transaction-filters";

const hrefForPage = (page: number) => `/transactions?page=${page}`;

/**
 * Every rendered numbered link, in DOM order — excludes Previous/Next.
 * Scoped to the given render's own container rather than the shared
 * `screen`, so a test that renders more than once (see the regression test
 * below) never risks one render's nodes leaking into another's query.
 */
function numberedLinkNames(container: HTMLElement): string[] {
  const nav = getByRole(container, "navigation", { name: "Pagination" });
  return within(nav)
    .getAllByRole("link")
    .map((link) => link.getAttribute("aria-label") ?? "")
    .filter((name) => /^Page \d+$/.test(name));
}

describe("TransactionPagination", () => {
  it("renders nothing when everything fits on one page", () => {
    const { container } = renderWithIntl(
      <TransactionPagination page={1} total={PAGE_SIZE} hrefForPage={hrefForPage} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders exactly two pages with no ellipsis, and disables Previous on page 1", () => {
    const { container } = renderWithIntl(
      <TransactionPagination page={1} total={PAGE_SIZE + 1} hrefForPage={hrefForPage} />,
    );

    expect(numberedLinkNames(container)).toEqual(["Page 1", "Page 2"]);
    expect(container.querySelectorAll('[data-slot="pagination-ellipsis"]')).toHaveLength(0);
    expect(getByRole(container, "link", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Disabled: rendered as a non-interactive span, not a link. The "true"
    // text lives one element deeper than the `aria-disabled` attribute
    // itself, so assert on the ancestor that actually carries it.
    expect(queryByRole(container, "link", { name: "Previous" })).toBeNull();
    expect(getByText(container, "Previous").closest("[aria-disabled]")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(getByRole(container, "link", { name: "Next" })).toHaveAttribute(
      "href",
      "/en-US/transactions?page=2",
    );
  });

  it("shows at most seven numbered links, windowed around a deep-middle page", () => {
    const { container } = renderWithIntl(
      // totalPages = 20; page 10 is far from both ends.
      <TransactionPagination page={10} total={PAGE_SIZE * 20} hrefForPage={hrefForPage} />,
    );

    expect(numberedLinkNames(container)).toEqual([
      "Page 1",
      "Page 8",
      "Page 9",
      "Page 10",
      "Page 11",
      "Page 12",
      "Page 20",
    ]);
    expect(container.querySelectorAll('[data-slot="pagination-ellipsis"]')).toHaveLength(2);
  });

  // Regression: the fix-round-1 review found `totalPages=8, page=4` and
  // `totalPages=9, page=5` rendered 8-9 numbered links with no ellipsis at
  // all, because the single-page-gap "fill" re-added a page the window's own
  // clipping had just trimmed, on top of the full window rather than instead
  // of it. A user with 351-450 rows in the active period would have hit this
  // on page 4 or 5. These assert the cap holds at exactly that band.
  it("never exceeds seven numbered links at the previously-broken totalPages=8 band", () => {
    const { container } = renderWithIntl(
      <TransactionPagination page={4} total={PAGE_SIZE * 8} hrefForPage={hrefForPage} />,
    );
    expect(numberedLinkNames(container).length).toBeLessThanOrEqual(7);
  });

  it("never exceeds seven numbered links at the previously-broken totalPages=9 band", () => {
    const { container } = renderWithIntl(
      <TransactionPagination page={5} total={PAGE_SIZE * 8 + 1} hrefForPage={hrefForPage} />,
    );
    expect(numberedLinkNames(container).length).toBeLessThanOrEqual(7);
  });
});
