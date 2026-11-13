export function visibleColumnIndices(columns, hidden) {
  const hiddenNames = new Set(Array.isArray(hidden) ? hidden : []);
  const indices = columns.map((_, index) => index);
  const visible = indices.filter((index) => !hiddenNames.has(columns[index]));
  return visible.length ? visible : indices;
}

export function projectReportTable(columns, rows, indices) {
  return {
    columns: indices.map((index) => columns[index]),
    rows: rows.map((row) => indices.map((index) => row[index])),
  };
}

export function spreadsheetText(value) {
  const cell = String(value ?? "");
  return /^[\s]*[=+@-]/.test(cell) && !/^-?\d+(\.\d+)?$/.test(cell) ? `'${cell}` : cell;
}

export const quoteReportCsv = (value) => `"${spreadsheetText(value).replaceAll('"', '""')}"`;
