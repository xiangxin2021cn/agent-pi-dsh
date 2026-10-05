export function requireText(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} 必须是非空字符串`);
}

export function requireDate(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} 必须采用 YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} 不是有效日期`);
  }
}

export function requireUniqueIds(rows: readonly { id: string }[], name: string): void {
  const ids = new Set<string>();
  for (const row of rows) {
    requireText(row.id, `${name}.id`);
    if (ids.has(row.id)) throw new Error(`${name} 存在重复编号：${row.id}`);
    ids.add(row.id);
  }
}

export function requireOneOf(value: unknown, allowed: readonly string[], name: string): void {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(`${name} 值无效`);
}
