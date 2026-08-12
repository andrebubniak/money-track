/**
 * The global 404, for paths the proxy matcher deliberately skips — anything
 * containing a dot, such as a request for a `/favicon.ico` that isn't there.
 *
 * Those paths never enter the `[locale]` segment, so no layout renders above
 * them and this file must supply its own `<html>`. It is intentionally
 * untranslated: with no locale segment there is no locale to translate into.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <h1>404</h1>
        <p>This page does not exist.</p>
      </body>
    </html>
  );
}
