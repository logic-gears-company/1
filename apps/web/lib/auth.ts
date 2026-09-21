import NextAuth, { CredentialsSignin } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@ai-saas/database";
import { compare } from "bcryptjs";
import type { DefaultSession } from "next-auth";
import { sendAccountAlert } from "@/lib/verification";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      stripeCustomerId?: string | null;
    } & DefaultSession["user"];
  }
  interface User {
    role: string;
    stripeCustomerId?: string | null;
  }
}

// Código propio para distinguir "no verificado" de "credenciales
// inválidas" en el cliente — NextAuth solo expone `error.type` al
// componente que llama a signIn(), así que el mensaje puntual para este
// caso lo arma el formulario de login leyendo este código.
class EmailNotVerifiedError extends CredentialsSignin {
  code = "email_not_verified";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  // Detrás de ngrok (o cualquier proxy) el header Host que Next.js ve por
  // dentro no es necesariamente el dominio público por el que entró el
  // navegador. Sin esto, Auth.js puede rechazar la request entera con
  // "UntrustedHost" — normalmente pasa desapercibido en `next dev` pero es
  // más estricto en el build de producción (`next start`).
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
    verifyRequest: "/verify-email",
  },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Google siempre verifica el correo antes de emitirlo, así que
            // vincular automáticamente por email es seguro aquí: evita el
            // error "OAuthAccountNotLinked" cuando alguien se registró
            // primero con contraseña y luego intenta entrar con Google
            // usando el mismo correo.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [GitHub({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET })]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.passwordHash) return null;

        const isValid = await compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) return null;

        // La contraseña es correcta pero el correo nunca fue confirmado:
        // se rechaza el login con un error específico en vez de un `null`
        // genérico, para que el formulario pueda ofrecer "reenviar
        // verificación" en lugar de "contraseña incorrecta".
        if (!user.emailVerified) {
          throw new EmailNotVerifiedError();
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          stripeCustomerId: user.stripeCustomerId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.stripeCustomerId = user.stripeCustomerId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.stripeCustomerId = token.stripeCustomerId as string | null;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Auto-assign free plan on registration
      const freePlan = await prisma.plan.findFirst({
        where: { tier: "FREE" },
      });
      if (freePlan) {
        await prisma.subscription.create({
          data: {
            userId: user.id!,
            planId: freePlan.id,
            status: "ACTIVE",
            billingInterval: "MONTHLY",
          },
        });
      }
    },
    async linkAccount({ user }) {
      // Se dispara tanto para un User nuevo creado vía OAuth como para
      // vincular Google a un User que ya existía (por ejemplo, alguien que
      // se había registrado por contraseña y nunca verificó). En ambos
      // casos, si el email no estaba confirmado, Google acaba de
      // confirmarlo implícitamente — así que es el punto correcto para
      // avisarle al dueño real de esa dirección, igual que se hace al
      // consumir el link de verificación por contraseña.
      if (!user.id || !user.email) return;

      // updateMany en vez de findUnique+update: la condición
      // emailVerified:null va DENTRO del where de la escritura, no en una
      // lectura previa separada. Así, si linkAccount se dispara dos veces
      // casi al mismo tiempo (doble submit, re-render), Postgres garantiza
      // que como mucho una de las dos consultas encuentre la fila todavía
      // en null y la actualice — la otra, al llegar después, ya no
      // encuentra ninguna fila que cumpla la condición. `count` dice con
      // certeza cuál de las dos (si alguna) fue la que realmente verificó,
      // sin la ventana de carrera de leer-decidir-escribir en pasos separados.
      const result = await prisma.user.updateMany({
        where: { id: user.id, emailVerified: null },
        data: { emailVerified: new Date() },
      });

      if (result.count > 0) {
        await sendAccountAlert(user.id, user.email);
      }
    },
  },
});
