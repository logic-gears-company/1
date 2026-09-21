import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@ai-saas/database";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runs = await prisma.agentRun.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      workflow: { select: { name: true } },
    },
  });

  return NextResponse.json({ data: runs });
}
