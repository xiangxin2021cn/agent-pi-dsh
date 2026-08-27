interface ParsedDecimal {
  coefficient: bigint;
  scale: number;
}

export function multiplyDecimalStrings(left: string, right: string): string {
  const leftValue = parseDecimal(left);
  const rightValue = parseDecimal(right);
  return formatDecimal({
    coefficient: leftValue.coefficient * rightValue.coefficient,
    scale: leftValue.scale + rightValue.scale,
  });
}

export function sumDecimalStrings(values: string[]): string {
  let total: ParsedDecimal = { coefficient: 0n, scale: 0 };
  for (const value of values) total = addDecimals(total, parseDecimal(value));
  return formatDecimal(total);
}

export function decimalStringsEqual(left: string, right: string): boolean {
  return formatDecimal(parseDecimal(left)) === formatDecimal(parseDecimal(right));
}

export function compareDecimalStrings(left: string, right: string): -1 | 0 | 1 {
  const leftValue = parseDecimal(left);
  const rightValue = parseDecimal(right);
  const scale = Math.max(leftValue.scale, rightValue.scale);
  const leftCoefficient = leftValue.coefficient * 10n ** BigInt(scale - leftValue.scale);
  const rightCoefficient = rightValue.coefficient * 10n ** BigInt(scale - rightValue.scale);
  return leftCoefficient < rightCoefficient ? -1 : leftCoefficient > rightCoefficient ? 1 : 0;
}

function parseDecimal(value: string): ParsedDecimal {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new Error(`Invalid decimal string: ${value}`);
  }
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  const coefficient = BigInt(`${whole}${fraction}` || '0') * (negative ? -1n : 1n);
  return { coefficient, scale: fraction.length };
}

function addDecimals(left: ParsedDecimal, right: ParsedDecimal): ParsedDecimal {
  const scale = Math.max(left.scale, right.scale);
  return {
    coefficient:
      left.coefficient * 10n ** BigInt(scale - left.scale)
      + right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  };
}

function formatDecimal(value: ParsedDecimal): string {
  const negative = value.coefficient < 0n;
  const absolute = negative ? -value.coefficient : value.coefficient;
  let digits = absolute.toString().padStart(value.scale + 1, '0');
  if (value.scale > 0) {
    const split = digits.length - value.scale;
    digits = `${digits.slice(0, split)}.${digits.slice(split)}`.replace(/\.?0+$/, '');
  }
  if (digits === '') digits = '0';
  return negative && digits !== '0' ? `-${digits}` : digits;
}
