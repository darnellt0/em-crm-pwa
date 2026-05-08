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
        // Fetch role from DB on every session read
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        (session.user as any).role = dbUser?.role || "staff";
      }
      return session;
    },
    async signIn({ user }) {
      // Role assignment for new users.
      // We check AFTER the adapter has already written the user row (this callback
      // fires after the user record exists), so no setTimeout is needed.
      if (user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: { id: true, role: true },
        });

        if (existingUser && existingUser.role === "staff") {
          // Only auto-promote if still on the default "staff" role.
          // Seeded users (admin/partner_admin) are left untouched.
          const userCount = await prisma.user.count();
          let assignRole: "admin" | "partner_admin" | "staff" | null = null;

          if (userCount === 1) {
            // This is the very first user in the system → admin
            assignRole = "admin";
          } else if (userCount === 2) {
            // Second user → partner_admin
            assignRole = "partner_admin";
          }

          if (assignRole) {
            await prisma.user.update({
              where: { id: existingUser.id },
              data: { role: assignRole },
            });
          }
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
