import { prisma } from "../packages/database/src";

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Plans ───────────────────────────────────────────────────────────────
  const freePlan = await prisma.plan.upsert({
    where: { id: "plan_free" },
    update: {},
    create: {
      id: "plan_free",
      name: "Free",
      tier: "FREE",
      description: "Get started with AI for free",
      features: [
        "100 messages / month",
        "1 conversation",
        "3 API keys",
        "Basic models (GPT-4o mini)",
        "Community support",
      ],
      maxTokensPerMonth: 50_000,
      maxMessages: 100,
      maxStorage: BigInt(10 * 1024 * 1024), // 10 MB
      maxTeamMembers: 1,
      maxApiKeys: 3,
      maxConversations: 5,
      sortOrder: 0,
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { id: "plan_pro" },
    update: {},
    create: {
      id: "plan_pro",
      name: "Pro",
      tier: "PRO",
      description: "For individuals and small teams",
      features: [
        "10,000 messages / month",
        "Unlimited conversations",
        "10 API keys",
        "GPT-4o, Claude 3.5 Sonnet",
        "File uploads (50MB)",
        "Knowledge base (RAG)",
        "AI Agents",
        "Priority support",
      ],
      maxTokensPerMonth: 5_000_000,
      maxMessages: 10_000,
      maxStorage: BigInt(1024 * 1024 * 1024), // 1 GB
      maxTeamMembers: 5,
      maxApiKeys: 10,
      maxConversations: 1000,
      customModels: false,
      prioritySupport: true,
      priceMonthly: 29.0,
      priceYearly: 249.0,
      sortOrder: 1,
    },
  });

  const enterprisePlan = await prisma.plan.upsert({
    where: { id: "plan_enterprise" },
    update: {},
    create: {
      id: "plan_enterprise",
      name: "Enterprise",
      tier: "ENTERPRISE",
      description: "For large teams and organizations",
      features: [
        "Unlimited messages",
        "Unlimited conversations",
        "Unlimited API keys",
        "All AI models",
        "Custom model support",
        "Multi-tenant",
        "SSO / SAML",
        "SLA + dedicated support",
        "Audit logs",
        "Custom integrations",
      ],
      maxTokensPerMonth: 2_147_483_647,
      maxMessages: 2_147_483_647,
      maxStorage: BigInt(100 * 1024 * 1024 * 1024), // 100 GB
      maxTeamMembers: 2_147_483_647,
      maxApiKeys: 2_147_483_647,
      maxConversations: 2_147_483_647,
      customModels: true,
      prioritySupport: true,
      priceMonthly: 99.0,
      priceYearly: 999.0,
      sortOrder: 2,
    },
  });

  console.log("✅ Plans created:", [freePlan, proPlan, enterprisePlan].map((p) => p.name));

  // ─── Admin user ───────────────────────────────────────────────────────────
  const { hash } = await import("bcryptjs");
  const adminPasswordHash = await hash("Admin123!", 12);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      id: "user_admin_seed",
      email: "admin@example.com",
      name: "Admin User",
      role: "SUPER_ADMIN",
      passwordHash: adminPasswordHash,
      emailVerified: new Date(),
    },
  });

  // Assign pro plan to admin
  await prisma.subscription.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      planId: proPlan.id,
      status: "ACTIVE",
      billingInterval: "MONTHLY",
    },
  });

  console.log("✅ Admin user created: admin@example.com (password: Admin123!)");

  // ─── Demo user ────────────────────────────────────────────────────────────
  const demoPasswordHash = await hash("Demo1234!", 12);

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      id: "user_demo_seed",
      email: "demo@example.com",
      name: "Demo User",
      role: "USER",
      passwordHash: demoPasswordHash,
      emailVerified: new Date(),
    },
  });

  await prisma.subscription.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      planId: freePlan.id,
      status: "ACTIVE",
      billingInterval: "MONTHLY",
    },
  });

  console.log("✅ Demo user created: demo@example.com (password: Demo1234!)");

  // ─── Feature flags ────────────────────────────────────────────────────────
  await prisma.featureFlag.upsert({
    where: { key: "ai_agents" },
    update: {},
    create: {
      key: "ai_agents",
      name: "AI Agents",
      description: "Enable AI agent workflows",
      enabled: true,
      rolloutPct: 100,
    },
  });

  await prisma.featureFlag.upsert({
    where: { key: "knowledge_base" },
    update: {},
    create: {
      key: "knowledge_base",
      name: "Knowledge Base",
      description: "Enable RAG/document upload features",
      enabled: true,
      rolloutPct: 100,
    },
  });

  console.log("✅ Feature flags seeded");
  console.log("\n🎉 Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
