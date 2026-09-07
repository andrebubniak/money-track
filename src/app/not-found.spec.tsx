import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import GlobalNotFound from "./not-found";

describe("GlobalNotFound", () => {
  /**
   * This app has no `src/app/layout.tsx` — the only root layout is
   * `src/app/[locale]/layout.tsx`, which unmatched URLs never reach. Next
   * fills that gap with its own built-in `DefaultLayout`
   * (`node_modules/next/dist/client/components/builtin/layout.js`), which
   * already renders `<html><body>`. A second `<html>` from here nests inside
   * that one: the browser's parser drops the tag but hoists its attributes
   * onto the outer element, so the server HTML carries a `lang` the client
   * tree does not, and React reports a hydration mismatch on every 404.
   *
   * Only `global-not-found.tsx` may return a full document; `not-found.tsx`
   * returns content. See
   * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`.
   */
  it("renders no document tags of its own", () => {
    const markup = renderToStaticMarkup(<GlobalNotFound />);

    expect(markup).not.toMatch(/<html[\s>]/);
    expect(markup).not.toMatch(/<body[\s>]/);
  });

  it("still says the page does not exist", () => {
    const markup = renderToStaticMarkup(<GlobalNotFound />);

    expect(markup).toContain("404");
    expect(markup).toContain("This page does not exist.");
  });
});
