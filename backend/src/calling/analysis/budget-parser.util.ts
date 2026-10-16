// Turns the analysis LLM's free-text budget extraction (CallAnalysis.budget
// — e.g. "around 5 lakh", "₹50,000", "2-3 crore") into the Int Lead.budget
// expects. Indian sales conversations routinely use lakh/crore rather than
// bare digits, so those units get parsed rather than discarded. Returns
// null for anything that doesn't contain a parseable amount (e.g. "not
// disclosed", "flexible") — CallAnalysisService leaves Lead.budget
// untouched rather than overwriting it with null in that case.

const NUMBER_PATTERN = /(\d[\d,]*\.?\d*)/;

function multiplierFor(text: string): number {
  if (/\bcrore|cr\.?\b/.test(text)) return 1e7;
  if (/\blakh|lac\.?s?\b/.test(text)) return 1e5;
  if (/\b(\d[\d,.]*\s*)k\b/.test(text) || /\bthousand\b/.test(text)) {
    return 1e3;
  }
  return 1;
}

export function parseBudgetAmount(
  text: string | null | undefined,
): number | null {
  if (!text) return null;

  const normalized = text.toLowerCase().trim();
  const match = NUMBER_PATTERN.exec(normalized);
  if (!match) return null;

  const raw = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(raw) || raw <= 0) return null;

  const amount = Math.round(raw * multiplierFor(normalized));
  return amount > 0 ? amount : null;
}
