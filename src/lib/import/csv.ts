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
  const rows = dataRows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]))
  );

  return { headers, rows };
}
