import { normalizeSourceRef, normalizeSourceRefs } from '../../source-locator.ts';
import { parseTenderBoqFiveStepPricingData } from './schema.ts';
import type { TenderBoqFiveStepItemBuildUp, TenderBoqFiveStepPricingData } from './types.ts';

/**
 * Lenient normalization for LLM-produced BOQ pricing payloads.
 *
 * The strict Zod schema is the integrity gate for the *stored* pack, but child
 * agents write free-form JSON: numbers arrive as numbers, thousands separators
 * appear, allocation weights arrive as percents, and extra keys sneak in.
 * Rejecting the whole batch on those format technicalities caused retry loops,
 * so reports are normalized first; every coercion is surfaced as a warning for
 * human review instead of failing the batch.
 */
export interface BoqPricingNormalizationResult {
  itemBuildUps: TenderBoqFiveStepItemBuildUp[];
  /** Item-level hard failures after normalization (item dropped). */
  errors: string[];
  /** Coercions applied — reviewable, non-blocking. */
  warnings: string[];
}

const ENTITY_ID_MAX = 80;

export function normalizeAndValidateBoqItemBuildUps(
  raw: unknown,
  skeleton: Omit<TenderBoqFiveStepPricingData, 'itemBuildUps'>,
): BoqPricingNormalizationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!Array.isArray(raw)) {
    return { itemBuildUps: [], errors: ['itemBuildUps must be an array'], warnings };
  }
  const itemBuildUps: TenderBoqFiveStepItemBuildUp[] = [];
  raw.forEach((entry, index) => {
    const label = describeBuildUp(entry, index);
    const normalized = normalizeBuildUp(entry, label, warnings);
    if (!normalized) {
      errors.push(`${label}: not an object with a boqItemId`);
      return;
    }
    try {
      const parsed = parseTenderBoqFiveStepPricingData({ ...skeleton, itemBuildUps: [normalized] });
      itemBuildUps.push(parsed.itemBuildUps[0]!);
    } catch (error) {
      errors.push(`${label}: ${firstIssueMessages(error, 2)}`);
    }
  });
  return { itemBuildUps, errors, warnings };
}

export function parseTenderBoqFiveStepPricingDataLenient(
  value: unknown,
  fallbackCurrency = 'USD',
): { data: TenderBoqFiveStepPricingData; warnings: string[] } {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const warnings: string[] = [];
  const currency = normalizeCurrency(record.currency, warnings) ?? fallbackCurrency;
  const skeleton: Omit<TenderBoqFiveStepPricingData, 'itemBuildUps'> = {
    currency,
    pricingStandard: 'c51_pure_direct_cost_v1',
    vatTreatment: 'exclusive',
    indirectCostPolicy: 'excluded_from_item_direct_cost',
    pricingStatus: normalizeEnum(record.pricingStatus, ['draft', 'reviewed', 'blocked'] as const) ?? 'draft',
    resourceSummary: Array.isArray(record.resourceSummary) ? record.resourceSummary as never : [],
    assumptions: Array.isArray(record.assumptions) ? record.assumptions as never : [],
  };
  const result = normalizeAndValidateBoqItemBuildUps(record.itemBuildUps, skeleton);
  warnings.push(...result.warnings);
  const data: TenderBoqFiveStepPricingData = { ...skeleton, itemBuildUps: result.itemBuildUps };
  return { data, warnings };
}

export function normalizeBoqPricingDecimal(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return canonicalDecimal(String(value));
  if (typeof value !== 'string') return undefined;
  let text = value.trim();
  if (!text) return undefined;
  text = text.replace(/^\(?\s*(?:ZAR|USD|EUR|GBP|R|\$|€|£)\s*/i, '');
  if (/^\(.*\)$/.test(text)) text = `-${text.slice(1, -1)}`;
  text = text.replace(/[‚ _]/g, '');
  text = text.replace(/,/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return canonicalDecimal(text);
  const leading = text.match(/^-?\d+(?:\.\d+)?/);
  if (leading) return canonicalDecimal(leading[0]);
  return undefined;
}

/** Allocation weights arrive as 0..1 fractions or 0..100 percents — normalize to 0..1. */
export function normalizeBoqPricingWeight(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    const percent = normalizeBoqPricingDecimal(value.trim().slice(0, -1));
    return percent === undefined ? undefined : divideByHundred(percent);
  }
  const decimal = normalizeBoqPricingDecimal(value);
  if (decimal === undefined) return undefined;
  const numeric = Number(decimal);
  if (!Number.isFinite(numeric)) return undefined;
  if (numeric > 1 && numeric <= 100) return divideByHundred(decimal);
  return decimal;
}

function describeBuildUp(entry: unknown, index: number): string {
  if (entry && typeof entry === 'object') {
    const id = (entry as Record<string, unknown>).boqItemId;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return `itemBuildUps[${index}]`;
}

function normalizeBuildUp(
  entry: unknown,
  label: string,
  warnings: string[],
): Record<string, unknown> | undefined {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
  const input = entry as Record<string, unknown>;
  const warn = (message: string) => warnings.push(`${label}: ${message}`);

  const boqItemId = typeof input.boqItemId === 'string' ? input.boqItemId.trim() : undefined;
  if (!boqItemId) return undefined;

  const output: Record<string, unknown> = { boqItemId };
  output.status = normalizeEnum(input.status, ['draft', 'reviewed', 'blocked'] as const) ?? 'draft';
  output.steps = normalizeSteps(input.steps, warn);

  const directCost = normalizeBoqPricingDecimal(input.directCost);
  if (directCost === undefined) {
    warn('directCost missing or not numeric; defaulted to 0 — review required');
    output.directCost = '0';
  } else {
    if (directCost !== input.directCost) warn(`directCost coerced ${JSON.stringify(input.directCost)} → ${directCost}`);
    output.directCost = directCost;
  }

  assignOptional(output, 'itemIdentity', normalizeItemIdentity(input.itemIdentity, warn));
  assignOptional(output, 'scopeBasis', normalizeScopeBasis(input.scopeBasis, warn));
  assignOptional(output, 'productivityBasis', normalizeProductivityBasis(input.productivityBasis, warn));
  assignOptional(output, 'resourceCoverage', normalizeResourceCoverage(input.resourceCoverage, warn));
  output.resourceConsumptions = normalizeResourceConsumptions(input.resourceConsumptions, warn);
  assignOptional(output, 'planningBasis', normalizePlanningBasis(input.planningBasis, warn));
  assignOptional(output, 'initialCashFlow', normalizeCashFlow(input.initialCashFlow, warn));
  output.costComponents = normalizeCostComponents(input.costComponents, warn);
  assignOptional(output, 'directCostSummary', normalizeDirectCostSummary(input.directCostSummary, warn));
  assignOptional(output, 'riskScenarios', normalizeRiskScenarios(input.riskScenarios, warn));
  output.conditions = normalizeStringArray(input.conditions);
  output.riskNotes = normalizeStringArray(input.riskNotes);

  const dropped = Object.keys(input).filter((key) => !(key in output));
  if (dropped.length > 0) warn(`ignored unknown field(s): ${dropped.join(', ')}`);
  return output;
}

function normalizeSteps(value: unknown, warn: (message: string) => void): Record<string, unknown> {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const steps: Record<string, unknown> = {};
  for (const key of ['scopeQuantity', 'methodProductivity', 'resourceConsumption', 'sourcedRatesDirectCost', 'reconciliationRisk']) {
    const step = (input[key] && typeof input[key] === 'object' ? input[key] : {}) as Record<string, unknown>;
    let narrative = step.narrative;
    if (typeof narrative !== 'string') {
      if (narrative !== undefined) warn(`steps.${key}.narrative coerced to text`);
      narrative = narrative === undefined ? '' : JSON.stringify(narrative);
    }
    steps[key] = { narrative, sourceRefs: normalizeSourceRefs(step.sourceRefs) };
  }
  return steps;
}

function normalizeItemIdentity(value: unknown, warn: (message: string) => void): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  const quantity = normalizeBoqPricingDecimal(input.quantity);
  if (quantity === undefined) {
    warn('itemIdentity dropped: quantity not numeric');
    return undefined;
  }
  return {
    code: normalizeText(input.code),
    description: normalizeText(input.description),
    unit: normalizeText(input.unit),
    quantity,
    sourceRef: normalizeSourceRef(input.sourceRef) ?? { documentId: 'unknown' },
  };
}

function normalizeScopeBasis(value: unknown, warn: (message: string) => void): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  return {
    specificationRefs: normalizeSourceRefs(input.specificationRefs),
    measurementRuleRefs: normalizeSourceRefs(input.measurementRuleRefs),
    inclusions: normalizeStringArray(input.inclusions),
    exclusions: normalizeStringArray(input.exclusions),
    testingRequirements: normalizeStringArray(input.testingRequirements),
    methodConstraints: normalizeStringArray(input.methodConstraints),
  };
}

const TIME_UNIT_MAP: Record<string, string> = {
  hour: 'hour', hr: 'hour', hours: 'hour', h: 'hour',
  shift: 'shift', shifts: 'shift',
  day: 'working_day', days: 'working_day', working_day: 'working_day', workingday: 'working_day', 'working day': 'working_day',
  week: 'week', weeks: 'week',
};

function normalizeTimeUnit(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return TIME_UNIT_MAP[value.trim().toLowerCase()];
}

function normalizeProductivityBasis(value: unknown, warn: (message: string) => void): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  const crew = Array.isArray(input.crew) ? input.crew.flatMap((member, index) => {
    if (!member || typeof member !== 'object') return [];
    const record = member as Record<string, unknown>;
    const count = normalizeBoqPricingDecimal(record.count);
    if (count === undefined) {
      warn(`crew[${index}] dropped: count not numeric`);
      return [];
    }
    return [{
      id: normalizeId(record.id, `crew-${index + 1}`),
      kind: normalizeEnum(record.kind, ['labour', 'plant'] as const) ?? 'labour',
      description: normalizeText(record.description) || 'crew member',
      count,
      assumptionStatus: normalizeEnum(record.assumptionStatus, ['sourced', 'scenario', 'unverified'] as const) ?? 'unverified',
      sourceRefs: normalizeSourceRefs(record.sourceRefs),
    }];
  }) : [];
  const scenarios = Array.isArray(input.scenarios) ? input.scenarios.flatMap((scenario, index) => {
    if (!scenario || typeof scenario !== 'object') return [];
    const record = scenario as Record<string, unknown>;
    const name = normalizeEnum(record.scenario, ['optimistic', 'base', 'pessimistic'] as const);
    const productionRate = normalizeBoqPricingDecimal(record.productionRate);
    let effectiveFactor = normalizeBoqPricingWeight(record.effectiveFactor);
    if (effectiveFactor !== undefined && effectiveFactor !== record.effectiveFactor) {
      warn(`scenarios[${index}].effectiveFactor coerced ${JSON.stringify(record.effectiveFactor)} → ${effectiveFactor}`);
    }
    if (effectiveFactor !== undefined && Number(effectiveFactor) === 0) {
      warn(`scenarios[${index}].effectiveFactor 0 is invalid; dropped scenario`);
      return [];
    }
    if (!name || productionRate === undefined || effectiveFactor === undefined) {
      warn(`scenarios[${index}] dropped: scenario name, productionRate, or effectiveFactor invalid`);
      return [];
    }
    return [{
      scenario: name,
      productionRate,
      quantityUnit: normalizeText(record.quantityUnit) || 'unit',
      timeUnit: normalizeTimeUnit(record.timeUnit) ?? 'working_day',
      effectiveFactor,
      basis: normalizeText(record.basis) || 'scenario basis',
      assumptionStatus: normalizeEnum(record.assumptionStatus, ['sourced', 'scenario', 'unverified'] as const) ?? 'scenario',
      sourceRefs: normalizeSourceRefs(record.sourceRefs),
    }];
  }) : [];
  const workingHoursPerDay = normalizeBoqPricingDecimal(input.workingHoursPerDay);
  const theoreticalProductionRate = normalizeBoqPricingDecimal(input.theoreticalProductionRate);
  if (workingHoursPerDay === undefined || theoreticalProductionRate === undefined) {
    warn('productivityBasis dropped: workingHoursPerDay or theoreticalProductionRate not numeric');
    return undefined;
  }
  return {
    methodSequence: normalizeStringArray(input.methodSequence),
    crew,
    workingHoursPerDay,
    bottleneck: normalizeText(input.bottleneck) || 'not stated',
    theoreticalProductionRate,
    calculationFormula: normalizeText(input.calculationFormula) || 'not stated',
    scenarios,
  };
}

function normalizeResourceCoverage(value: unknown, warn: (message: string) => void): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const kind = normalizeEnum(record.kind, ['labour', 'plant', 'material', 'subcontract', 'transport', 'waste'] as const);
    if (!kind) {
      warn(`resourceCoverage[${index}] dropped: unknown kind`);
      return [];
    }
    return [{
      kind,
      applicability: normalizeEnum(record.applicability, ['included', 'not_applicable'] as const) ?? 'included',
      basis: normalizeText(record.basis) || 'not stated',
    }];
  });
  return entries;
}

function normalizeResourceConsumptions(value: unknown, warn: (message: string) => void): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const quantity = normalizeBoqPricingDecimal(record.quantity);
    if (quantity === undefined) {
      warn(`resourceConsumptions[${index}] dropped: quantity not numeric`);
      return [];
    }
    return [{
      id: normalizeId(record.id, `resource-${index + 1}`),
      kind: normalizeEnum(record.kind, ['labour', 'plant', 'material', 'subcontract', 'transport', 'waste', 'other'] as const) ?? 'other',
      description: normalizeText(record.description) || 'resource',
      quantity,
      unit: normalizeText(record.unit) || 'unit',
      assumptionStatus: normalizeEnum(record.assumptionStatus, ['sourced', 'scenario', 'unverified'] as const) ?? 'unverified',
      quantityBasis: 'per_boq_unit',
      ...(normalizeText(record.calculationBasis) ? { calculationBasis: normalizeText(record.calculationBasis) } : {}),
      ...(normalizeId(record.costComponentId) ? { costComponentId: normalizeId(record.costComponentId) } : {}),
      sourceRefs: normalizeSourceRefs(record.sourceRefs),
    }];
  });
}

function normalizePlanningBasis(value: unknown, warn: (message: string) => void): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  const productionRate = normalizeBoqPricingDecimal(input.productionRate);
  const duration = normalizeBoqPricingDecimal(input.duration);
  if (productionRate === undefined || duration === undefined) {
    warn('planningBasis dropped: productionRate or duration not numeric');
    return undefined;
  }
  return {
    methodId: normalizeId(input.methodId, 'method-1'),
    productionRate,
    quantityUnit: normalizeText(input.quantityUnit) || 'unit',
    timeUnit: normalizeTimeUnit(input.timeUnit) ?? 'working_day',
    duration,
    calendarId: normalizeId(input.calendarId, 'calendar-1'),
    activityId: normalizeId(input.activityId, 'activity-1'),
    assumptionStatus: normalizeEnum(input.assumptionStatus, ['sourced', 'scenario', 'unverified'] as const) ?? 'unverified',
    sourceRefs: normalizeSourceRefs(input.sourceRefs),
  };
}

function normalizeCashFlow(value: unknown, warn: (message: string) => void): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const weight = normalizeBoqPricingWeight(record.weight);
    const amount = normalizeBoqPricingDecimal(record.amount);
    const period = typeof record.period === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(record.period) ? record.period : undefined;
    if (weight === undefined || amount === undefined || !period) {
      warn(`initialCashFlow[${index}] dropped: period, weight, or amount invalid`);
      return [];
    }
    return [{
      period,
      activityId: normalizeId(record.activityId, 'activity-1'),
      weight,
      amount,
      basis: normalizeText(record.basis) || 'not stated',
      assumptionStatus: normalizeEnum(record.assumptionStatus, ['sourced', 'scenario', 'unverified'] as const) ?? 'unverified',
      sourceRefs: normalizeSourceRefs(record.sourceRefs),
    }];
  });
}

function normalizeCostComponents(value: unknown, warn: (message: string) => void): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const quantity = normalizeBoqPricingDecimal(record.quantity);
    const rate = normalizeBoqPricingDecimal(record.rate);
    let amount = normalizeBoqPricingDecimal(record.amount);
    if (quantity === undefined || rate === undefined) {
      warn(`costComponents[${index}] dropped: quantity or rate not numeric`);
      return [];
    }
    if (amount === undefined) {
      amount = multiplyDecimals(quantity, rate);
      warn(`costComponents[${index}].amount recomputed as quantity × rate = ${amount}`);
    }
    const component: Record<string, unknown> = {
      id: normalizeId(record.id, `component-${index + 1}`),
      kind: normalizeEnum(record.kind, ['labour', 'plant', 'material', 'subcontract', 'transport', 'waste', 'other'] as const) ?? 'other',
      description: normalizeText(record.description) || 'cost component',
      quantity,
      unit: normalizeText(record.unit) || 'unit',
      rate,
      amount,
      assumptionStatus: normalizeEnum(record.assumptionStatus, ['sourced', 'scenario', 'unverified'] as const) ?? 'unverified',
    };
    const rateSourceRef = normalizeSourceRef(record.rateSourceRef);
    if (rateSourceRef) component.rateSourceRef = rateSourceRef;
    const rateBasis = normalizeRateBasis(record.rateBasis, warn, index);
    if (rateBasis) component.rateBasis = rateBasis;
    return [component];
  });
}

function normalizeRateBasis(
  value: unknown,
  warn: (message: string) => void,
  componentIndex: number,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  const sourceType = normalizeEnum(input.sourceType, [
    'supplier_quote', 'historical_purchase', 'internal_ledger', 'published_schedule',
    'rental_quote', 'owned_cost_model', 'subcontract_quote', 'market_evidence', 'scenario',
  ] as const);
  const effectiveDate = normalizeDate(input.effectiveDate);
  if (!sourceType || !effectiveDate) {
    warn(`costComponents[${componentIndex}].rateBasis dropped: sourceType or effectiveDate invalid`);
    return undefined;
  }
  const basis: Record<string, unknown> = {
    sourceType,
    acquisitionMode: normalizeEnum(input.acquisitionMode, ['owned', 'rented', 'purchased', 'subcontracted', 'internal_transfer', 'not_applicable'] as const) ?? 'not_applicable',
    location: normalizeText(input.location) || 'unspecified',
    effectiveDate,
    vatTreatment: 'exclusive',
  };
  const evidence = Array.isArray(input.webEvidence) ? input.webEvidence.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.url !== 'string' || !/^https?:\/\//i.test(record.url)) return [];
    return [{
      url: record.url,
      ...(normalizeText(record.title) ? { title: normalizeText(record.title) } : {}),
      accessedAt: normalizeDate(record.accessedAt) ?? new Date().toISOString().slice(0, 10),
      ...(normalizeText(record.note) ? { note: normalizeText(record.note) } : {}),
    }];
  }) : [];
  if (evidence.length > 0) basis.webEvidence = evidence;
  return basis;
}

function normalizeDirectCostSummary(value: unknown, warn: (message: string) => void): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  const fields = ['labour', 'plant', 'material', 'subcontract', 'transport', 'waste', 'other', 'unitDirectCost', 'boqQuantity', 'itemDirectCost'];
  const summary: Record<string, unknown> = {};
  for (const field of fields) {
    const decimal = normalizeBoqPricingDecimal(input[field]);
    if (decimal === undefined) {
      warn(`directCostSummary dropped: ${field} not numeric`);
      return undefined;
    }
    summary[field] = decimal;
  }
  return summary;
}

function normalizeRiskScenarios(value: unknown, warn: (message: string) => void): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (!normalizeText(record.variable)) {
      warn(`riskScenarios[${index}] dropped: variable missing`);
      return [];
    }
    return [{
      id: normalizeId(record.id, `risk-${index + 1}`),
      variable: normalizeText(record.variable),
      optimistic: normalizeText(record.optimistic) || 'not stated',
      base: normalizeText(record.base) || 'not stated',
      pessimistic: normalizeText(record.pessimistic) || 'not stated',
      trigger: normalizeText(record.trigger) || 'not stated',
      treatment: normalizeText(record.treatment) || 'not stated',
      assumptionStatus: normalizeEnum(record.assumptionStatus, ['sourced', 'scenario', 'unverified'] as const) ?? 'unverified',
      sourceRefs: normalizeSourceRefs(record.sourceRefs),
    }];
  });
}

function normalizeCurrency(value: unknown, warnings: string[]): string | undefined {
  if (typeof value !== 'string') return undefined;
  const code = value.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) return code;
  const map: Record<string, string> = { RAND: 'ZAR', RANDS: 'ZAR', R: 'ZAR', DOLLAR: 'USD', DOLLARS: 'USD' };
  const mapped = map[code];
  if (mapped) {
    warnings.push(`currency coerced ${value} → ${mapped}`);
    return mapped;
  }
  return undefined;
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  if (typeof value !== 'string') return undefined;
  const lowered = value.trim().toLowerCase();
  return allowed.find((candidate) => candidate === lowered);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter((entry) => entry.length > 0);
}

function normalizeId(value: unknown, fallback?: string): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  const candidate = text || fallback || '';
  if (!candidate) return undefined;
  const slug = candidate.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, ENTITY_ID_MAX);
  return /^[a-z0-9]/.test(slug) ? slug : `id-${slug || '1'}`;
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

function canonicalDecimal(text: string): string {
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [intPartRaw, fracPartRaw] = unsigned.split('.');
  const intPart = (intPartRaw ?? '0').replace(/^0+(?=\d)/, '') || '0';
  const fracPart = (fracPartRaw ?? '').replace(/0+$/, '');
  const result = fracPart ? `${intPart}.${fracPart}` : intPart;
  return negative && result !== '0' ? `-${result}` : result;
}

function divideByHundred(decimal: string): string {
  const value = Number(decimal) / 100;
  return canonicalDecimal(String(value));
}

function multiplyDecimals(left: string, right: string): string {
  const product = Number(left) * Number(right);
  return canonicalDecimal(String(product));
}

function assignOptional(output: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) return;
  output[key] = value;
}

function firstIssueMessages(error: unknown, limit: number): string {
  const issues = (error as { issues?: Array<{ path: (string | number)[]; message: string }> })?.issues;
  if (!Array.isArray(issues) || issues.length === 0) {
    return error instanceof Error ? error.message.split('\n')[0]! : String(error);
  }
  const shown = issues.slice(0, limit).map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  const rest = issues.length - shown.length;
  return rest > 0 ? `${shown.join('; ')} (+${rest} more)` : shown.join('; ');
}
