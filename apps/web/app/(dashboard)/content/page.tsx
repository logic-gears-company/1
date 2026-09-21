"use client";

import { useState } from "react";
import {
  FileText, Mail, Twitter, Linkedin, Code2, BookOpen,
  Sparkles, Copy, Check, Loader2, ChevronDown, RefreshCw,
  Megaphone, ShoppingBag, PenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { sileo } from "sileo";

// ─── Types & constants ────────────────────────────────────────────────────────

interface ContentTemplate {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
  fields: Field[];
  prompt: (data: Record<string, string>) => string;
}

interface Field {
  id: string;
  label: string;
  placeholder: string;
  type: "text" | "textarea" | "select";
  options?: string[];
}

const TONES = ["Professional", "Casual", "Friendly", "Authoritative", "Humorous", "Empathetic"];
const LENGTHS = ["Short (100 words)", "Medium (300 words)", "Long (600 words)", "Detailed (1000+ words)"];

const TEMPLATES: ContentTemplate[] = [
  {
    id: "blog",
    label: "Blog Post",
    icon: FileText,
    description: "SEO-optimised blog articles with structure",
    color: "text-blue-500",
    fields: [
      { id: "topic", label: "Topic / Title", placeholder: "e.g. How to build a RAG pipeline in Python", type: "text" },
      { id: "audience", label: "Target Audience", placeholder: "e.g. Software developers with Python experience", type: "text" },
      { id: "tone", label: "Tone", placeholder: "", type: "select", options: TONES },
      { id: "length", label: "Length", placeholder: "", type: "select", options: LENGTHS },
      { id: "keywords", label: "SEO Keywords (comma-separated)", placeholder: "e.g. RAG, LangChain, embeddings", type: "text" },
    ],
    prompt: (d) =>
      `Write a ${d.length} blog post titled "${d.topic}" for ${d.audience}. Tone: ${d.tone}. Include an introduction, 3-5 sections with headers, practical examples, and a conclusion. Naturally include these SEO keywords: ${d.keywords}. Format in Markdown.`,
  },
  {
    id: "email",
    label: "Email",
    icon: Mail,
    description: "Professional emails for any situation",
    color: "text-green-500",
    fields: [
      { id: "type", label: "Email Type", placeholder: "", type: "select", options: ["Cold Outreach", "Follow-up", "Newsletter", "Product Launch", "Welcome Email", "Apology"] },
      { id: "recipient", label: "Recipient / Role", placeholder: "e.g. SaaS founders", type: "text" },
      { id: "goal", label: "Goal", placeholder: "e.g. Schedule a product demo", type: "text" },
      { id: "context", label: "Key Context", placeholder: "What makes this email relevant?", type: "textarea" },
      { id: "tone", label: "Tone", placeholder: "", type: "select", options: TONES },
    ],
    prompt: (d) =>
      `Write a ${d.type} email to ${d.recipient}. Goal: ${d.goal}. Context: ${d.context}. Tone: ${d.tone}. Include a compelling subject line, personalized opening, clear value proposition, and a specific CTA. Keep it concise.`,
  },
  {
    id: "twitter",
    label: "Twitter/X Thread",
    icon: Twitter,
    description: "Engaging threads that drive engagement",
    color: "text-sky-500",
    fields: [
      { id: "topic", label: "Thread Topic", placeholder: "e.g. 10 lessons from building a SaaS product", type: "text" },
      { id: "tweets", label: "Number of Tweets", placeholder: "", type: "select", options: ["5 tweets", "8 tweets", "10 tweets", "15 tweets"] },
      { id: "audience", label: "Target Audience", placeholder: "e.g. startup founders", type: "text" },
      { id: "hook", label: "Hook Angle", placeholder: "e.g. personal story, shocking statistic", type: "text" },
    ],
    prompt: (d) =>
      `Write a Twitter/X thread of ${d.tweets} about "${d.topic}" for ${d.audience}. Start with a powerful hook using ${d.hook}. Each tweet max 280 chars. Number each tweet. End with a CTA. Make it shareable and value-packed.`,
  },
  {
    id: "linkedin",
    label: "LinkedIn Post",
    icon: Linkedin,
    description: "Thought leadership posts for professionals",
    color: "text-blue-700",
    fields: [
      { id: "topic", label: "Post Topic", placeholder: "e.g. Why I left my corporate job to build a startup", type: "text" },
      { id: "format", label: "Post Format", placeholder: "", type: "select", options: ["Personal Story", "Lessons Learned", "Industry Insight", "How-to Guide", "Controversial Opinion"] },
      { id: "achievement", label: "Key Point / Achievement", placeholder: "e.g. Grew to $10k MRR in 3 months", type: "text" },
    ],
    prompt: (d) =>
      `Write a compelling LinkedIn post about "${d.topic}" in ${d.format} format. Key achievement/point: ${d.achievement}. Use line breaks for readability, start with a hook, include 3-5 insights, end with a question to drive comments. Include relevant hashtags.`,
  },
  {
    id: "marketing",
    label: "Marketing Copy",
    icon: Megaphone,
    description: "Landing pages, ads, and product copy",
    color: "text-orange-500",
    fields: [
      { id: "product", label: "Product / Service", placeholder: "e.g. AI-powered CRM for small businesses", type: "text" },
      { id: "type", label: "Copy Type", placeholder: "", type: "select", options: ["Landing Page Hero", "Google Ad", "Facebook Ad", "Product Description", "Tagline / Slogan", "Value Proposition"] },
      { id: "audience", label: "Target Customer", placeholder: "e.g. Small business owners frustrated with manual data entry", type: "textarea" },
      { id: "benefit", label: "Primary Benefit", placeholder: "e.g. Save 5 hours per week on admin tasks", type: "text" },
    ],
    prompt: (d) =>
      `Write ${d.type} copy for: ${d.product}. Target customer: ${d.audience}. Primary benefit: ${d.benefit}. Use proven copywriting frameworks (AIDA, PAS, or FAB). Focus on benefits over features. Include a strong CTA. Be specific and compelling.`,
  },
  {
    id: "product",
    label: "Product Description",
    icon: ShoppingBag,
    description: "Convert browsers to buyers with great copy",
    color: "text-purple-500",
    fields: [
      { id: "product", label: "Product Name", placeholder: "e.g. Smart Standing Desk Pro", type: "text" },
      { id: "features", label: "Key Features", placeholder: "e.g. Height adjustable, USB-C charging, memory presets", type: "textarea" },
      { id: "audience", label: "Target Buyer", placeholder: "e.g. Remote workers who care about ergonomics", type: "text" },
      { id: "price", label: "Price Point", placeholder: "e.g. Premium ($499)", type: "text" },
    ],
    prompt: (d) =>
      `Write a product description for "${d.product}" priced at ${d.price} targeted at ${d.audience}. Features: ${d.features}. Write a compelling headline, 2-3 sentence description focusing on benefits, bullet points for key features, and a persuasive closing statement. Make it conversion-focused.`,
  },
  {
    id: "docs",
    label: "Documentation",
    icon: BookOpen,
    description: "Clear technical docs and README files",
    color: "text-yellow-500",
    fields: [
      { id: "product", label: "Product / Feature", placeholder: "e.g. Authentication API", type: "text" },
      { id: "type", label: "Doc Type", placeholder: "", type: "select", options: ["README", "API Reference", "Getting Started Guide", "Tutorial", "Release Notes"] },
      { id: "audience", label: "Audience", placeholder: "e.g. developers familiar with REST APIs", type: "text" },
      { id: "details", label: "Key Details to Cover", placeholder: "e.g. OAuth2 flow, JWT tokens, refresh tokens", type: "textarea" },
    ],
    prompt: (d) =>
      `Write ${d.type} documentation for "${d.product}" targeting ${d.audience}. Cover: ${d.details}. Include code examples in relevant languages, clear headings, step-by-step instructions where applicable, and common troubleshooting tips. Format in Markdown.`,
  },
  {
    id: "code",
    label: "Code Comments",
    icon: Code2,
    description: "Auto-generate docstrings and inline comments",
    color: "text-emerald-500",
    fields: [
      { id: "language", label: "Language", placeholder: "", type: "select", options: ["Python", "TypeScript", "JavaScript", "Go", "Rust", "Java"] },
      { id: "code", label: "Code to Document", placeholder: "Paste your code here…", type: "textarea" },
      { id: "style", label: "Comment Style", placeholder: "", type: "select", options: ["Detailed docstrings", "Inline comments", "JSDoc/TSDoc", "Google style", "Brief comments"] },
    ],
    prompt: (d) =>
      `Add ${d.style} to this ${d.language} code. Be concise but complete. Explain the WHY not just the WHAT. For functions, document parameters, return values, and any exceptions.\n\n\`\`\`${d.language.toLowerCase()}\n${d.code}\n\`\`\``,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const [selected, setSelected] = useState<ContentTemplate>(TEMPLATES[0]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tone, setTone] = useState("Professional");

  function setField(id: string, value: string) {
    setFields((prev) => ({ ...prev, [id]: value }));
  }

  function selectTemplate(tpl: ContentTemplate) {
    setSelected(tpl);
    setFields({});
    setOutput("");
  }

  async function generate() {
    const missing = selected.fields.filter((f) => f.type !== "select" && !fields[f.id]);
    if (missing.length > 0) { sileo.error({ title: `Fill in: ${missing.map(f => f.label).join(", ")}` }); return; }

    setGenerating(true);
    setOutput("");

    const data: Record<string, string> = {};
    for (const f of selected.fields) {
      data[f.id] = fields[f.id] ?? (f.options?.[0] ?? "");
    }
    const prompt = selected.prompt(data);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          model: "gpt-4o-mini",
          provider: "openai",
          systemPrompt: "You are an expert copywriter and content creator. Generate high-quality, engaging content exactly as requested. Return only the content itself, no meta-commentary.",
          temperature: 0.8,
        }),
      });

      if (!res.ok) throw new Error("Content generation failed. Check your OpenAI API key.");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n").filter(Boolean)) {
          if (line.startsWith("0:")) {
            try { full += JSON.parse(line.slice(2)); setOutput(full); } catch {}
          }
        }
      }
    } catch (err) {
      sileo.error({ title: (err as Error).message });
    } finally {
      setGenerating(false);
    }
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar — template picker */}
      <div className="w-56 border-r bg-muted/10 overflow-y-auto flex-shrink-0 p-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-3">
          Content Types
        </p>
        {TEMPLATES.map((tpl) => {
          const Icon = tpl.icon;
          return (
            <button
              key={tpl.id}
              onClick={() => selectTemplate(tpl)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors",
                selected.id === tpl.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4 flex-shrink-0", selected.id === tpl.id ? "text-primary" : tpl.color)} />
              {tpl.label}
            </button>
          );
        })}
      </div>

      {/* Main — form + output */}
      <div className="flex-1 flex overflow-hidden">
        {/* Input form */}
        <div className="w-80 border-r overflow-y-auto p-5 space-y-5 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <selected.icon className={cn("h-5 w-5", selected.color)} />
              <h2 className="font-semibold">{selected.label}</h2>
            </div>
            <p className="text-xs text-muted-foreground">{selected.description}</p>
          </div>

          {selected.fields.map((field) => (
            <div key={field.id} className="space-y-1.5">
              <Label htmlFor={field.id}>{field.label}</Label>
              {field.type === "select" ? (
                <Select
                  value={fields[field.id] ?? field.options?.[0] ?? ""}
                  onValueChange={(v) => setField(field.id, v)}
                >
                  <SelectTrigger id={field.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === "textarea" ? (
                <Textarea
                  id={field.id}
                  rows={3}
                  value={fields[field.id] ?? ""}
                  onChange={(e) => setField(field.id, e.target.value)}
                  placeholder={field.placeholder}
                />
              ) : (
                <input
                  id={field.id}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  value={fields[field.id] ?? ""}
                  onChange={(e) => setField(field.id, e.target.value)}
                  placeholder={field.placeholder}
                />
              )}
            </div>
          ))}

          <Button className="w-full" onClick={generate} disabled={generating}>
            {generating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />Generate</>
            )}
          </Button>
        </div>

        {/* Output panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <div className="flex items-center gap-2 text-sm">
              <PenLine className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Output</span>
              {output && (
                <span className="text-xs text-muted-foreground">
                  · {output.split(" ").length} words
                </span>
              )}
            </div>
            {output && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setOutput(""); generate(); }} disabled={generating}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Regenerate
                </Button>
                <Button variant="ghost" size="sm" onClick={copyOutput}>
                  {copied ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {!output && !generating ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <selected.icon className={cn("h-8 w-8", selected.color)} />
                </div>
                <p className="font-medium text-foreground mb-1">Ready to generate</p>
                <p className="text-sm max-w-xs">
                  Fill in the fields on the left and click <strong>Generate</strong> to create your content.
                </p>
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-transparent border-none p-0 m-0">
                  {output}
                  {generating && (
                    <span className="inline-block h-4 w-0.5 bg-primary ml-0.5 animate-pulse align-middle" />
                  )}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
