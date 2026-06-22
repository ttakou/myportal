"use client";

import { useState } from "react";
import { Send, MessageSquare, Clock, CheckCircle2 } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContinuousActivity } from "@/types/continuous";
import type { DirectoryEntry } from "@/lib/continuous";
import { requestFeedback, respondToFeedback } from "../continuous-activity-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function FeedbackPanel({
  requests,
  responses,
  directory,
  myId,
  allowAnonymous,
  inAppraisal,
}: {
  requests: ContinuousActivity[];
  responses: ContinuousActivity[];
  directory: DirectoryEntry[];
  myId: string;
  allowAnonymous: boolean;
  inAppraisal: boolean;
}) {
  const colleagues = directory.filter((d) => d.id !== myId);
  const nameById = new Map(directory.map((d) => [d.id, d.name]));
  const [subjectId, setSubjectId] = useState(myId);
  const [askId, setAskId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const incoming = requests.filter((r) => r.counterpartId === myId && r.status === "pending");
  const sent = requests.filter((r) => r.authorId === myId);
  const aboutMe = responses.filter((r) => r.subjectId === myId);

  function ask() {
    setError(null);
    if (!askId) {
      setError("Pick a colleague to ask.");
      return;
    }
    startTransition(async () => {
      const res = await requestFeedback({ subjectId, askId, prompt });
      if (!res.ok) {
        setError(res.error ?? "Couldn't send.");
        return;
      }
      setAskId("");
      setPrompt("");
    });
  }

  return (
    <div className="space-y-4">
      {/* Request feedback */}
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <label className="text-xs text-muted-foreground">
            About
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={cn(field, "mt-0.5 block w-48 py-1.5")}>
              <option value={myId}>Myself</option>
              {colleagues.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Ask
            <select value={askId} onChange={(e) => setAskId(e.target.value)} className={cn(field, "mt-0.5 block w-48 py-1.5")}>
              <option value="">Choose a colleague…</option>
              {colleagues.filter((d) => d.id !== subjectId).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
        </div>
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What would you like feedback on? (optional)" className={cn(field, "block w-full py-1.5")} />
        <div className="flex justify-end">
          <Button size="sm" disabled={pending} onClick={ask}>
            <Send className="h-4 w-4" /> Request feedback
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Requests addressed to me */}
      {incoming.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Feedback requested from you</h3>
          <ul className="space-y-2">
            {incoming.map((r) => (
              <RespondCard
                key={r.id}
                request={r}
                aboutName={r.subjectId === myId ? "you" : nameById.get(r.subjectId) ?? "a colleague"}
                fromName={r.authorName ?? "Someone"}
                allowAnonymous={allowAnonymous}
                disabled={pending}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Feedback I've received */}
      {aboutMe.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Feedback about you</h3>
          <ul className="space-y-2">
            {aboutMe.map((r) => (
              <li key={r.id} className="rounded-lg border bg-card p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {r.authorName ?? "Anonymous"}
                  {" · "}
                  {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}
                  {inAppraisal && r.inAppraisal && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px]">in appraisal</span>
                  )}
                </p>
                {r.body && <p className="mt-0.5 text-sm">{r.body}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Requests I've sent */}
      {sent.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Requests you've sent</h3>
          <ul className="space-y-1.5">
            {sent.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                {r.status === "answered" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}
                <span>
                  {nameById.get(r.counterpartId ?? "") ?? "Colleague"} ·{" "}
                  {r.subjectId === myId ? "about you" : `about ${nameById.get(r.subjectId) ?? "a colleague"}`}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RespondCard({
  request,
  aboutName,
  fromName,
  allowAnonymous,
  disabled,
}: {
  request: ContinuousActivity;
  aboutName: string;
  fromName: string;
  allowAnonymous: boolean;
  disabled: boolean;
}) {
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [pending, startTransition] = useStatusTransition("Sending…");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function send() {
    setError(null);
    startTransition(async () => {
      const res = await respondToFeedback({ requestId: request.id, body, anonymous });
      if (!res.ok) setError(res.error ?? "Couldn't send.");
      else setDone(true);
    });
  }

  if (done) {
    return (
      <li className="rounded-lg border bg-card p-3 text-sm text-green-700">
        <CheckCircle2 className="mr-1 inline h-4 w-4" /> Feedback sent.
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">
        {fromName} asked for feedback about {aboutName}
        {request.body ? ` — "${request.body}"` : ""}
      </p>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your feedback…" rows={2} className={cn(field, "block w-full")} />
      <div className="flex items-center justify-between gap-2">
        {allowAnonymous ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4" />
            Send anonymously
          </label>
        ) : (
          <span />
        )}
        <Button size="sm" disabled={pending || disabled} onClick={send}>
          <Send className="h-4 w-4" /> Send feedback
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </li>
  );
}
