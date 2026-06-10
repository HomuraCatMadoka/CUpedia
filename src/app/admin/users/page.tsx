import { getUsers } from "@/lib/admin-actions";
import { UserTable } from "@/components/admin/user-table";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const q = params.q?.trim() || undefined;

  const result = await getUsers({ page, pageSize: 50, q });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <UserTable
      users={
        result.users as {
          id: string;
          email: string;
          nickname: string;
          role: string;
          banned: boolean;
          created_at: string;
          updated_at: string;
        }[]
      }
      page={page}
      totalPages={totalPages}
      total={result.total}
      q={q ?? ""}
      ownerUserId={result.ownerUserId}
    />
  );
}
