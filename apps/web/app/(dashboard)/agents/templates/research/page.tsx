"use client";

import { useState } from "react";
import { ArrowLeft, Play, Square, Search, Globe, CheckCircle2, XCircle, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AgentStep {
  id: string;
  type: "thought" | "tool_call" | "tool_result" | "response";
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  timestamp: string;
  status?: "running" | "done" | "error";
}

const EXAMPLE_TOPICS = [
  "Latest breakthroughs in quantum computing 2025",
  "Top AI models released in the last 6 months",
  "Best practices for building RAG pipelines",
  "Comparison of vector databases for production use",
];

export default function ResearchAgentPage() {
  const [topic, setTopic] = useState("");
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [finalReport, setFinalReport] = useState("");
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  function toggleStep(id: string) {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runAgent() {
    if (!topic.trim() || isRunning) return;
    setIsRunning(true);
    setSteps([]);
    setFinalReport("");

    const addStep = (step: Omit<AgentStep, "id" | "timestamp">) => {
      const newStep: AgentStep = {
        ...step,
        id: Math.random().toString(36).slice(2),
        timestamp: new Date().toLocaleTimeString(),
      };
      setSteps((prev) => [...prev, newStep]);
      return newStep.id;
    };

    try {
      // Step 1 — Planning
      addStep({
        type: "thought",
        content: `Planning research on: "${topic}"\n\nI'll search for recent information, analyze multiple sources, and synthesize a comprehensive report.`,
        status: "done",
      });

      await delay(600);

      // Step 2 — Search call
      const searchId = addStep({
        type: "tool_call",
        content: `Searching for recent information about "${topic}"`,
        toolName: "web_search",
        toolInput: { query: topic },
        status: "running",
      });

      await delay(1200);

      // Step 2 result (simulated)
      setSteps((prev) =>
        prev.map((s) =>
          s.id === searchId ? { ...s, status: "done" as const } : s
        )
      );
      addStep({
        type: "tool_result",
        toolName: "web_search",
        content: JSON.stringify(
          [
            {
              title: `${topic} — Overview and Latest Developments`,
              url: "https://example.com/article-1",
              snippet: "Recent advances have shown significant progress in this area, with multiple research groups publishing breakthrough results...",
            },
            {
              title: `A Comprehensive Guide to ${topic}`,
              url: "https://example.com/article-2",
              snippet: "This guide covers the fundamental concepts and latest innovations, including practical applications and implementation strategies...",
            },
            {
              title: `${topic}: Industry Applications and Future Outlook`,
              url: "https://example.com/article-3",
              snippet: "Industry leaders are increasingly adopting these technologies, with projected market growth of 40% over the next two years...",
            },
          ],
          null,
          2
        ),
        status: "done",
      });

      await delay(800);

      // Step 3 — Second search
      const search2Id = addStep({
        type: "tool_call",
        content: `Searching for technical details and expert opinions`,
        toolName: "web_search",
        toolInput: { query: `${topic} technical implementation best practices` },
        status: "running",
      });

      await delay(1000);

      setSteps((prev) =>
        prev.map((s) =>
          s.id === search2Id ? { ...s, status: "done" as const } : s
        )
      );
      addStep({
        type: "tool_result",
        toolName: "web_search",
        content: JSON.stringify(
          [
            {
              title: "Expert Analysis and Technical Deep Dive",
              url: "https://example.com/article-4",
              snippet: "Technical experts highlight three key challenges: scalability, accuracy, and cost. Solutions include hybrid approaches...",
            },
          ],
          null,
          2
        ),
        status: "done",
      });

      await delay(600);

      // Step 4 — Synthesizing
      addStep({
        type: "thought",
        content:
          "I have gathered sufficient information from multiple sources. Now synthesizing a comprehensive research report...",
        status: "done",
      });

      await delay(1500);

      // Final report
      const report = generateReport(topic);
      setFinalReport(report);
      addStep({
        type: "response",
        content: report,
        status: "done",
      });
    } catch (err) {
      addStep({
        type: "response",
        content: `Research failed: ${(err as Error).message}`,
        status: "error",
      });
    } finally {
      setIsRunning(false);
    }
  }

  async function copyReport() {
    await navigator.clipboard.writeText(finalReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const stepsDone = steps.filter((s) => s.status === "done").length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b bg-background">
        <Link href="/agents" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔍</span>
          <div>
            <h1 className="font-semibold">Research Agent</h1>
            <p className="text-xs text-muted-foreground">
              Searches the web and synthesizes a structured report on any topic
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isRunning && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="h-2 w-2 bg-yellow-500 rounded-full animate-pulse" />
              Running · {stepsDone} steps completed
            </span>
          )}
          {!isRunning && steps.length > 0 && (
            <span className="text-xs text-green-500 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed in {stepsDone} steps
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: input + config */}
        <div className="w-72 border-r bg-muted/10 p-5 space-y-5 overflow-y-auto flex-shrink-0">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block">
              Research Topic
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={4}
              placeholder="What do you want to research?"
              className="w-full text-sm rounded-md border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Examples */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Examples
            </p>
            <div className="space-y-1.5">
              {EXAMPLE_TOPICS.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setTopic(ex)}
                  className="w-full text-left text-xs px-3 py-2 rounded-md border bg-background hover:border-primary/50 hover:bg-accent transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Tools used */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Tools
            </p>
            <div className="space-y-1.5">
              {[
                { icon: Globe, name: "web_search", desc: "Search the web for sources" },
                { icon: Search, name: "summarizer", desc: "Condense and synthesize findings" },
              ].map(({ icon: Icon, name, desc }) => (
                <div
                  key={name}
                  className="flex items-start gap-2 px-3 py-2 rounded-md bg-background border"
                >
                  <Icon className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-mono font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button
            className="w-full"
            onClick={runAgent}
            disabled={!topic.trim() || isRunning}
          >
            {isRunning ? (
              <>
                <Square className="h-4 w-4 mr-2 fill-current" />
                Running…
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Research Agent
              </>
            )}
          </Button>
        </div>

        {/* Right: execution trace + report */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {steps.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl mb-5">
                🔍
              </div>
              <h2 className="font-semibold text-lg mb-2">Ready to research</h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Enter a topic on the left and click{" "}
                <strong>Run Research Agent</strong>. The agent will search
                multiple sources and generate a structured report.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {/* Execution steps */}
              {steps
                .filter((s) => s.type !== "response")
                .map((step) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    expanded={expandedSteps.has(step.id)}
                    onToggle={() => toggleStep(step.id)}
                  />
                ))}

              {/* Final report */}
              {finalReport && (
                <div className="rounded-xl border bg-card overflow-hidden mt-4">
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-sm">Research Report</span>
                    </div>
                    <button
                      onClick={copyReport}
                      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <div className="p-5 prose prose-sm dark:prose-invert max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                      {finalReport}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepCard({
  step,
  expanded,
  onToggle,
}: {
  step: AgentStep;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isToolCall = step.type === "tool_call";
  const isToolResult = step.type === "tool_result";
  const isThought = step.type === "thought";

  const icon = isToolCall ? (
    <Globe className="h-3.5 w-3.5 text-blue-500" />
  ) : isToolResult ? (
    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
  ) : (
    <Search className="h-3.5 w-3.5 text-purple-500" />
  );

  const label = isToolCall
    ? `Tool call: ${step.toolName}`
    : isToolResult
    ? `Tool result: ${step.toolName}`
    : "Thought";

  const bgClass = isToolCall
    ? "border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20"
    : isToolResult
    ? "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20"
    : "border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20";

  return (
    <div className={cn("rounded-lg border overflow-hidden", bgClass)}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        {step.status === "running" ? (
          <span className="h-3.5 w-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin flex-shrink-0" />
        ) : (
          <span className="flex-shrink-0">{icon}</span>
        )}
        <span className="text-xs font-medium flex-1">{label}</span>
        <span className="text-xs text-muted-foreground">{step.timestamp}</span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t">
          <pre className="text-xs mt-2 whitespace-pre-wrap font-mono text-muted-foreground overflow-x-auto max-h-48">
            {step.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function generateReport(topic: string): string {
  return `# Research Report: ${topic}

## Executive Summary

This report synthesizes findings from multiple authoritative sources on "${topic}". The research covers current developments, key challenges, technical approaches, and future outlook.

---

## Key Findings

### 1. Current State of the Field
Recent developments in ${topic} have shown significant progress, with multiple research groups and industry leaders publishing breakthrough results. The field has matured considerably, moving from experimental prototypes to production-ready implementations.

### 2. Technical Approaches
Several competing approaches have emerged:
- **Approach A**: Focuses on scalability and cost efficiency, suitable for large-scale deployments
- **Approach B**: Prioritizes accuracy and precision, ideal for high-stakes applications
- **Hybrid Methods**: Combining multiple techniques to balance trade-offs

### 3. Practical Applications
Organizations are increasingly adopting these technologies across:
- Enterprise automation and workflow optimization
- Research acceleration and knowledge discovery
- Customer experience enhancement
- Decision support systems

### 4. Key Challenges
The main obstacles identified include:
- **Scalability**: Handling growing data volumes while maintaining performance
- **Cost**: Balancing capability with operational expenses
- **Integration**: Connecting with existing infrastructure and workflows
- **Quality**: Ensuring consistent output reliability

---

## Industry Trends

Market analysis indicates 40% projected growth over the next 24 months. Key drivers include:
1. Decreasing implementation costs
2. Improved developer tooling
3. Growing ecosystem of pre-built components
4. Increasing enterprise adoption

---

## Recommendations

Based on the research:

1. **Start small**: Begin with a pilot project to validate assumptions
2. **Choose established frameworks**: Reduce risk by using battle-tested solutions
3. **Monitor closely**: Implement observability from day one
4. **Iterate rapidly**: Plan for multiple improvement cycles

---

## Sources Consulted

1. Recent academic publications (2024–2025)
2. Industry analyst reports
3. Technical documentation from leading practitioners
4. Expert blog posts and conference proceedings

---

*Report generated by Research Agent · ${new Date().toLocaleDateString()}*`;
}
