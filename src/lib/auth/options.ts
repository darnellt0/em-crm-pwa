import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import EmailProvider from "next-auth/providers/email";
import { prisma } from "@/lib/db/prisma";
import {
  createSmtpTransport,
  readEmailFrom,
  readSmtpConfig,
} from "@/lib/email/smtp";
import {
  canSignInWithEmail,
  getConfiguredRole,
  isEmailAllowed,
  normalizeEmail,
} from "@/lib/auth/accessPolicy";

const smtpServer = readSmtpConfig();
const emailFrom = readEmailFrom();

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    EmailProvider({
      server: smtpServer,
      from: emailFrom,
      sendVerificationRequest: async ({ identifier: email, url }) => {
        if (!isEmailAllowed(email)) {
          throw new Error("EMAIL_NOT_ALLOWED");
        }

        const transport = createSmtpTransport(smtpServer);
        try {
          await transport.sendMail({
            to: email,
            from: emailFrom,
            subject: "Sign in to Elevated Movements CRM",
            text: `Sign in to EM CRM:\n\n${url}\n\n`,
            html: `
              <div style="max-width: 480px; margin: 0 auto; font-family: sans-serif;">
                <h2 style="color: #6d28d9;">Elevated Movements CRM</h2>
                <p>Click the link below to sign in:</p>
                <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #6d28d9; color: white; text-decoration: none; border-radius: 6px;">
                  Sign In
                </a>
                <p style="color: #666; font-size: 12px; margin-top: 24px;">
                  If you didn't request this, you can safely ignore this email.
                </p>
              </div>
            `,
          });
        } finally {
          transport.close();
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
      return canSignInWithEmail(user.email);
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as any).id = token.sub;
        // Always read role from DB so any role change takes effect immediately.
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true },
        });
        (session.user as any).role = dbUser?.role || "staff";
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id && user.email) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            email: normalizeEmail(user.email),
            role: getConfiguredRole(user.email),
          },
        });
      }
    },
  },
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
  },
};
