import { parse } from "csv-parse/sync";

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

export function parseCsvRecords(csvText: string): ParsedCsv {
  const records = parse(csvText, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];

  const [rawHeaders = [], ...dataRows] = records;
  const headers = rawHeaders.map((header) => header.trim());

  // Rows are keyed by header name, so duplicate headers would silently drop
  // every column but the last one (e.g. two "Phone" columns). Refuse loudly.
  const seen = new Set<string>();
  for (const header of headers) {
    if (header && seen.has(header)) {
      throw new Error(
        `Duplicate column header "${header}" — rename one of the columns so no data is silently dropped`
      );
    }
    seen.add(header);
  }

  const rows = dataRows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]))
  );

  return { headers, rows };
}
