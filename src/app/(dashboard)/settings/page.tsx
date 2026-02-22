"use client";

import { useSession } from "next-auth/react";
import { useApi, apiPatch } from "@/hooks/useApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Settings, Users, Shield } from "lucide-react";

const ROLES = ["admin", "partner_admin", "staff", "read_only"];

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-800",
  partner_admin: "bg-amber-100 text-amber-800",
  staff: "bg-blue-100 text-blue-800",
  read_only: "bg-gray-100 text-gray-800",
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const isAdmin = userRole === "admin";

  const { data: usersData, loading, refetch } = useApi<any>(
    isAdmin ? "/api/users" : null
  );

  const users = usersData?.users || [];

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await apiPatch("/api/users", { userId, role });
      toast.success("Role updated");
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-muted-foreground">Manage your CRM configuration</p>
      </div>

      {/* Current User Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary text-lg font-semibold">
                {session?.user?.name?.[0] || session?.user?.email?.[0] || "?"}
              </span>
            </div>
            <div>
              <p className="font-medium">{session?.user?.name || "—"}</p>
              <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
            </div>
            <Badge className={roleColors[userRole] || roleColors.staff}>
              {userRole || "staff"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Role Hierarchy Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Role Hierarchy
          </CardTitle>
          <CardDescription>
            Roles determine access levels within the CRM
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <Badge className={roleColors.admin}>admin</Badge>
              <span className="text-muted-foreground">Full access. Can manage users, settings, and all data.</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={roleColors.partner_admin}>partner_admin</Badge>
              <span className="text-muted-foreground">Can manage contacts, tasks, and programs. Cannot manage users.</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={roleColors.staff}>staff</Badge>
              <span className="text-muted-foreground">Can view and edit contacts, log interactions, manage tasks.</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={roleColors.read_only}>read_only</Badge>
              <span className="text-muted-foreground">View-only access to all data.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Management (Admin only) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Management
            </CardTitle>
            <CardDescription>
              Assign roles to team members. Only admins can change roles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 animate-pulse bg-muted rounded" />
                ))}
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users found</p>
            ) : (
              <div className="space-y-3">
                {users.map((u: any) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 p-3 rounded-lg border"
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-xs font-medium">
                        {u.name?.[0] || u.email?.[0] || "?"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {u.name || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email}
                      </p>
                    </div>
                    <Select
                      value={u.role}
                      onValueChange={(role) => handleRoleChange(u.id, role)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isAdmin && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>User management is only available to administrators.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
