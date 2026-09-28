// Presentation copy for built-in capabilities. User-defined capability text is
// project content and must remain exactly as its author supplied it.
const ENGLISH_CAPABILITIES = {
  'tender:full-analysis': ['Full tender document analysis', 'Locate source text and cover all pages, tables, drawings, attachments, addenda, measurement rules, scoring and submission requirements'],
  'tender:item-derivation': ['BOQ item cost and resource derivation', 'Reconcile scope and measurement, methods, productivity, resource consumption and prices item by item'],
  'tender:execution-plan': ['Tender execution planning', 'Develop a detailed plan from actual work packages, resources and project conditions'],
  'tender:returnables': ['Tender returnables and forms', 'Prepare submissions against the actual returnables list, scoring criteria and templates'],
  'delivery:drawing': ['Construction drawing review', 'Identify drawing numbers, revisions, units, elements and construction constraints'],
  'delivery:quantity': ['Quantity takeoff', 'Link drawing locations, elements, calculations, units, deductions and BOQ scope'],
  'delivery:method': ['Project method statement', 'Describe site conditions, work steps, resource assumptions, inspections and exception handling'],
  'investment:research': ['Professional research and decision report', 'Investigate and assess the current question, location, date and audience'],
}

export function localizeCapability(row, locale) {
  if (String(locale || '').toLowerCase().startsWith('zh')) return row
  const copy = ENGLISH_CAPABILITIES[row.id]
  return copy ? { ...row, title: copy[0], description: copy[1] } : row
}
