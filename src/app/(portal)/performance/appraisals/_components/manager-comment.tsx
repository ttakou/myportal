import type { Appraisal } from "@/types/appraisal";

/**
 * The line manager's comment for this cycle, shown to the employee.
 *
 * The manager records it at the review step of each phase, and the employee's
 * sign-off in the step after is meant to say they have read it — which only
 * works if it is somewhere they will actually see it. It sits under the
 * objectives, with the work it is about.
 */
export function ManagerComment({ appraisal }: { appraisal: Appraisal }) {
  const comment = appraisal.manager_summary?.trim();
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">Line manager comments</h2>
      {comment ? (
        <p className="mt-2 whitespace-pre-wrap text-sm">{comment}</p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing yet. Your line manager writes this at the review step of each phase, and you
          confirm you have read it at the sign-off that follows.
        </p>
      )}
    </section>
  );
}
