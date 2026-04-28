import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/**
 * Typed Supabase client. The `Database` generic drives:
 *   - `from('table').select(...)` → typed rows
 *   - `rpc('fn', args)`           → typed args + return
 *
 * `src/types/database.ts` is hand-curated. When you add or change a
 * column or RPC in a migration, mirror it there in the same PR.
 */
export const supabase = createClient<Database>(url, key)
