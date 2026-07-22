/**
 * The Model Specification symbol picker's data — organized the way
 * Word's own "Insert Equation" symbol gallery groups things (Basic
 * Math, Greek Letters, Letter-Like Symbols, Operators, Arrows,
 * Relations/Negated Relations, Scripts, Geometry), plus a
 * LaTeX-specific "Structures & Templates" and "Functions" group for
 * the multi-character constructs (fractions, sums, integrals, trig
 * functions) neither Word's gallery nor a flat symbol list can
 * represent as a single glyph.
 *
 * `insert` is what actually lands in the LaTeX source; `label` is the
 * button's own text — a real Unicode glyph wherever one exists (they
 * render close enough to the LaTeX/Word output to be recognizable at
 * a glance) rather than rendering each of ~170 buttons through KaTeX
 * individually.
 */
export interface EquationSymbol {
  label: string;
  insert: string;
  /** Extra search terms beyond `label`/`insert` (e.g. "not equal" for ≠). */
  keywords?: string;
}

export interface EquationSymbolCategory {
  id: string;
  title: string;
  symbols: EquationSymbol[];
}

export const EQUATION_SYMBOL_CATEGORIES: EquationSymbolCategory[] = [
  {
    id: "basic",
    title: "Basic Math",
    symbols: [
      { label: "±", insert: "\\pm ", keywords: "plus minus" },
      { label: "∓", insert: "\\mp ", keywords: "minus plus" },
      { label: "×", insert: "\\times ", keywords: "multiply" },
      { label: "÷", insert: "\\div ", keywords: "divide" },
      { label: "⋅", insert: "\\cdot ", keywords: "dot multiply" },
      { label: "∗", insert: "\\ast ", keywords: "asterisk" },
      { label: "∘", insert: "\\circ ", keywords: "compose" },
      { label: "•", insert: "\\bullet ", keywords: "bullet" },
      { label: "=", insert: "= " },
      { label: "≠", insert: "\\neq ", keywords: "not equal" },
      { label: "≈", insert: "\\approx ", keywords: "approximately" },
      { label: "≅", insert: "\\cong ", keywords: "congruent" },
      { label: "≡", insert: "\\equiv ", keywords: "equivalent identical" },
      { label: "∝", insert: "\\propto ", keywords: "proportional" },
      { label: "√", insert: "\\sqrt{}", keywords: "square root" },
      { label: "∛", insert: "\\sqrt[3]{}", keywords: "cube root" },
      { label: "%", insert: "\\% " },
      { label: "°", insert: "^\\circ ", keywords: "degree" },
      { label: "′", insert: "'", keywords: "prime" },
      { label: "″", insert: "''", keywords: "double prime" },
      { label: "!", insert: "!", keywords: "factorial" },
      { label: "∞", insert: "\\infty ", keywords: "infinity" },
      { label: "⋯", insert: "\\cdots ", keywords: "dots horizontal" },
      { label: "⋮", insert: "\\vdots ", keywords: "dots vertical" },
      { label: "⋱", insert: "\\ddots ", keywords: "dots diagonal" },
    ],
  },
  {
    id: "greek",
    title: "Greek Letters",
    symbols: [
      { label: "α", insert: "\\alpha " },
      { label: "β", insert: "\\beta " },
      { label: "γ", insert: "\\gamma " },
      { label: "δ", insert: "\\delta " },
      { label: "ε", insert: "\\epsilon " },
      { label: "ϵ", insert: "\\varepsilon " },
      { label: "ζ", insert: "\\zeta " },
      { label: "η", insert: "\\eta " },
      { label: "θ", insert: "\\theta " },
      { label: "ϑ", insert: "\\vartheta " },
      { label: "ι", insert: "\\iota " },
      { label: "κ", insert: "\\kappa " },
      { label: "λ", insert: "\\lambda " },
      { label: "μ", insert: "\\mu " },
      { label: "ν", insert: "\\nu " },
      { label: "ξ", insert: "\\xi " },
      { label: "π", insert: "\\pi " },
      { label: "ϖ", insert: "\\varpi " },
      { label: "ρ", insert: "\\rho " },
      { label: "ϱ", insert: "\\varrho " },
      { label: "σ", insert: "\\sigma " },
      { label: "ς", insert: "\\varsigma " },
      { label: "τ", insert: "\\tau " },
      { label: "υ", insert: "\\upsilon " },
      { label: "φ", insert: "\\phi " },
      { label: "ϕ", insert: "\\varphi " },
      { label: "χ", insert: "\\chi " },
      { label: "ψ", insert: "\\psi " },
      { label: "ω", insert: "\\omega " },
      { label: "Γ", insert: "\\Gamma " },
      { label: "Δ", insert: "\\Delta " },
      { label: "Θ", insert: "\\Theta " },
      { label: "Λ", insert: "\\Lambda " },
      { label: "Ξ", insert: "\\Xi " },
      { label: "Π", insert: "\\Pi " },
      { label: "Σ", insert: "\\Sigma " },
      { label: "Υ", insert: "\\Upsilon " },
      { label: "Φ", insert: "\\Phi " },
      { label: "Ψ", insert: "\\Psi " },
      { label: "Ω", insert: "\\Omega " },
    ],
  },
  {
    id: "letterlike",
    title: "Letter-Like Symbols",
    symbols: [
      { label: "ℝ", insert: "\\mathbb{R}", keywords: "real numbers" },
      { label: "ℂ", insert: "\\mathbb{C}", keywords: "complex numbers" },
      { label: "ℕ", insert: "\\mathbb{N}", keywords: "natural numbers" },
      { label: "ℤ", insert: "\\mathbb{Z}", keywords: "integers" },
      { label: "ℚ", insert: "\\mathbb{Q}", keywords: "rational numbers" },
      { label: "ℍ", insert: "\\mathbb{H}", keywords: "quaternions" },
      { label: "𝔽", insert: "\\mathbb{F}", keywords: "field" },
      { label: "ℓ", insert: "\\ell " },
      { label: "℘", insert: "\\wp " },
      { label: "ℑ", insert: "\\Im ", keywords: "imaginary part" },
      { label: "ℜ", insert: "\\Re ", keywords: "real part" },
      { label: "ℵ", insert: "\\aleph " },
      { label: "ℶ", insert: "\\beth " },
      { label: "ℏ", insert: "\\hbar ", keywords: "reduced planck constant" },
      { label: "∅", insert: "\\emptyset ", keywords: "empty set" },
      { label: "Å", insert: "\\text{Å}", keywords: "angstrom" },
    ],
  },
  {
    id: "operators",
    title: "Operators",
    symbols: [
      { label: "∑", insert: "\\sum_{}^{}", keywords: "summation sigma" },
      { label: "∏", insert: "\\prod_{}^{}", keywords: "product pi" },
      { label: "∐", insert: "\\coprod_{}^{}", keywords: "coproduct" },
      { label: "∫", insert: "\\int_{}^{}", keywords: "integral" },
      { label: "∬", insert: "\\iint_{}^{}", keywords: "double integral" },
      { label: "∭", insert: "\\iiint_{}^{}", keywords: "triple integral" },
      { label: "∮", insert: "\\oint_{}^{}", keywords: "contour integral" },
      { label: "∇", insert: "\\nabla ", keywords: "gradient del" },
      { label: "∂", insert: "\\partial ", keywords: "partial derivative" },
      { label: "⊕", insert: "\\oplus ", keywords: "direct sum xor" },
      { label: "⊖", insert: "\\ominus " },
      { label: "⊗", insert: "\\otimes ", keywords: "tensor product" },
      { label: "⊘", insert: "\\oslash " },
      { label: "⊙", insert: "\\odot " },
      { label: "⊎", insert: "\\uplus " },
      { label: "⊔", insert: "\\sqcup " },
      { label: "⊓", insert: "\\sqcap " },
      { label: "∧", insert: "\\wedge ", keywords: "logical and" },
      { label: "∨", insert: "\\vee ", keywords: "logical or" },
      { label: "∩", insert: "\\cap ", keywords: "intersection" },
      { label: "∪", insert: "\\cup ", keywords: "union" },
      { label: "★", insert: "\\star " },
      { label: "‖", insert: "\\|", keywords: "norm double bar" },
    ],
  },
  {
    id: "arrows",
    title: "Arrows",
    symbols: [
      { label: "→", insert: "\\to ", keywords: "right arrow implies" },
      { label: "←", insert: "\\leftarrow " },
      { label: "↔", insert: "\\leftrightarrow " },
      { label: "⇒", insert: "\\Rightarrow ", keywords: "implies" },
      { label: "⇐", insert: "\\Leftarrow " },
      { label: "⇔", insert: "\\Leftrightarrow ", keywords: "iff if and only if" },
      { label: "↑", insert: "\\uparrow " },
      { label: "↓", insert: "\\downarrow " },
      { label: "↕", insert: "\\updownarrow " },
      { label: "⇑", insert: "\\Uparrow " },
      { label: "⇓", insert: "\\Downarrow " },
      { label: "⇕", insert: "\\Updownarrow " },
      { label: "↦", insert: "\\mapsto " },
      { label: "↩", insert: "\\hookleftarrow " },
      { label: "↪", insert: "\\hookrightarrow " },
      { label: "⇀", insert: "\\rightharpoonup " },
      { label: "↽", insert: "\\leftharpoondown " },
      { label: "⇌", insert: "\\rightleftharpoons ", keywords: "equilibrium" },
      { label: "⟶", insert: "\\longrightarrow " },
      { label: "⟵", insert: "\\longleftarrow " },
      { label: "⟷", insert: "\\longleftrightarrow " },
      { label: "↗", insert: "\\nearrow " },
      { label: "↘", insert: "\\searrow " },
      { label: "↙", insert: "\\swarrow " },
      { label: "↖", insert: "\\nwarrow " },
    ],
  },
  {
    id: "relations",
    title: "Relations",
    symbols: [
      { label: "≤", insert: "\\leq ", keywords: "less than or equal" },
      { label: "≥", insert: "\\geq ", keywords: "greater than or equal" },
      { label: "≪", insert: "\\ll ", keywords: "much less than" },
      { label: "≫", insert: "\\gg ", keywords: "much greater than" },
      { label: "∼", insert: "\\sim ", keywords: "similar" },
      { label: "≃", insert: "\\simeq " },
      { label: "≍", insert: "\\asymp " },
      { label: "≺", insert: "\\prec " },
      { label: "≻", insert: "\\succ " },
      { label: "⪯", insert: "\\preceq " },
      { label: "⪰", insert: "\\succeq " },
      { label: "⊂", insert: "\\subset ", keywords: "subset" },
      { label: "⊃", insert: "\\supset ", keywords: "superset" },
      { label: "⊆", insert: "\\subseteq " },
      { label: "⊇", insert: "\\supseteq " },
      { label: "∈", insert: "\\in ", keywords: "element of" },
      { label: "∋", insert: "\\ni ", keywords: "contains" },
      { label: "⊥", insert: "\\perp ", keywords: "perpendicular orthogonal" },
      { label: "∥", insert: "\\parallel " },
      { label: "∴", insert: "\\therefore " },
      { label: "∵", insert: "\\because " },
      { label: "≐", insert: "\\doteq " },
      { label: "≜", insert: "\\triangleq ", keywords: "defined as" },
    ],
  },
  {
    id: "negated",
    title: "Negated Relations",
    symbols: [
      { label: "≠", insert: "\\neq " },
      { label: "∉", insert: "\\notin ", keywords: "not an element of" },
      { label: "∌", insert: "\\not\\ni " },
      { label: "⊄", insert: "\\not\\subset " },
      { label: "⊅", insert: "\\not\\supset " },
      { label: "⊈", insert: "\\nsubseteq " },
      { label: "⊉", insert: "\\nsupseteq " },
      { label: "≁", insert: "\\nsim " },
      { label: "≉", insert: "\\napprox " },
      { label: "≇", insert: "\\ncong " },
      { label: "∤", insert: "\\nmid ", keywords: "does not divide" },
      { label: "∦", insert: "\\nparallel " },
      { label: "⊭", insert: "\\nvDash " },
      { label: "⊬", insert: "\\nvdash " },
      { label: "≨", insert: "\\lneq " },
      { label: "≩", insert: "\\gneq " },
    ],
  },
  {
    id: "sets-logic",
    title: "Sets & Logic",
    symbols: [
      { label: "∀", insert: "\\forall ", keywords: "for all" },
      { label: "∃", insert: "\\exists ", keywords: "there exists" },
      { label: "∄", insert: "\\nexists ", keywords: "does not exist" },
      { label: "¬", insert: "\\neg ", keywords: "logical not negation" },
      { label: "∧", insert: "\\land ", keywords: "and" },
      { label: "∨", insert: "\\lor ", keywords: "or" },
      { label: "⊤", insert: "\\top ", keywords: "true tautology" },
      { label: "⊥", insert: "\\bot ", keywords: "false contradiction" },
      { label: "⊢", insert: "\\vdash ", keywords: "proves entails" },
      { label: "⊨", insert: "\\models ", keywords: "models satisfies" },
      { label: "∅", insert: "\\emptyset ", keywords: "empty set" },
      { label: "∖", insert: "\\setminus ", keywords: "set difference" },
      { label: "⊑", insert: "\\sqsubseteq " },
      { label: "⊒", insert: "\\sqsupseteq " },
      { label: "℘", insert: "\\mathcal{P}", keywords: "power set" },
    ],
  },
  {
    id: "scripts",
    title: "Scripts & Fonts",
    symbols: [
      { label: "𝒜", insert: "\\mathcal{}", keywords: "calligraphic script font" },
      { label: "𝔸", insert: "\\mathbb{}", keywords: "blackboard bold font" },
      { label: "𝔄", insert: "\\mathfrak{}", keywords: "fraktur font" },
      { label: "bold", insert: "\\mathbf{}", keywords: "bold font" },
      { label: "roman", insert: "\\mathrm{}", keywords: "upright roman font" },
      { label: "hat", insert: "\\hat{}", keywords: "hat accent estimator" },
      { label: "widehat", insert: "\\widehat{}", keywords: "wide hat accent" },
      { label: "bar", insert: "\\bar{}", keywords: "bar accent mean average" },
      { label: "vec", insert: "\\vec{}", keywords: "vector arrow accent" },
      { label: "dot", insert: "\\dot{}", keywords: "dot accent derivative" },
      { label: "ddot", insert: "\\ddot{}", keywords: "double dot accent second derivative" },
      { label: "tilde", insert: "\\tilde{}", keywords: "tilde accent" },
      { label: "xⁿ", insert: "^{}", keywords: "superscript exponent power" },
      { label: "xₙ", insert: "_{}", keywords: "subscript index" },
      { label: "overline", insert: "\\overline{}" },
      { label: "underline", insert: "\\underline{}" },
    ],
  },
  {
    id: "structures",
    title: "Structures & Templates",
    symbols: [
      { label: "a⁄b", insert: "\\frac{}{}", keywords: "fraction" },
      { label: "√", insert: "\\sqrt{}", keywords: "square root" },
      { label: "ⁿ√", insert: "\\sqrt[n]{}", keywords: "nth root" },
      { label: "(nk)", insert: "\\binom{}{}", keywords: "binomial coefficient" },
      { label: "∑", insert: "\\sum_{i=1}^{n}", keywords: "sum with bounds" },
      { label: "∏", insert: "\\prod_{i=1}^{n}", keywords: "product with bounds" },
      { label: "∫", insert: "\\int_{a}^{b}", keywords: "definite integral" },
      { label: "lim", insert: "\\lim_{x \\to \\infty}", keywords: "limit" },
      { label: "( )", insert: "\\left(\\right)", keywords: "auto-sized parentheses" },
      { label: "[ ]", insert: "\\left[\\right]", keywords: "auto-sized brackets" },
      { label: "{ }", insert: "\\left\\{\\right\\}", keywords: "auto-sized braces" },
      { label: "|x|", insert: "\\left|\\right|", keywords: "absolute value" },
      { label: "⟨x⟩", insert: "\\left\\langle \\right\\rangle", keywords: "angle brackets inner product" },
      { label: "cases", insert: "\\begin{cases}  &  \\\\  &  \\end{cases}", keywords: "piecewise function" },
      { label: "2×2 matrix", insert: "\\begin{pmatrix}  &  \\\\  &  \\end{pmatrix}", keywords: "matrix" },
      { label: "3×3 matrix", insert: "\\begin{pmatrix}  &  &  \\\\  &  &  \\\\  &  &  \\end{pmatrix}", keywords: "matrix" },
    ],
  },
  {
    id: "geometry",
    title: "Geometry",
    symbols: [
      { label: "∠", insert: "\\angle ", keywords: "angle" },
      { label: "∟", insert: "∟", keywords: "right angle" },
      { label: "⊥", insert: "\\perp ", keywords: "perpendicular" },
      { label: "∥", insert: "\\parallel " },
      { label: "△", insert: "\\triangle ", keywords: "triangle" },
      { label: "□", insert: "\\square ", keywords: "square" },
      { label: "○", insert: "\\circ ", keywords: "circle" },
      { label: "≅", insert: "\\cong ", keywords: "congruent" },
      { label: "∼", insert: "\\sim ", keywords: "similar" },
      { label: "⌢", insert: "\\frown ", keywords: "arc" },
      { label: "°", insert: "^\\circ ", keywords: "degree" },
      { label: "π", insert: "\\pi " },
    ],
  },
  {
    id: "functions",
    title: "Functions",
    symbols: [
      { label: "sin", insert: "\\sin " },
      { label: "cos", insert: "\\cos " },
      { label: "tan", insert: "\\tan " },
      { label: "cot", insert: "\\cot " },
      { label: "sec", insert: "\\sec " },
      { label: "csc", insert: "\\csc " },
      { label: "arcsin", insert: "\\arcsin " },
      { label: "arccos", insert: "\\arccos " },
      { label: "arctan", insert: "\\arctan " },
      { label: "sinh", insert: "\\sinh " },
      { label: "cosh", insert: "\\cosh " },
      { label: "tanh", insert: "\\tanh " },
      { label: "log", insert: "\\log " },
      { label: "ln", insert: "\\ln " },
      { label: "exp", insert: "\\exp " },
      { label: "lim", insert: "\\lim " },
      { label: "max", insert: "\\max " },
      { label: "min", insert: "\\min " },
      { label: "sup", insert: "\\sup " },
      { label: "inf", insert: "\\inf " },
      { label: "det", insert: "\\det " },
      { label: "gcd", insert: "\\gcd " },
      { label: "mod", insert: "\\bmod " },
      { label: "arg", insert: "\\arg " },
      { label: "Pr", insert: "\\Pr " },
      { label: "E[]", insert: "\\mathbb{E}[]", keywords: "expectation expected value" },
      { label: "Var()", insert: "\\text{Var}()", keywords: "variance" },
    ],
  },
];

const RECENT_KEY = "litreview-equation-recent-symbols";
const MAX_RECENT = 16;

/** Recently-used symbols — a browser-profile preference like the
 * theme/sidebar-width settings elsewhere, not per-workspace: a
 * researcher's frequent symbols don't really depend on which
 * workspace they're currently in. */
export function loadRecentSymbols(): EquationSymbol[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is EquationSymbol => typeof s?.label === "string" && typeof s?.insert === "string",
    );
  } catch {
    return [];
  }
}

export function recordRecentSymbol(symbol: EquationSymbol): EquationSymbol[] {
  const current = loadRecentSymbols().filter((s) => s.insert !== symbol.insert);
  const next = [symbol, ...current].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Best-effort — a full/disabled localStorage just means "recent" doesn't persist.
  }
  return next;
}
