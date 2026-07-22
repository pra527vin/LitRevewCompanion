import katex from "katex";

export type EquationExportFormat = "latex" | "word";

/**
 * Equation export for the Model Specification section (see
 * `EquationEditor.tsx`) — both formats copy straight to the clipboard
 * rather than writing a file, so pasting into an existing LaTeX
 * document or a Word doc needs nothing extra downloaded/opened first.
 */
export const equationExportService = {
  /** Copies the bare LaTeX source — no `\documentclass`/
   * `\begin{document}` wrapper, just the equation itself, so it pastes
   * straight into an existing LaTeX document or Word's own equation
   * editor (which accepts LaTeX-style input directly). */
  async copyLatex(latex: string): Promise<void> {
    await navigator.clipboard.writeText(latex.trim());
  },

  /** Copies the equation as MathML, not a picture — Word recognizes
   * MathML inside the HTML clipboard flavor and converts it straight
   * into a native, editable Office Math equation object on paste
   * (the same kind of object "Insert Equation" produces), so it can
   * still be edited/reformatted in Word afterward instead of sitting
   * there as a flat image. `katex`'s own MathML output (the same tree
   * it already embeds for screen readers) is reused rather than
   * hand-building one. A plain-text LaTeX fallback rides along on the
   * same clipboard write for anything that only reads that flavor. */
  async copyForWord(latex: string): Promise<void> {
    const mathml = katex.renderToString(latex, {
      throwOnError: false,
      output: "mathml",
    });
    const html = `<html><head><meta charset="utf-8"></head><body>${mathml}</body></html>`;

    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([latex.trim()], { type: "text/plain" }),
      }),
    ]);
  },
};
