import ts from "typescript";

/**
 * The text a source file can put on a screen: string and template literals and
 * JSX text, with comments left out. The scenarios test matches quoted screen
 * text against this, so a reworded screen can't hide behind the old wording
 * surviving in a comment. Test support only; nothing in the app imports it.
 */
export function screenText(code: string): string {
  const file = ts.createSourceFile(
    "source.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const pieces: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      pieces.push(node.text);
    } else if (ts.isJsxText(node)) {
      pieces.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return pieces.join("\n");
}
