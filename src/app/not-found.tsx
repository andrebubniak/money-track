/**
 * The global 404, for paths that never enter the `[locale]` segment: the ones
 * the proxy matcher deliberately skips — anything containing a dot, such as a
 * request for a `/favicon.ico` that isn't there — and any URL that matches no
 * route at all.
 *
 * It renders **content only**, with no `<html>`/`<body>` of its own. There is
 * no `src/app/layout.tsx` here — the only root layout is
 * `src/app/[locale]/layout.tsx`, which these paths never reach — so Next
 * supplies its own built-in root layout
 * (`node_modules/next/dist/client/components/builtin/layout.js`), and that
 * already renders `<html><body>`. A second `<html>` here would nest inside
 * that one: the browser's parser drops the tag but hoists its attributes onto
 * the outer element, so the server HTML would carry a `lang` the client tree
 * doesn't, and React would report a hydration mismatch on every 404. Only
 * `global-not-found.tsx` may return a full document — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`.
 *
 * It is intentionally untranslated and unstyled: with no locale segment there
 * is no locale to translate into, and the built-in layout loads none of our
 * CSS. `src/app/[locale]/not-found.tsx` is the translated one, for everything
 * inside the app.
 */
export default function GlobalNotFound() {
  return (
    <>
      <h1>404</h1>
      <p>This page does not exist.</p>
    </>
  );
}
