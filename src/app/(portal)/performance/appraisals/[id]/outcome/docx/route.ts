import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { getAppraisal } from "@/lib/appraisals";
import { STATUS_LABEL } from "@/types/appraisal";
import type { Appraisal } from "@/types/appraisal";

/** Sanitise a value for a Word filename (no path separators / odd chars). */
function safeName(value: string): string {
  return value.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC" });
}

const GREY = "595959";
const RULE = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" } as const;
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;

/** A small label/value stack used for the summary + acknowledgement fields. */
function fieldCell(label: string, value: string): TableCell {
  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, right: 120 },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: [
      new Paragraph({
        spacing: { after: 20 },
        children: [new TextRun({ text: label.toUpperCase(), bold: true, size: 14, color: GREY })],
      }),
      new Paragraph({ children: [new TextRun({ text: value, size: 20 })] }),
    ],
  });
}

/** Lay out label/value fields in rows of four (mirrors the on-screen grid). */
function fieldGrid(fields: [string, string][]): Table {
  const rows: TableRow[] = [];
  for (let i = 0; i < fields.length; i += 4) {
    const slice = fields.slice(i, i + 4);
    while (slice.length < 4) slice.push(["", ""]);
    rows.push(new TableRow({ children: slice.map(([l, v]) => fieldCell(l, v)) }));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function headerCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    borders: { top: NO_BORDER, bottom: RULE, left: NO_BORDER, right: NO_BORDER },
    children: [
      new Paragraph({ children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 14, color: GREY })] }),
    ],
  });
}

function bodyCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    borders: { top: NO_BORDER, bottom: RULE, left: NO_BORDER, right: NO_BORDER },
    children: [new Paragraph({ children: [new TextRun({ text, size: 20 })] })],
  });
}

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text })],
  });
}

/** Two stacked signature lines (employee + manager) with name and date slots. */
function signatureBlock(employee: string, manager: string): Table {
  const line = (role: string, name: string) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      margins: { top: 240, bottom: 60, right: 200 },
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
      children: [
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } },
          spacing: { after: 40 },
          children: [new TextRun({ text: "", size: 20 })],
        }),
        new Paragraph({
          children: [new TextRun({ text: `${role}: ${name}`, size: 18, color: GREY })],
        }),
        new Paragraph({ children: [new TextRun({ text: "Signature & date", size: 16, color: GREY })] }),
      ],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [line("Employee", employee), line("Manager", manager)] })],
  });
}

function buildDocument(a: Appraisal): Document {
  // Scores are only final once the PGM has signed off in calibration.
  const ratingFinal = a.calibration_gate === "final";
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: "Appraisal outcome" })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: RULE },
      children: [
        new TextRun({
          text: `${a.cycle_name ?? "Appraisal"} · ${STATUS_LABEL[a.status]}`,
          color: GREY,
          size: 22,
        }),
      ],
    }),
    fieldGrid([
      ["Employee", a.employee_name ?? "—"],
      ["Manager", a.manager_name ?? "—"],
      [ratingFinal ? "Final score" : "Preliminary score", a.final_score != null ? String(a.final_score) : "—"],
      [ratingFinal ? "Rating" : "Preliminary rating", a.rating_label ?? "—"],
    ]),
  ];

  if (a.manager_summary) {
    children.push(heading("Manager summary"));
    children.push(new Paragraph({ children: [new TextRun({ text: a.manager_summary, size: 20 })] }));
  }
  if (a.employee_summary) {
    children.push(heading("Employee summary"));
    children.push(new Paragraph({ children: [new TextRun({ text: a.employee_summary, size: 20 })] }));
  }

  if (a.goals.length > 0) {
    children.push(heading("Objectives"));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [headerCell("Objective", 60), headerCell("Weight", 20), headerCell("Rating", 20)],
          }),
          ...a.goals.map(
            (g) =>
              new TableRow({
                children: [
                  bodyCell(g.title, 60),
                  bodyCell(g.weight != null ? `${g.weight}%` : "—", 20),
                  bodyCell(g.manager_rating != null ? String(g.manager_rating) : "—", 20),
                ],
              }),
          ),
        ],
      }),
    );
  }

  if (a.competencies.length > 0) {
    children.push(heading("Competencies"));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [headerCell("Competency", 75), headerCell("Rating", 25)],
          }),
          ...a.competencies.map(
            (c) =>
              new TableRow({
                children: [
                  bodyCell(c.name, 75),
                  bodyCell(c.manager_rating != null ? String(c.manager_rating) : "—", 25),
                ],
              }),
          ),
        ],
      }),
    );
  }

  if (a.development_plan.length > 0) {
    children.push(heading("Development plan"));
    for (const d of a.development_plan) {
      const suffix = d.target_date ? ` (by ${fmtDate(d.target_date)})` : "";
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: d.area, bold: true, size: 20 }),
            new TextRun({ text: `${d.action ? ` — ${d.action}` : ""}${suffix}`, size: 20 }),
          ],
        }),
      );
    }
  }

  children.push(heading("Acknowledgement"));
  children.push(
    fieldGrid([
      ["Discussion date", fmtDate(a.discussion_date)],
      ["Employee agreed", a.employee_agreed == null ? "—" : a.employee_agreed ? "Yes" : "No"],
      ["Acknowledged", fmtDate(a.acknowledged_at)],
    ]),
  );
  if (a.employee_ack_comment) {
    children.push(
      new Paragraph({
        spacing: { before: 80 },
        children: [
          new TextRun({ text: "Employee comment: ", bold: true, size: 20 }),
          new TextRun({ text: a.employee_ack_comment, size: 20 }),
        ],
      }),
    );
  }

  children.push(signatureBlock(a.employee_name ?? "—", a.manager_name ?? "—"));
  children.push(
    new Paragraph({
      spacing: { before: 240 },
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: `Generated ${new Date().toLocaleString("en-GB", { timeZone: "UTC" })} UTC`,
          italics: true,
          size: 16,
          color: GREY,
        }),
      ],
    }),
  );

  return new Document({
    creator: "Performance portal",
    title: `Appraisal outcome — ${a.employee_name ?? ""}`.trim(),
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children,
      },
    ],
  });
}

/** Word (.docx) export of the signed appraisal outcome. RLS in getAppraisal
 *  gates access — an out-of-scope id resolves to null → 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appraisal = await getAppraisal(id);
  if (!appraisal) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = await Packer.toBuffer(buildDocument(appraisal));
  const filename = safeName(
    `appraisal-${appraisal.employee_name ?? "outcome"}-${appraisal.cycle_name ?? ""}`,
  );

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
