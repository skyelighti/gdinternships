// Classifies whether a listing is open to undergrads or restricted to
// grad students (PhD/Master's), based on its text. Conservative: only
// flags "grad" when there's a real signal of a grad-only requirement,
// and backs off if bachelor's/undergrad is explicitly mentioned as
// eligible too (many postings list "bachelor's, master's, or PhD" —
// those ARE undergrad-eligible and should stay visible).
const GRAD_SIGNAL_RE = /\b(phd|ph\.d\.?|doctoral|graduate student)\b/i;
const MASTERS_REQUIRED_RE = /\bmaster'?s\b/i;
const UNDERGRAD_SIGNAL_RE = /\b(bachelor|undergrad|freshm[ae]n|sophomore|first-year|1st.year)\b/i;

export function classifyDegreeLevel(text) {
  if (!text) return "undergrad";
  if (UNDERGRAD_SIGNAL_RE.test(text)) return "undergrad";
  if (GRAD_SIGNAL_RE.test(text) || MASTERS_REQUIRED_RE.test(text)) return "grad";
  return "undergrad";
}
