// Quote every field, neutralise formula prefixes, and preserve Unicode for spreadsheet readers.
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  // eslint-disable-next-line no-control-regex -- spreadsheet control prefixes must be neutralised
  if (/^[\s\u0000]*[=+@-]|^[\t\r\n\u0000]/.test(text)) text = `\t${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function csvReport(data) {
  const rows = [
    [data.report.title],
    ['From', data.period.from, 'To', data.period.to, 'Timezone', data.period.timezone],
    ['Generated at', new Date(data.period.generatedAt).toISOString()],
    ['Basis', data.report.basis],
    ...data.summary.map((metric) => [
      metric.label + (metric.format === 'money' ? ' (LKR)' : ''),
      metric.format === 'money' ? (metric.value / 100).toFixed(2) : metric.value,
    ]),
    [],
    data.columns.map(
      (c) =>
        c.label + (c.format === 'money' ? ' (LKR)' : c.format === 'datetime' ? ' (UTC ISO)' : ''),
    ),
    ...data.records.map((record) =>
      data.columns.map((c) =>
        c.format === 'money'
          ? (record[c.key] / 100).toFixed(2)
          : c.format === 'datetime' && record[c.key]
            ? new Date(record[c.key]).toISOString()
            : record[c.key],
      ),
    ),
  ];
  return '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
