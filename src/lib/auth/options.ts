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
        // Fetch role from DB
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        (session.user as any).role = dbUser?.role || "staff";
      }
      return session;
    },
    async signIn({ user }) {
      // Multi-user Day 1 role assignment
      if (user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true, role: true },
        });

        if (!existingUser) {
          // New user — check how many users exist
          const userCount = await prisma.user.count();
          let assignRole: "admin" | "partner_admin" | "staff" = "staff";

          if (userCount === 0) {
            // First user ever → admin
            assignRole = "admin";
          } else if (userCount === 1) {
            // Second distinct user → partner_admin
            assignRole = "partner_admin";
          }

          // The adapter will create the user; we update role after creation
          // We use a setTimeout trick since the adapter creates the user in the same transaction
          setTimeout(async () => {
            try {
              await prisma.user.updateMany({
                where: { email: user.email! },
                data: { role: assignRole },
              });
            } catch (e) {
              console.error("Failed to assign role:", e);
            }
          }, 500);
        }
      }
      return true;
    },
  },
  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
  },
};
