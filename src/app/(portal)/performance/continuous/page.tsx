import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import {
  getActivitiesByKind,
  getContinuousConfig,
  getDirectory,
  getMyProfileId,
} from "@/lib/continuous";
import {
  CHECK_IN_FREQUENCY_LABEL,
  FEATURE_LABEL,
  type ActivityKind,
  type ContinuousActivity,
} from "@/types/continuous";
import { ActivityPanel } from "../_components/activity-panel";
import { CheckInPanel } from "../_components/check-in-panel";
import { OneToOnePanel } from "../_components/one-to-one-panel";
import { FeedbackPanel } from "../_components/feedback-panel";
import { PulsePanel } from "../_components/pulse-panel";
import { DevelopmentActionsPanel } from "../_components/development-actions-panel";

const BATCH: ActivityKind[] = [
  "recognition",
  "achievement",
  "journal",
  "manager_note",
  "coaching_note",
  "check_in",
  "one_to_one",
  "feedback_request",
  "feedback_response",
  "pulse_response",
  "development_action",
  "goal_update",
];

export default async function ContinuousPage() {
  const myId = await getMyProfileId();
  if (!myId) {
    return <p className="p-8 text-center text-muted-foreground">Please sign in.</p>;
  }

  const [config, directory, items, access] = await Promise.all([
    getContinuousConfig(),
    getDirectory(),
    getActivitiesByKind(BATCH),
    getAccess(),
  ]);

  // Manager-oriented note panels only for those with reports (or HR).
  const supabase = createClient();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", myId);
  const canManage = (count ?? 0) > 0 || access.isHr || access.isSystemAdmin || access.isAdmin;

  const byKind = (k: ActivityKind): ContinuousActivity[] => items.filter((a) => a.kind === k);
  const on = (k: keyof typeof config.enabledFeatures) => config.enabledFeatures[k];

  const sections: { show: boolean; title: string; desc: string; panel: React.ReactNode }[] = [
    {
      show: on("check_in"),
      title: FEATURE_LABEL.check_in,
      desc: "A regular self check-in against your team's questions.",
      panel: (
        <CheckInPanel
          questions={config.checkInTemplate}
          frequencyLabel={CHECK_IN_FREQUENCY_LABEL[config.checkInFrequency]}
          items={byKind("check_in").filter((a) => a.subjectId === myId)}
          myId={myId}
        />
      ),
    },
    {
      show: on("one_to_one"),
      title: FEATURE_LABEL.one_to_one,
      desc: "Log one-to-one meetings with agenda and notes, shared with the other person.",
      panel: <OneToOnePanel items={byKind("one_to_one")} directory={directory} myId={myId} />,
    },
    {
      show: on("feedback"),
      title: FEATURE_LABEL.feedback,
      desc: "Request feedback from colleagues and respond to requests.",
      panel: (
        <FeedbackPanel
          requests={byKind("feedback_request")}
          responses={byKind("feedback_response")}
          directory={directory}
          myId={myId}
          allowAnonymous={config.feedbackAnonymous}
          inAppraisal={config.feedbackInAppraisal}
        />
      ),
    },
    {
      show: on("goal_update"),
      title: FEATURE_LABEL.goal_update,
      desc: "Post lightweight progress updates against your goals between reviews.",
      panel: (
        <ActivityPanel
          kind="goal_update"
          items={byKind("goal_update")}
          directory={directory}
          myId={myId}
          subjectMode="self"
          allowPrivate={false}
          withBadge={false}
          withTitle
          composerCta="Post update"
          placeholder="Which goal, and where does it stand?"
          subjectLabel=""
        />
      ),
    },
    {
      show: on("development_action"),
      title: FEATURE_LABEL.development_action,
      desc: "Track development actions with due dates and completion.",
      panel: <DevelopmentActionsPanel items={byKind("development_action")} myId={myId} />,
    },
    {
      show: on("pulse"),
      title: FEATURE_LABEL.pulse,
      desc: "A quick pulse against your team's questions.",
      panel: <PulsePanel questions={config.pulseQuestions} items={byKind("pulse_response")} myId={myId} />,
    },
    {
      show: on("recognition"),
      title: FEATURE_LABEL.recognition,
      desc: "Recognise a colleague for great work — visible across the team.",
      panel: (
        <ActivityPanel
          kind="recognition"
          items={byKind("recognition")}
          directory={directory}
          myId={myId}
          subjectMode="pick"
          allowPrivate={false}
          withBadge
          withTitle={false}
          composerCta="Give recognition"
          placeholder="Say what they did well…"
          subjectLabel="Recognise"
        />
      ),
    },
    {
      show: on("achievement"),
      title: FEATURE_LABEL.achievement,
      desc: "Record your wins as they happen so nothing is forgotten at review time.",
      panel: (
        <ActivityPanel
          kind="achievement"
          items={byKind("achievement")}
          directory={directory}
          myId={myId}
          subjectMode="self"
          allowPrivate={false}
          withBadge={false}
          withTitle
          composerCta="Record"
          placeholder="What did you achieve, and what was the impact?"
          subjectLabel=""
        />
      ),
    },
    {
      show: on("journal"),
      title: FEATURE_LABEL.journal,
      desc: "A running journal of your work. Mark entries private to keep them to yourself.",
      panel: (
        <ActivityPanel
          kind="journal"
          items={byKind("journal")}
          directory={directory}
          myId={myId}
          subjectMode="self"
          allowPrivate
          withBadge={false}
          withTitle={false}
          composerCta="Add entry"
          placeholder="Reflect on your work…"
          subjectLabel=""
        />
      ),
    },
    {
      show: canManage && on("manager_note"),
      title: FEATURE_LABEL.manager_note,
      desc: config.allowPrivateManagerNotes
        ? "Notes about your people. Private notes aren't visible to the employee."
        : "Notes about your people, visible to them.",
      panel: (
        <ActivityPanel
          kind="manager_note"
          items={byKind("manager_note")}
          directory={directory}
          myId={myId}
          subjectMode="pick"
          allowPrivate={config.allowPrivateManagerNotes}
          withBadge={false}
          withTitle={false}
          composerCta="Add note"
          placeholder="Note about this person…"
          subjectLabel="About"
        />
      ),
    },
    {
      show: canManage && on("coaching_note"),
      title: FEATURE_LABEL.coaching_note,
      desc: "Coaching guidance and follow-ups for the people you support.",
      panel: (
        <ActivityPanel
          kind="coaching_note"
          items={byKind("coaching_note")}
          directory={directory}
          myId={myId}
          subjectMode="pick"
          allowPrivate
          withBadge={false}
          withTitle={false}
          composerCta="Add coaching note"
          placeholder="Coaching guidance…"
          subjectLabel="About"
        />
      ),
    },
  ];

  const visible = sections.filter((s) => s.show);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/performance"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Performance
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Continuous performance</h1>
        <p className="text-muted-foreground">Recognition, achievements, journals and notes between reviews.</p>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No continuous-performance features are switched on.
        </p>
      ) : (
        visible.map((s) => (
          <section key={s.title} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </div>
            {s.panel}
          </section>
        ))
      )}
    </div>
  );
}
