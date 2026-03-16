export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 animate-pulse">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-muted" />
          <div className="h-4 w-72 rounded bg-muted" />
        </div>
        <div className="h-9 w-28 rounded bg-muted" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-5 space-y-3">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-7 w-20 rounded bg-muted" />
            <div className="h-3 w-32 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="h-8 w-48 rounded bg-muted" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-28 rounded bg-muted" />
              <div className="h-4 w-40 rounded bg-muted flex-1" />
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-4 w-16 rounded bg-muted" />
              <div className="h-6 w-16 rounded-full bg-muted" />
              <div className="h-8 w-8 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
