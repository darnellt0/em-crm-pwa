import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import EmailProvider from "next-auth/providers/email";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    EmailProvider({
      server: {
        host: process.env.SMTP_HOST || "localhost",
        port: Number(process.env.SMTP_PORT) || 1025,
        auth: undefined, // MailHog doesn't require auth
      },
      from: process.env.EMAIL_FROM || "Elevated Movements <no-reply@localhost>",
      sendVerificationRequest: async ({ identifier: email, url, provider }) => {
        const transport = nodemailer.createTransport({
          host: provider.server.host as string,
          port: provider.server.port as number,
          secure: false,
          tls: { rejectUnauthorized: false },
        });

        await transport.sendMail({
          to: email,
          from: provider.from,
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
    strategy: "database",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as any).id = user.id;
        // Always read role from DB so any role change takes effect immediately.
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        (session.user as any).role = dbUser?.role || "staff";
      }
      return session;
    },
  },
  events: {
    /**
     * Fired by the PrismaAdapter immediately after the User row is inserted.
     *
     * Role assignment strategy (source of truth: prisma/seed.ts):
     *   - Darnell and Shria are created as `admin` by `pnpm db:seed` before
     *     they ever sign in, so their rows already have the correct role.
     *   - Any user who signs in for the first time and was NOT pre-seeded
     *     defaults to `staff`.
     *
     * We do NOT use in-memory properties (e.g. __pendingRole) because the
     * `user` object passed to this event is a fresh DB-sourced object
     * constructed by the PrismaAdapter — transient properties set on the
     * `user` object in `signIn` are not propagated here and cannot be
     * relied upon.
     */
    async createUser({ user }) {
      // The PrismaAdapter creates the user with no role field set (or the
      // Prisma default). Explicitly set `staff` for any new unseeded user so
      // the role is always an explicit, known value rather than relying on a
      // DB default that could change.
      if (user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: "staff" },
        });
      }
    },
  },
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
  },
};
