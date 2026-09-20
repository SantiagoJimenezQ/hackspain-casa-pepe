/**
 * A script the browser runs while it parses the HTML, before anything is painted.
 *
 * React never executes a script it renders on the client, and warns when it sees one, so the tag
 * only carries executable JavaScript on the server render that reaches the browser as HTML. On the
 * client it renders inert, and `suppressHydrationWarning` keeps React from fighting the DOM over
 * the type it finds there.
 */
export function InlineScript({ html }: { html: string }) {
  const onServer = globalThis.window === undefined;
  return (
    <script
      type={onServer ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      // biome-ignore lint/security/noDangerouslySetInnerHtml: the payload is a literal defined in this repository
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
