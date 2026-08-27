interface ParsedDecimal {
  coefficient: bigint;
  scale: number;
}

export function sumDeliveryDecimalStrings(values: string[]): string {
  let total: ParsedDecimal = { coefficient: 0n, scale: 0 };
  for (const value of values) total = addDecimals(total, parseDecimal(value));
  return formatDecimal(total);
}

export function deliveryDecimalStringsEqual(left: string, right: string): boolean {
  return formatDecimal(parseDecimal(left)) === formatDecimal(parseDecimal(right));
}

function parseDecimal(value: string): ParsedDecimal {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new Error(`Invalid decimal string: ${value}`);
  const [whole, fraction = ''] = value.split('.');
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function addDecimals(left: ParsedDecimal, right: ParsedDecimal): ParsedDecimal {
  const scale = Math.max(left.scale, right.scale);
  return {
    coefficient: left.coefficient * 10n ** BigInt(scale - left.scale)
      + right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  };
}

function formatDecimal(value: ParsedDecimal): string {
  if (value.coefficient === 0n) return '0';
  let digits = value.coefficient.toString().padStart(value.scale + 1, '0');
  if (value.scale === 0) return digits;
  const split = digits.length - value.scale;
  digits = `${digits.slice(0, split)}.${digits.slice(split)}`.replace(/\.?0+$/, '');
  return digits;
}
