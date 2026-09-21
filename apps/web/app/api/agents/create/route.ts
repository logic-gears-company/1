import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ai-saas/database";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().max(4000).optional(),
  model: z.string().default("gpt-4o-mini"),
  tools: z.array(z.string()).default([]),
  maxIterations: z.number().int().min(1).max(20).default(6),
  temperature: z.number().min(0).max(2).default(0.7),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, description, systemPrompt, model, tools, maxIterations, temperature } = parsed.data;

  const workflow = await prisma.agentWorkflow.create({
    data: {
      userId: session.user.id,
      name,
      description: description ?? null,
      status: "ACTIVE",
      definition: { model, maxIterations, temperature, systemPrompt: systemPrompt ?? "" },
      enabledTools: tools,
    },
  });

  return NextResponse.json({ data: workflow }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflows = await prisma.agentWorkflow.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { runs: true } },
      runs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, createdAt: true } },
    },
  });

  return NextResponse.json({ data: workflows });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.agentWorkflow.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ success: true });
}
