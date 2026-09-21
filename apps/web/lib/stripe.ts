import Stripe from "stripe";
import { loadStripe } from "@stripe/stripe-js";

// El cliente Stripe se construye de forma perezosa (no en el top level del
// módulo) para que "next build" no falle durante "Collecting page data".
// Next importa los route handlers para inspeccionar sus exports incluso
// cuando la ruta nunca llega a ejecutarse en build-time; con
// `new Stripe(undefined!)` en el top level, ese solo import ya lanzaba
// "Neither apiKey nor config.authenticator provided".
//
// El Proxy difiere la creación real hasta el primer acceso a una propiedad
// (p. ej. `stripe.webhooks`), momento en el que STRIPE_SECRET_KEY ya está
// disponible en runtime real (dev/producción). Los consumidores actuales
// (`stripe.webhooks.constructEvent(...)`) no cambian ni una línea: `stripe`
// se sigue usando exactamente igual que antes.
let _stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!_stripeClient) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error(
        "STRIPE_SECRET_KEY no está definida. Es requerida en runtime para " +
          "cualquier llamada al cliente de Stripe (no es necesaria solo " +
          "para compilar el proyecto)."
      );
    }
    _stripeClient = new Stripe(apiKey, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return _stripeClient;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripeClient(), prop, receiver);
  },
});

let stripePromise: ReturnType<typeof loadStripe> | null = null;

export function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
}

export interface Plan {
  id: string;
  name: string;
  tier: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  limits: {
    messages: number;
    tokens: number;
    storage: number;
    teamMembers: number;
  };
  popular: boolean;
  priceIdMonthly?: string;
  priceIdYearly?: string;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tier: "FREE",
    description: "Get started with AI for free",
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      "100 messages / month",
      "1 conversation",
      "3 API keys",
      "Basic models",
      "Community support",
    ],
    limits: {
      messages: 100,
      tokens: 50_000,
      storage: 10 * 1024 * 1024, // 10 MB
      teamMembers: 1,
    },
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    tier: "PRO",
    description: "For individuals and small teams",
    priceMonthly: 2900,
    priceYearly: 24900,
    priceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    priceIdYearly: process.env.STRIPE_PRICE_PRO_YEARLY,
    features: [
      "10,000 messages / month",
      "Unlimited conversations",
      "10 API keys",
      "GPT-4o, Claude 3.5",
      "File uploads (50MB)",
      "Knowledge base (RAG)",
      "AI Agents",
      "Priority support",
    ],
    limits: {
      messages: 10_000,
      tokens: 5_000_000,
      storage: 1 * 1024 * 1024 * 1024, // 1 GB
      teamMembers: 5,
    },
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tier: "ENTERPRISE",
    description: "For large teams and organizations",
    priceMonthly: 9900,
    priceYearly: 99900,
    priceIdMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
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
    limits: {
      messages: Infinity,
      tokens: Infinity,
      storage: 100 * 1024 * 1024 * 1024,
      teamMembers: Infinity,
    },
    popular: false,
  },
];
