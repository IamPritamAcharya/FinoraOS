export type ChatContextEntry = {
  role: 'user' | 'assistant';
  text: string;
};

export type ControllerIntent =
  | 'SETTLEMENT_LOOKUP'
  | 'EXCEPTION_LOOKUP'
  | 'EXCEPTION_INVESTIGATION'
  | 'EXCEPTION_LIST'
  | 'CASH_FORECAST'
  | 'TAX_MISMATCH_LIST'
  | 'GENERAL';

export type ControllerDecision = {
  intent: ControllerIntent;
  reference?: string;
  minimumAmount?: string;
};

const settlementReference = /\bSTL_\d{4}\b/i;
const exceptionReference = /\bEXC_\d{3}\b/i;
const investigationIntent = /\b(investigate|review|analyse|analyze)\b/i;
const exceptionListIntent =
  /\b(show|list|find)\b.*\b(unreconciled|open|unresolved|exceptions?)\b|\b(unreconciled|open|unresolved)\b.*\btransactions?\b/i;
const cashIntent = /\b(cash|cash position|cashflow|cash flow|forecast)\b/i;
const taxIntent =
  /\b(tax|gst|tds)\b.*\b(match|mismatch|unmatched|failed)\b|\b(unmatched|failed)\b.*\b(tax|gst|tds)\b/i;

const referenceFrom = (pattern: RegExp, text: string) => text.match(pattern)?.[0]?.toUpperCase();

const contextReference = (pattern: RegExp, context: ChatContextEntry[]) => {
  for (const entry of [...context].reverse()) {
    const reference = referenceFrom(pattern, entry.text);
    if (reference) return reference;
  }
  return undefined;
};

const minimumAmount = (text: string) => {
  const match = text.match(/(?:₹|\bINR\s*)([\d,]+(?:\.\d{1,2})?)/i);
  return match ? match[1].replaceAll(',', '') : undefined;
};

/**
 * A deterministic controller for the small, explicitly-approved V1 tool set.
 * It never asks an LLM to select arbitrary database access.
 */
export class ControllerAgent {
  route(message: string, context: ChatContextEntry[] = []): ControllerDecision {
    const settlementId = referenceFrom(settlementReference, message);
    const exceptionId = referenceFrom(exceptionReference, message);

    if (settlementId) return { intent: 'SETTLEMENT_LOOKUP', reference: settlementId };
    if (exceptionId) {
      return {
        intent: investigationIntent.test(message) ? 'EXCEPTION_INVESTIGATION' : 'EXCEPTION_LOOKUP',
        reference: exceptionId,
      };
    }
    if (exceptionListIntent.test(message)) {
      return { intent: 'EXCEPTION_LIST', minimumAmount: minimumAmount(message) };
    }
    if (taxIntent.test(message)) return { intent: 'TAX_MISMATCH_LIST' };
    if (cashIntent.test(message)) return { intent: 'CASH_FORECAST' };

    if (/\b(fee|gst|refund|variance|short)\b/i.test(message)) {
      const reference = contextReference(settlementReference, context);
      if (reference) return { intent: 'SETTLEMENT_LOOKUP', reference };
    }
    if (/\b(it|this|that|why|explain|status)\b/i.test(message)) {
      const reference = contextReference(exceptionReference, context);
      if (reference) return { intent: 'EXCEPTION_LOOKUP', reference };
    }
    return { intent: 'GENERAL' };
  }
}
