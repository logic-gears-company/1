import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@ai-saas/database";
import { FileText, Upload, Search, Trash2, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Knowledge Base" };

const STATUS_ICON = {
  READY: CheckCircle,
  PROCESSING: Clock,
  UPLOADING: Clock,
  FAILED: AlertCircle,
};

const STATUS_COLOR = {
  READY: "text-green-500",
  PROCESSING: "text-yellow-500",
  UPLOADING: "text-blue-500",
  FAILED: "text-destructive",
};

export default async function FilesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const files = await prisma.file.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  const totalSize = files.reduce(
    (acc: number, f: (typeof files)[number]) => acc + Number(f.size),
    0
  );
  const readyCount = files.filter((f: (typeof files)[number]) => f.status === "READY").length;

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground">
            Upload files to enable AI-powered semantic search and RAG.
          </p>
        </div>
        <Button>
          <Upload className="h-4 w-4 mr-2" />
          Upload File
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Files</p>
          <p className="text-2xl font-bold mt-1">{files.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Indexed</p>
          <p className="text-2xl font-bold mt-1">{readyCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Storage Used</p>
          <p className="text-2xl font-bold mt-1">{formatBytes(totalSize)}</p>
        </div>
      </div>

      {/* File list */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Uploaded Files</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              className="pl-8 pr-3 py-1.5 text-sm rounded-md border bg-background outline-none focus:ring-1 focus:ring-ring w-48"
              placeholder="Search files..."
            />
          </div>
        </div>

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">No files yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              Upload PDFs, CSVs, or documents to create a searchable knowledge
              base for your AI assistant.
            </p>
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Upload your first file
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {files.map((file: (typeof files)[number]) => {
              const StatusIcon = STATUS_ICON[file.status as keyof typeof STATUS_ICON] ?? FileText;
              const statusColor = STATUS_COLOR[file.status as keyof typeof STATUS_COLOR] ?? "text-muted-foreground";
              return (
                <div
                  key={file.id}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(Number(file.size))} · {file.chunkCount ?? 0} chunks
                    </p>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${statusColor}`}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {file.status}
                  </div>
                  <button className="text-muted-foreground hover:text-destructive transition-colors p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Supported formats */}
      <div className="rounded-xl border bg-muted/30 p-4">
        <p className="text-sm font-medium mb-2">Supported formats</p>
        <div className="flex flex-wrap gap-2">
          {["PDF", "DOCX", "TXT", "MD", "CSV"].map((fmt) => (
            <span
              key={fmt}
              className="px-2 py-0.5 rounded bg-background border text-xs font-mono"
            >
              .{fmt.toLowerCase()}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
