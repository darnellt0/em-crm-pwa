import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import EmailProvider from "next-auth/providers/email";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db/prisma";
import {
  getConfiguredRole,
  isEmailAllowed,
  normalizeEmail,
} from "@/lib/auth/accessPolicy";

const smtpPort = Number(process.env.SMTP_PORT) || 1025;
const smtpUser = process.env.SMTP_USER?.trim();
const smtpPassword = process.env.SMTP_PASSWORD;
const smtpServer = {
  host: process.env.SMTP_HOST || "127.0.0.1",
  port: smtpPort,
  secure: process.env.SMTP_SECURE === "true" || smtpPort === 465,
  auth:
    smtpUser && smtpPassword
      ? { user: smtpUser, pass: smtpPassword }
      : undefined,
};

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    EmailProvider({
      server: smtpServer,
      from: process.env.EMAIL_FROM || "Elevated Movements <no-reply@localhost>",
      sendVerificationRequest: async ({ identifier: email, url, provider }) => {
        if (!isEmailAllowed(email)) {
          throw new Error("EMAIL_NOT_ALLOWED");
        }

        const server = (
          typeof provider.server === "string"
            ? {
                host: process.env.SMTP_HOST || "127.0.0.1",
                port: smtpPort,
                secure: smtpServer.secure,
                auth: smtpServer.auth,
              }
            : provider.server
        ) as typeof smtpServer;

        const transport = nodemailer.createTransport({
          host: server.host,
          port: server.port,
          secure: server.secure,
          auth: server.auth,
        });

        await transport.sendMail({
          to: email,
          from: process.env.EMAIL_FROM || "Elevated Movements <no-reply@localhost>",
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
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email || !isEmailAllowed(user.email)) return false;

      if (user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            email: normalizeEmail(user.email),
          },
        });
      }
      return true;
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
