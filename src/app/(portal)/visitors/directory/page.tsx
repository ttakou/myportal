import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getMyPermissions } from "@/lib/permissions-server";
import { hasPermission } from "@/lib/permissions";
import { getDirectory } from "@/lib/visitors";
import { DirectoryPanel } from "./directory-panel";

/**
 * The visitor directory: everyone who has come to site, how often, and
 * whether they may come again. Security and reception (visitors:operate)
 * and admins.
 */
export default async function VisitorDirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, access, perms] = await Promise.all([searchParams, getAccess(), getMyPermissions()]);
  const canView = access.isAdmin || access.isSystemAdmin || hasPermission(perms, "visitors", "operate");
  if (!canView) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">The visitor directory is available to administrators and security.</p>
        <Link href="/visitors" className="text-sm font-medium text-primary hover:underline">
          ← Back to visitors
        </Link>
      </div>
    );
  }
  const entries = await getDirectory(q ?? "");
  return (
    <div className="space-y-6">
      <div>
        <Link href="/visitors" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Visitors
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Visitor directory</h1>
        <p className="text-muted-foreground">
          Everyone who has come to site, matched on ID number, phone, or name and company. Pre-registration prefills from
          here. Flag a person as do-not-admit and reception cannot register or check them in.
        </p>
      </div>
      <DirectoryPanel entries={entries} query={q ?? ""} />
    </div>
  );
}
