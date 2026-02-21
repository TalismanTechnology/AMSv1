"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Users,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  MoreHorizontal,
  CheckCircle2,
  ShieldCheck,
  Trash2,
  Copy,
  Check,
  Link,
  KeyRound,
  ShieldAlert,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MagicBentoCard } from "@/components/magic-bento";
import { approveUser, approveAllPending, changeUserRole, deleteUser } from "@/actions/users";
import { toast } from "sonner";
import NextLink from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { Profile } from "@/lib/types";

const GRADES = [
  "Pre-K",
  "Kindergarten",
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "8th",
  "9th",
  "10th",
  "11th",
  "12th",
];

type SortKey = "full_name" | "email" | "role" | "child_grade" | "created_at";
type SortDir = "asc" | "desc";

interface UsersClientProps {
  users: Profile[];
  schoolId: string;
  schoolSlug: string;
  joinCode: string | null;
  requireJoinCode: boolean;
  requireApproval: boolean;
}

export function UsersClient({ users, schoolId, schoolSlug, joinCode, requireJoinCode, requireApproval }: UsersClientProps) {
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [roleChangeUser, setRoleChangeUser] = useState<Profile | null>(null);
  const [changingRole, setChangingRole] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const registrationUrl = `${origin}/s/${schoolSlug}/register`;

  function copyJoinCode() {
    if (!joinCode) return;
    navigator.clipboard.writeText(joinCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  function copyRegistrationLink() {
    navigator.clipboard.writeText(registrationUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  const pendingCount = useMemo(
    () => users.filter((u) => !u.approved).length,
    [users]
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function handleApproveAll() {
    setApprovingAll(true);
    const result = await approveAllPending(schoolId);
    if (result.error) toast.error(result.error);
    else toast.success(`Approved ${result.count} user${result.count !== 1 ? "s" : ""}`);
    setApprovingAll(false);
  }

  async function handleApprove(userId: string) {
    const result = await approveUser(userId, schoolId);
    if (result.error) toast.error(result.error);
    else toast.success("User approved");
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    const result = await deleteUser(deleteId);
    if (result.error) toast.error(result.error);
    else toast.success("User deleted");
    setDeleting(false);
    setDeleteId(null);
  }

  async function handleRoleChange() {
    if (!roleChangeUser) return;
    setChangingRole(true);
    const newRole = roleChangeUser.role === "admin" ? "parent" : "admin";
    const result = await changeUserRole(roleChangeUser.id, newRole, schoolId);
    if (result.error) toast.error(result.error);
    else toast.success(`Role changed to ${newRole}`);
    setChangingRole(false);
    setRoleChangeUser(null);
  }

  const filteredAndSorted = useMemo(() => {
    let result = [...users];

    if (gradeFilter !== "all") {
      result = result.filter((u) => {
        if (u.children && u.children.length > 0) {
          return u.children.some((c) => c.grade === gradeFilter);
        }
        return u.child_grade === gradeFilter;
      });
    }

    result.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      let aVal: string;
      let bVal: string;
      if (sortKey === "child_grade") {
        aVal = a.children?.[0]?.grade ?? a.child_grade ?? "";
        bVal = b.children?.[0]?.grade ?? b.child_grade ?? "";
      } else {
        aVal = (a[sortKey] as string) ?? "";
        bVal = (b[sortKey] as string) ?? "";
      }
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });

    return result;
  }, [users, sortKey, sortDir, gradeFilter]);

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column)
      return (
        <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 text-muted-foreground/70" />
      );
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
    );
  }

  if (users.length === 0) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-foreground">Users</h1>

        <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-12">
          <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground">
            No users registered yet
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Share the registration link below to invite parents.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Parent Onboarding</h2>

          {/* Registration Link */}
          <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-lg">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <Link className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Registration Link</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Share this link with parents to let them create an account.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-muted px-2.5 py-1.5 text-xs">
                    {registrationUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyRegistrationLink}
                    className="shrink-0"
                  >
                    {linkCopied ? (
                      <><Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> Copied</>
                    ) : (
                      <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          </MagicBentoCard>

          {/* Join Code */}
          <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-lg">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Join Code</p>
                  <Badge variant={requireJoinCode ? "default" : "outline"} className="text-[10px]">
                    {requireJoinCode ? "Required" : "Optional"}
                  </Badge>
                </div>
                {joinCode ? (
                  <div className="mt-2 flex items-center gap-2">
                    <code className="rounded bg-muted px-2.5 py-1.5 text-sm font-mono font-semibold tracking-wider">
                      {joinCode}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyJoinCode}
                      className="shrink-0"
                    >
                      {codeCopied ? (
                        <><Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> Copied</>
                      ) : (
                        <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy</>
                      )}
                    </Button>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No join code set.{" "}
                    <NextLink
                      href={`/s/${schoolSlug}/admin/settings`}
                      className="text-primary underline underline-offset-2"
                    >
                      Configure in Settings
                    </NextLink>
                  </p>
                )}
              </div>
            </div>
          </div>
          </MagicBentoCard>

          {/* Approval Setting */}
          <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-lg">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Admin Approval</p>
                  <Badge variant={requireApproval ? "default" : "outline"} className="text-[10px]">
                    {requireApproval ? "Required" : "Off"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {requireApproval
                    ? "New parents will need your approval before they can access the dashboard."
                    : "Parents will have immediate access after registering."}
                </p>
              </div>
            </div>
          </div>
          </MagicBentoCard>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <NextLink href={`/s/${schoolSlug}/admin/settings`}>
                <Settings className="mr-1.5 h-3.5 w-3.5" />
                Manage in Settings
              </NextLink>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground">
            {filteredAndSorted.length} of {users.length} user
            {users.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleApproveAll}
              disabled={approvingAll}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {approvingAll ? "Approving..." : `Approve All (${pendingCount})`}
            </Button>
          )}
          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {GRADES.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Onboarding quick-info bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Link className="h-4 w-4" />
          <Button variant="ghost" size="sm" className="h-auto px-1 py-0 text-sm" onClick={copyRegistrationLink}>
            {linkCopied ? (
              <><Check className="mr-1 h-3.5 w-3.5 text-green-500" /> Copied</>
            ) : (
              <><Copy className="mr-1 h-3.5 w-3.5" /> Copy invite link</>
            )}
          </Button>
        </div>
        <span className="text-muted-foreground/30">|</span>
        {joinCode ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <KeyRound className="h-4 w-4" />
            <span className="font-mono font-semibold tracking-wider text-foreground">{joinCode}</span>
            <Button variant="ghost" size="sm" className="h-auto px-1 py-0" onClick={copyJoinCode}>
              {codeCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Badge variant={requireJoinCode ? "default" : "outline"} className="text-[10px]">
              {requireJoinCode ? "Required" : "Optional"}
            </Badge>
          </div>
        ) : (
          <span className="text-muted-foreground">
            No join code —{" "}
            <NextLink href={`/s/${schoolSlug}/admin/settings`} className="text-primary underline underline-offset-2">
              set one
            </NextLink>
          </span>
        )}
        <span className="text-muted-foreground/30">|</span>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ShieldAlert className="h-4 w-4" />
          <span>Approval {requireApproval ? "on" : "off"}</span>
        </div>
      </div>

      <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-lg">
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("full_name")}
              >
                Name
                <SortIcon column="full_name" />
              </TableHead>
              <TableHead
                className="hidden cursor-pointer select-none md:table-cell"
                onClick={() => toggleSort("email")}
              >
                Email
                <SortIcon column="email" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("role")}
              >
                Role
                <SortIcon column="role" />
              </TableHead>
              <TableHead
                className="hidden cursor-pointer select-none md:table-cell"
                onClick={() => toggleSort("child_grade")}
              >
                Children
                <SortIcon column="child_grade" />
              </TableHead>
              <TableHead
                className="hidden cursor-pointer select-none md:table-cell"
                onClick={() => toggleSort("created_at")}
              >
                Joined
                <SortIcon column="created_at" />
              </TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSorted.map((user) => (
              <TableRow
                key={user.id}
                className={!user.approved ? "opacity-60" : undefined}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {user.full_name || "\u2014"}
                    {!user.approved && (
                      <Badge variant="outline" className="text-xs">
                        Pending
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground md:hidden">{user.email}</p>
                </TableCell>
                <TableCell className="hidden md:table-cell">{user.email}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      user.role === "admin"
                        ? "bg-chart-2/15 text-chart-2"
                        : "bg-chart-1/15 text-chart-1"
                    }
                  >
                    {user.role === "admin" ? "School Admin" : "Parent"}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {user.children && user.children.length > 0 ? (
                    user.children.length === 1 ? (
                      <span>
                        {user.children[0].name}{" "}
                        <span className="text-xs opacity-60">
                          ({user.children[0].grade})
                        </span>
                      </span>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default">
                            {user.children.length} children
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {user.children.map((c) => (
                            <div key={c.id}>
                              {c.name} ({c.grade})
                            </div>
                          ))}
                        </TooltipContent>
                      </Tooltip>
                    )
                  ) : (
                    user.child_grade || "\u2014"
                  )}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {formatDistanceToNow(new Date(user.created_at), {
                    addSuffix: true,
                  })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!user.approved && (
                        <DropdownMenuItem
                          onClick={() => handleApprove(user.id)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Approve
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => setRoleChangeUser(user)}
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Change to{" "}
                        {user.role === "admin" ? "Parent" : "Admin"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteId(user.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {filteredAndSorted.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No users match the selected grade filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      </MagicBentoCard>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete user"
        description="Are you sure you want to delete this user? Their profile will be removed. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={!!roleChangeUser}
        onOpenChange={(open) => {
          if (!open) setRoleChangeUser(null);
        }}
        title="Change user role"
        description={
          roleChangeUser
            ? `Change ${roleChangeUser.full_name || roleChangeUser.email} from ${roleChangeUser.role} to ${roleChangeUser.role === "admin" ? "parent" : "admin"}?`
            : ""
        }
        confirmLabel="Change role"
        variant="default"
        loading={changingRole}
        onConfirm={handleRoleChange}
      />
    </div>
  );
}
