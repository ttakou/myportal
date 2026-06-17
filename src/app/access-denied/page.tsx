import Link from "next/link";
import { ShieldX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default async function AccessDeniedPage(
  props: {
    searchParams: Promise<{ module?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const moduleName = searchParams.module;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <ShieldX className="h-16 w-16 text-destructive" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Access Denied</h1>
        <p className="max-w-md text-muted-foreground">
          {moduleName ? (
            <>
              Your organization is not subscribed to the{" "}
              <span className="font-medium">{moduleName}</span> module. If you
              believe this is a mistake, contact your administrator.
            </>
          ) : (
            "You don't have permission to access this page."
          )}
        </p>
      </div>
      <Link href="/dashboard" className={buttonVariants()}>
        Back to Dashboard
      </Link>
    </div>
  );
}
