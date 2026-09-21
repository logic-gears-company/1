import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "API Keys" };

export default async function ApiKeysPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">
            Manage API keys for programmatic access.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          + Create API Key
        </button>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="p-6 border-b">
          <h2 className="font-semibold">Your API Keys</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Keep your API keys secret. They grant full access to your account.
          </p>
        </div>
        <div className="p-6">
          <p className="text-sm text-muted-foreground text-center py-8">
            No API keys yet. Create one to get started.
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-4">Example Usage</h2>
        <pre className="bg-muted rounded-lg p-4 text-sm font-mono overflow-x-auto">
{`curl https://api.yourdomain.com/api/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello!", "model": "gpt-4o-mini"}'`}
        </pre>
      </div>
    </div>
  );
}
