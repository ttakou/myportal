import { NextResponse, type NextRequest } from "next/server";
import { getAccess } from "@/lib/auth";
import {
  getManifestById,
  getRoomAllocationAsOf,
  getRoster,
  getRotationReport,
} from "@/lib/offshore";

const today = () => new Date().toISOString().slice(0, 10);

function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

function csvResponse(filename: string, rows: (string | number | null | undefined)[][]) {
  // BOM so Excel reads UTF-8 correctly.
  const body = "﻿" + toCsv(rows);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** CSV/Excel export for the offshore reports. */
export async function GET(req: NextRequest) {
  const access = await getAccess();
  if (!access.isAdmin && !access.isSafetyAdmin && !access.isOim) {
    return new NextResponse("Not authorized", { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");

  if (type === "roster") {
    const roster = await getRoster();
    const rows: (string | number | null)[][] = [
      ["Name", "Crew", "Company", "Default room", "Bed", "Muster", "Back-to-back", "Medical", "BOSIET", "HUET", "Travel eligible"],
    ];
    for (const m of roster)
      rows.push([
        m.full_name || m.email, m.crew_name, m.company, m.fixed_room_label, m.fixed_bed,
        m.lifeboat, m.back_to_back_name, m.medical_expiry, m.bosiet_expiry, m.huet_expiry,
        m.travel_eligible ? "yes" : "no",
      ]);
    return csvResponse(`offshore-roster-${today()}.csv`, rows);
  }

  if (type === "rooms") {
    const date = sp.get("date") || today();
    const report = await getRoomAllocationAsOf(date);
    const rows: (string | number | null)[][] = [
      ["Room", "Installation", "Muster", "Beds", "Occupied", "Bed", "Occupant", "Category", "Default owners"],
    ];
    for (const r of report.rooms) {
      const owners = r.owners.map((o) => o.name + (o.back_to_back ? ` <> ${o.back_to_back}` : "")).join("; ");
      if (r.occupants.length === 0) {
        rows.push([r.label, r.installation, r.lifeboat, r.beds, 0, "", "", "", owners]);
      } else {
        r.occupants.forEach((o, i) =>
          rows.push([r.label, r.installation, r.lifeboat, r.beds, r.occupants.length, o.bed_no, o.name, o.category, i === 0 ? owners : ""]),
        );
      }
    }
    return csvResponse(`room-allocation-${date}.csv`, rows);
  }

  if (type === "rotation") {
    const from = sp.get("from") || today();
    const weeks = Math.max(1, Math.min(26, Number(sp.get("weeks")) || 8));
    const report = await getRotationReport(from, weeks);
    const rows: (string | number | null)[][] = [["Crew", "Pattern", "Back-to-back", "Member #", "Member"]];
    for (const c of report.crews) {
      const pattern = `${c.offshore_days}/${c.onshore_days}`;
      if (c.members.length === 0) rows.push([c.name, pattern, c.back_to_back, "", ""]);
      else c.members.forEach((m, i) => rows.push([c.name, pattern, c.back_to_back, i + 1, m]));
    }
    return csvResponse(`rotation-${from}-${weeks}w.csv`, rows);
  }

  if (type === "manifest") {
    const id = sp.get("id");
    if (!id) return new NextResponse("Missing manifest id", { status: 400 });
    const m = await getManifestById(id);
    if (!m) return new NextResponse("Manifest not found", { status: 404 });
    const rows: (string | number | null)[][] = [
      ["Manifest", m.title],
      ["Installation", m.installation_name],
      ["Direction", m.direction],
      ["Transport", m.transport_mode],
      ["Scheduled", m.scheduled_date],
      ["Seats", m.seat_capacity],
      [],
      ["#", "Name", "Position", "Status", "Remarks"],
    ];
    m.pax.forEach((p, i) =>
      rows.push([i + 1, p.person_name, p.position, p.no_show ? "No-show" : p.boarded ? "Boarded" : "Booked", p.issues.join("; ")]),
    );
    return csvResponse(`manifest-${m.scheduled_date}.csv`, rows);
  }

  return new NextResponse("Unknown export type", { status: 400 });
}
