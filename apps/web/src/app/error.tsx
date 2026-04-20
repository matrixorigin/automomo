"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="route-state">
      <strong>Could not load automomo state.</strong>
      <button type="button" onClick={reset}>
        Retry
      </button>
    </div>
  );
}
