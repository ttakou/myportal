"use client";

import { useEffect } from "react";

/**
 * Root-level error boundary. It replaces the whole document (including the root
 * layout), so global styles aren't available — everything here is inline.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          padding: "0 16px",
          textAlign: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          color: "#1f2937",
          background: "#ffffff",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 64,
            height: 64,
            borderRadius: "9999px",
            background: "#fee2e2",
            color: "#b91c1c",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          !
        </div>
        <div style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
            The application hit an unexpected error and couldn&apos;t continue. Please try again.
            {error.digest ? ` Reference: ${error.digest}.` : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            height: 40,
            padding: "0 20px",
            borderRadius: 6,
            border: "none",
            background: "#dc2626",
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
