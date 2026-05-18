import { supabase } from '../lib/supabase.js'

const DEFAULT_PASSWORD = process.env.DEFAULT_ACCOUNT_PASSWORD ?? '123'
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

interface AuthUserLite {
  id: string
  email?: string | null
}

interface BaselineAccount {
  account: 'admin' | 'staff'
  email: string
  role: 'organizer' | 'staff'
  displayName: string
}

interface ResetSummary {
  deletedAuthUsers: number
  baselineAccounts: Array<{ account: string; email: string; id: string; role: string }>
}

const baselineAccounts: BaselineAccount[] = [
  { account: 'admin', email: 'admin@unihub', role: 'organizer', displayName: 'Ban tổ chức' },
  { account: 'staff', email: 'staff@unihub', role: 'staff', displayName: 'Nhân sự check-in' },
]

async function deleteAllFrom(table: string, column: string, neverValue: string): Promise<void> {
  const { error } = await supabase.from(table).delete().neq(column, neverValue)
  if (error) throw new Error(`Failed to clear ${table}: ${error.message}`)
}

async function listAllAuthUsers(): Promise<AuthUserLite[]> {
  const users: AuthUserLite[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1_000 })
    if (error) throw new Error(`Failed to list auth users: ${error.message}`)

    users.push(...data.users.map((user) => ({ id: user.id, email: user.email })))
    hasMore = typeof data.lastPage === 'number' && page < data.lastPage
    page += 1
  }

  return users
}

async function deleteAllAuthUsers(): Promise<number> {
  const users = await listAllAuthUsers()

  for (const user of users) {
    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) throw new Error(`Failed to delete auth user ${user.email ?? user.id}: ${error.message}`)
  }

  return users.length
}

async function createBaselineAccount(account: BaselineAccount): Promise<ResetSummary['baselineAccounts'][number]> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: account.email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: {
      account: account.account,
      display_name: account.displayName,
    },
  })

  if (error || !data.user) {
    throw new Error(`Failed to create ${account.account}: ${error?.message ?? 'Auth user missing'}`)
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    role: account.role,
    mssv: null,
    display_name: account.displayName,
    must_change_password: false,
  })

  if (profileError) {
    await supabase.auth.admin.deleteUser(data.user.id)
    throw new Error(`Failed to create ${account.account} profile: ${profileError.message}`)
  }

  return { account: account.account, email: account.email, id: data.user.id, role: account.role }
}

export async function resetAccounts(): Promise<ResetSummary> {
  await deleteAllFrom('notifications', 'id', ZERO_UUID)
  await deleteAllFrom('check_ins', 'registration_id', ZERO_UUID)
  await deleteAllFrom('payments', 'registration_id', ZERO_UUID)
  await deleteAllFrom('registrations', 'id', ZERO_UUID)
  await deleteAllFrom('idempotency_keys', 'key', '__unihub_never__')
  await deleteAllFrom('profiles', 'id', ZERO_UUID)
  await deleteAllFrom('students', 'mssv', '__unihub_never__')

  const deletedAuthUsers = await deleteAllAuthUsers()
  const createdAccounts: ResetSummary['baselineAccounts'] = []
  for (const account of baselineAccounts) {
    createdAccounts.push(await createBaselineAccount(account))
  }

  return { deletedAuthUsers, baselineAccounts: createdAccounts }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  resetAccounts()
    .then((summary) => {
      console.log(JSON.stringify({ data: summary, error: null }, null, 2))
    })
    .catch((error: unknown) => {
      console.error(JSON.stringify({
        data: null,
        error: {
          code: 'RESET_ACCOUNTS_FAILED',
          message: error instanceof Error ? error.message : 'Reset failed',
        },
      }, null, 2))
      process.exitCode = 1
    })
}
