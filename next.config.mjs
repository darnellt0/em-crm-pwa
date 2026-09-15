/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build candidates separately; never overwrite the running server's assets.
  distDir: process.env.CRM_BUILD_DIR || ".next",
  serverExternalPackages: ["@prisma/client", "nodemailer"],
};

export default nextConfig;
