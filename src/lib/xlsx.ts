/**
 * Minimal .xlsx writer — a real Excel workbook, no dependency.
 *
 * CSV is the usual shortcut, but Excel mangles it: a name containing a comma
 * splits into two columns, an employee number with a leading zero loses it, and
 * a French locale reads the separator differently. A workbook has none of those
 * problems, and an .xlsx is just a ZIP of XML files.
 *
 * The ZIP is written with STORED entries (no compression) so nothing here needs
 * a deflate implementation; Excel reads stored entries perfectly well, and a
 * status report is small enough that the size difference is irrelevant.
 */

export type CellValue = string | number | null | undefined;

export interface Sheet {
  /** Tab name. Excel forbids : \ / ? * [ ] and caps it at 31 characters. */
  name: string;
  /** First row is the header; it is bolded and frozen. */
  rows: CellValue[][];
}

// --- XML -------------------------------------------------------------------

/** Escape text for XML, and strip control characters Excel refuses to open. */
export function escapeXml(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Excel's column letters: 1 → A, 26 → Z, 27 → AA. */
export function columnName(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Excel rejects these characters in a tab name, and truncates past 31. */
export function safeSheetName(name: string): string {
  const cleaned = (name || "Sheet1").replace(/[:\\/?*[\]]/g, " ").trim();
  return (cleaned || "Sheet1").slice(0, 31);
}

function cellXml(value: CellValue, ref: string, isHeader: boolean): string {
  const style = isHeader ? ' s="1"' : "";
  if (value === null || value === undefined || value === "") {
    return `<c r="${ref}"${style}/>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  }
  // Inline strings keep the writer to one pass — no shared-string table to
  // build, and Excel treats them identically.
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

export function sheetXml(rows: CellValue[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => cellXml(v, `${columnName(c + 1)}${r + 1}`, r === 0))
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const width = rows.reduce((max, r) => Math.max(max, r.length), 1);
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    // Freeze the header so it stays put while scrolling a long roster.
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols><col min="1" max="${width}" width="24" customWidth="1"/></cols>` +
    `<sheetData>${body}</sheetData>` +
    "</worksheet>"
  );
}

// --- ZIP -------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: string;
  data: Uint8Array;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}

function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** ZIP archive with stored (uncompressed) entries. */
export function zip(entries: Entry[]): Uint8Array {
  const encoder = new TextEncoder();
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Array.from(encoder.encode(entry.name));
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header
    const header = [
      ...u32(0x04034b50),
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // method: stored
      ...u16(0), // mod time — fixed, so output is byte-identical run to run
      ...u16(0x21), // mod date: 1980-01-01
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0),
      ...nameBytes,
    ];
    local.push(...header, ...Array.from(entry.data));

    central.push(
      ...u32(0x02014b50),
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0x21),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
      ...nameBytes,
    );
    offset += header.length + size;
  }

  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(offset),
    ...u16(0),
  ];

  return Uint8Array.from([...local, ...central, ...end]);
}

// --- Workbook --------------------------------------------------------------

const CONTENT_TYPES = (count: number) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("") +
  "</Types>";

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

// Two formats: index 0 plain, index 1 bold — the header row uses index 1.
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
  '<borders count="1"><border/></borders>' +
  '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
  '<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs>' +
  // Without a named Normal style some readers warn about a missing default.
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

/** Build a workbook. Returns the raw bytes of a .xlsx file. */
export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const list = sheets.length ? sheets : [{ name: "Sheet1", rows: [] }];
  const encoder = new TextEncoder();
  const text = (name: string, body: string) => ({ name, data: encoder.encode(body) });

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    list
      .map(
        (s, i) =>
          `<sheet name="${escapeXml(safeSheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join("") +
    "</sheets></workbook>";

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    list
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    "</Relationships>";

  return zip([
    text("[Content_Types].xml", CONTENT_TYPES(list.length)),
    text("_rels/.rels", ROOT_RELS),
    text("xl/workbook.xml", workbook),
    text("xl/_rels/workbook.xml.rels", workbookRels),
    text("xl/styles.xml", STYLES),
    ...list.map((s, i) => text(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows))),
  ]);
}

/** Filename-safe slug for a download, e.g. "Annual 2026" → "annual-2026". */
export function fileSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "export"
  );
}
