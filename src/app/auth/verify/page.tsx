"use client";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function VerifyRequestPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-purple-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
            <Mail className="h-7 w-7 text-violet-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Check your email
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-gray-600">
            A sign-in link has been sent to your email address.
          </p>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 text-left space-y-1">
            <p className="font-semibold">Running locally?</p>
            <p>
              MailHog catches all outgoing emails. Open{" "}
              <a
                href="http://localhost:8025"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                http://localhost:8025
              </a>{" "}
              to find your magic link.
            </p>
          </div>
          <Button variant="outline" asChild className="w-full">
            <Link href="/auth/signin">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
