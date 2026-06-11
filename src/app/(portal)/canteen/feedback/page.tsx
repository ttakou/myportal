import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { getAllFeedback, getMyFeedback } from "@/lib/canteen-feedback";
import { FeedbackBoard } from "./_components/feedback-board";

export default async function FeedbackPage() {
  const isAdmin = isAdminRole(await getCurrentRole());
  const [mine, all] = await Promise.all([
    getMyFeedback(),
    isAdmin ? getAllFeedback() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/canteen" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Canteen
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Feedback &amp; incidents</h1>
        <p className="text-muted-foreground">Rate meals and report issues.</p>
      </div>
      <FeedbackBoard mine={mine} all={all} isAdmin={isAdmin} />
    </div>
  );
}
