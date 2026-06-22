import { NextResponse, type NextRequest } from "next/server";
import { getAccess } from "@/lib/auth";
import {
  getManifestById,
  getManifests,
  getMusterDrill,
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
  if (!access.isAdmin && !access.isCampboss && !access.isOim) {
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

  if (type === "manifest-history") {
    const statusFilter = sp.get("status"); // completed | cancelled | null(all)
    const crewFilter = sp.get("crew");
    const dirLabel = (d: string) => (d === "out" ? "Inbound (mobilise)" : "Outbound (demobilise)");
    const manifests = (await getManifests())
      .filter((m) => m.status === "completed" || m.status === "cancelled")
      .filter((m) => !statusFilter || m.status === statusFilter)
      .filter((m) => !crewFilter || m.crew_id === crewFilter);
    const rows: (string | number | null)[][] = [
      [
        "Scheduled date", "Manifest", "Status", "Direction", "Installation", "Crew",
        "Transport", "Seats", "#", "Passenger", "Position", "Pax status", "Remarks",
      ],
    ];
    for (const m of manifests) {
      if (m.pax.length === 0) {
        rows.push([m.scheduled_date, m.title, m.status, dirLabel(m.direction), m.installation_name, m.crew_name, m.transport_mode, m.seat_capacity, "", "", "", "", ""]);
      } else {
        m.pax.forEach((p, i) =>
          rows.push([
            m.scheduled_date, m.title, m.status, dirLabel(m.direction), m.installation_name, m.crew_name,
            m.transport_mode, m.seat_capacity, i + 1, p.person_name, p.position,
            p.no_show ? "No-show" : p.boarded ? "Boarded" : "Booked", p.issues.join("; "),
          ]),
        );
      }
    }
    return csvResponse(`manifest-history-${today()}.csv`, rows);
  }

  if (type === "muster") {
    const id = sp.get("id");
    if (!id) return new NextResponse("Missing drill id", { status: 400 });
    const d = await getMusterDrill(id);
    if (!d) return new NextResponse("Drill not found", { status: 404 });
    const rows: (string | number | null)[][] = [
      ["Muster roll-call", d.kind],
      ["Started", d.started_at],
      ["Ended", d.ended_at],
      [],
      ["Muster", "Name", "Status"],
    ];
    for (const c of [...d.checkins].sort((a, b) => (a.lifeboat ?? "").localeCompare(b.lifeboat ?? "") || a.name.localeCompare(b.name)))
      rows.push([c.lifeboat ?? "Unassigned", c.name, c.accounted ? "Accounted" : "UNACCOUNTED"]);
    return csvResponse(`muster-${d.started_at.slice(0, 10)}.csv`, rows);
  }

  return new NextResponse("Unknown export type", { status: 400 });
}
