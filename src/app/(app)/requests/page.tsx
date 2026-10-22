import { Inbox } from "lucide-react";
import { requireUser } from "@/lib/auth/session";

export default async function RequestsPage() {
  const user = await requireUser();
  const firstName = user.name.split(/\s+/)[0] || "there";

  return (
    <div className="mx-auto grid max-w-4xl gap-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Hello, {firstName}</h1>
        <p className="text-muted-foreground">
          Your procurement requests and the quotes coming back on them.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted">
          <Inbox className="size-5 text-muted-foreground" />
        </span>
        <p className="font-medium">No requests yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your requests will show up here, each with the suppliers found and every quote
          received.
        </p>
      </div>
    </div>
  );
}
