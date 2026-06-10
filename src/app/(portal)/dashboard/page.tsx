import { getActiveServices } from "@/lib/services";

export default async function DashboardPage() {
  const services = await getActiveServices();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Modules your organization has access to.
        </p>
      </div>

      {services.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No modules are currently enabled for your organization. Contact your
          administrator.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <a
              key={s.id}
              href={s.route_path}
              className="rounded-lg border bg-card p-5 transition-colors hover:bg-accent"
            >
              <h2 className="font-medium">{s.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {s.description}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
