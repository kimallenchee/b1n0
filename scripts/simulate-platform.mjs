#!/usr/bin/env node
/**
 * simulate-platform.mjs — internal math-validation simulation for b1n0.
 *
 * What this does:
 *   1. Spawns N simulated users (admin_spawn_simulated_user) each
 *      prefunded with a random balance between $20–$500.
 *   2. For each of M target events (picks newest open events, or
 *      asks you to specify), runs a randomized stream of purchases:
 *      mixed SÍ/NO, varied dollar amounts respecting min/max_entry.
 *   3. Between purchases, ~20% chance of triggering a sell on a
 *      previously-acquired position via admin_simulate_sell.
 *   4. (Optional) Resolves each event with a coin-flip outcome and
 *      calls settle_event.
 *   5. Prints a summary report with totals, fees, LP P&L, edge
 *      cases hit, and any RPC errors that fired.
 *
 * What this does NOT do:
 *   - Create events. You need at least M open events ready to go.
 *   - Touch real users. Hard-guarded by is_simulated flag in RPCs.
 *   - Verify invariants. Run scripts/verify-invariants.sql after.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/simulate-platform.mjs \
 *     --users 50 --events 5 --buys-per-event 30 --sells-per-event 8 \
 *     --resolve --seed 42
 *
 * Cleanup:
 *   Call admin_wipe_simulated() via the SQL editor when done.
 */

import { createClient } from '@supabase/supabase-js'

// ── arg parsing ─────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, arr) => {
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = arr[i + 1]
      acc.push([key, next && !next.startsWith('--') ? next : true])
    }
    return acc
  }, [])
)

const N_USERS         = Number(args.users ?? 50)
const N_EVENTS        = Number(args.events ?? 5)
const BUYS_PER_EVENT  = Number(args['buys-per-event'] ?? 30)
const SELLS_PER_EVENT = Number(args['sells-per-event'] ?? 8)
const RESOLVE         = !!args.resolve
const SEED            = Number(args.seed ?? Date.now())

// ── deterministic RNG so we can replay scenarios ────────────
let _seed = SEED
function rand() {
  _seed = (_seed * 9301 + 49297) % 233280
  return _seed / 233280
}
function randInt(lo, hi) { return Math.floor(rand() * (hi - lo + 1)) + lo }
function pick(arr) { return arr[Math.floor(rand() * arr.length)] }

// ── supabase client ─────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in env')
  process.exit(1)
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// ── runtime stats we'll print at the end ────────────────────
const stats = {
  users_spawned: 0,
  events_used: 0,
  purchases_attempted: 0,
  purchases_succeeded: 0,
  sells_attempted: 0,
  sells_succeeded: 0,
  settles_attempted: 0,
  settles_succeeded: 0,
  rpc_errors: [],
  per_event: {},
}

function logErr(stage, err, ctx = {}) {
  stats.rpc_errors.push({ stage, msg: err.message || String(err), ctx })
  console.error(`  [${stage}]`, err.message || err, ctx)
}

// ── main ────────────────────────────────────────────────────
async function main() {
  console.log(`\n──────────────────────────────────────────────`)
  console.log(`b1n0 simulation harness`)
  console.log(`  seed: ${SEED}`)
  console.log(`  users: ${N_USERS}  events: ${N_EVENTS}`)
  console.log(`  buys/event: ${BUYS_PER_EVENT}  sells/event: ${SELLS_PER_EVENT}`)
  console.log(`  resolve at end: ${RESOLVE}`)
  console.log(`──────────────────────────────────────────────\n`)

  // 0. Sanity-check the connection before doing anything ────
  const { count: probeCount, error: probeErr } = await sb
    .from('events').select('id', { count: 'exact', head: true })
  if (probeErr) {
    console.error('\n❌ Supabase connection failed:')
    console.error('   ', probeErr.message || probeErr)
    console.error('   ', probeErr.hint || probeErr.details || '')
    console.error('\n   Common causes:')
    console.error('   • SUPABASE_SERVICE_ROLE_KEY is not set or is a placeholder')
    console.error('     (in PowerShell, # starts a comment — anything after is dropped)')
    console.error('   • SUPABASE_URL is wrong')
    console.error('   • RLS on events is blocking the service role (shouldn\'t happen)')
    console.error('\n   Verify with:')
    console.error('     echo $env:SUPABASE_SERVICE_ROLE_KEY    # PowerShell')
    console.error('     echo $SUPABASE_SERVICE_ROLE_KEY        # bash')
    console.error('   The key should be a long eyJ... JWT, ~200 chars.')
    process.exit(2)
  }
  console.log(`Connected. Total events in DB: ${probeCount}`)

  // 1. Pick events to use ─────────────────────────────────
  const { data: events, error: eErr } = await sb
    .from('events')
    .select('id, question, min_entry, max_entry, status, event_type, options, tier_required')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(N_EVENTS)
  if (eErr) {
    console.error('Events query failed:', eErr.message || eErr)
    process.exit(2)
  }
  if (!events?.length) {
    console.error(`No events with status='open' found (DB has ${probeCount} total events).`)
    console.error(`Either create events via /admin, or run the SQL seed snippet from docs/simulation-runbook.md.`)
    console.error(`Also check that your seeded events have status='open' (not 'draft' or anything else).`)
    process.exit(3)
  }
  console.log(`Using ${events.length} open events:`)
  for (const e of events) {
    console.log(`  • ${e.id.slice(0, 8)}…  ${e.question.slice(0, 60)}`)
    stats.per_event[e.id] = { purchases: 0, sells: 0, fees_collected: 0 }
  }
  stats.events_used = events.length

  // 2. Spawn simulated users ──────────────────────────────
  console.log(`\nSpawning ${N_USERS} simulated users...`)
  const users = []
  for (let i = 0; i < N_USERS; i++) {
    const username = `sim_user_${SEED}_${i.toString().padStart(3, '0')}`
    const balance  = randInt(20, 500)
    const tier     = pick([1, 1, 1, 2, 2, 3])  // skewed toward tier 1
    const { data, error } = await sb.rpc('admin_spawn_simulated_user', {
      p_username: username,
      p_starting_balance: balance,
      p_tier: tier,
    })
    if (error) { logErr('spawn', error, { username }); continue }
    users.push({ id: data, balance, tier })
    stats.users_spawned++
  }
  console.log(`  spawned ${users.length} users`)

  if (!users.length) { console.error('No users spawned, aborting.'); process.exit(3) }

  // 3. Run the buy/sell stream per event ──────────────────
  for (const event of events) {
    console.log(`\nEvent ${event.id.slice(0, 8)}…  (${event.question.slice(0, 50)})`)

    for (let i = 0; i < BUYS_PER_EVENT; i++) {
      const user = pick(users)
      // Tier gate — respect tier_required
      if (event.tier_required && user.tier < event.tier_required) continue
      // Pick side
      const side = pick(['yes', 'no'])
      // Pick amount within event limits AND within user's balance
      const lo = Math.max(event.min_entry || 1, 1)
      const hi = Math.min(event.max_entry || 500, 200)
      let amount = randInt(lo, hi)
      if (amount > user.balance) continue  // skip insufficient balance

      stats.purchases_attempted++
      const { data, error } = await sb.rpc('admin_simulate_purchase', {
        p_user_id:  user.id,
        p_event_id: event.id,
        p_side:     side,
        p_amount:   amount,
      })
      if (error) { logErr('purchase', error, { event: event.id, user: user.id, side, amount }); continue }
      stats.purchases_succeeded++
      stats.per_event[event.id].purchases++
      user.balance -= amount

      // ~20% chance to sell a previously-acquired position right after.
      // We query positions directly because the purchase RPC's return
      // shape doesn't include position_id reliably.
      if (rand() < 0.20) {
        const { data: candidates } = await sb
          .from('positions')
          .select('id, user_id')
          .eq('event_id', event.id)
          .eq('status', 'active')
          .limit(20)
        if (candidates?.length) {
          const simUserIds = new Set(users.map(u => u.id))
          const sellable = candidates.filter(c => simUserIds.has(c.user_id))
          if (sellable.length) {
            const pos = pick(sellable)
            stats.sells_attempted++
            const { error: sErr } = await sb.rpc('admin_simulate_sell', { p_position_id: pos.id })
            if (sErr) { logErr('sell', sErr, { position: pos.id }); }
            else { stats.sells_succeeded++; stats.per_event[event.id].sells++ }
          }
        }
      }
    }

    // Forced sell pass to hit the SELLS_PER_EVENT target. Query
    // positions table for active sim-owned positions on this event
    // and sell a random subset.
    let extraSells = Math.max(0, SELLS_PER_EVENT - stats.per_event[event.id].sells)
    if (extraSells > 0) {
      const { data: activePositions } = await sb
        .from('positions')
        .select('id, user_id')
        .eq('event_id', event.id)
        .eq('status', 'active')
      const simUserIds = new Set(users.map(u => u.id))
      const sellable = (activePositions || []).filter(p => simUserIds.has(p.user_id))
      while (extraSells > 0 && sellable.length > 0) {
        const pos = sellable.splice(Math.floor(rand() * sellable.length), 1)[0]
        stats.sells_attempted++
        const { error: sErr } = await sb.rpc('admin_simulate_sell', { p_position_id: pos.id })
        if (sErr) { logErr('sell-forced', sErr, { position: pos.id }); }
        else { stats.sells_succeeded++; stats.per_event[event.id].sells++ }
        extraSells--
      }
    }

    console.log(`  buys: ${stats.per_event[event.id].purchases}/${BUYS_PER_EVENT}  sells: ${stats.per_event[event.id].sells}`)

    // 4. Optional resolution ─────────────────────────────
    if (RESOLVE) {
      const winner = rand() < 0.5 ? 'yes' : 'no'
      stats.settles_attempted++
      const { error: resErr } = await sb.rpc('admin_simulate_settle', { p_event_id: event.id, p_result: winner })
      if (resErr) { logErr('settle', resErr, { event: event.id }); }
      else { stats.settles_succeeded++; console.log(`  settled as ${winner}`) }
    }
  }

  // 5. Final report ───────────────────────────────────────
  console.log(`\n──────────────────────────────────────────────`)
  console.log(`Simulation complete`)
  console.log(`──────────────────────────────────────────────`)
  console.log(`Users spawned:        ${stats.users_spawned}`)
  console.log(`Events used:          ${stats.events_used}`)
  console.log(`Purchases attempted:  ${stats.purchases_attempted}  succeeded: ${stats.purchases_succeeded}`)
  console.log(`Sells attempted:      ${stats.sells_attempted}  succeeded: ${stats.sells_succeeded}`)
  console.log(`Settles attempted:    ${stats.settles_attempted}  succeeded: ${stats.settles_succeeded}`)
  console.log(`RPC errors:           ${stats.rpc_errors.length}`)
  if (stats.rpc_errors.length) {
    const byStage = stats.rpc_errors.reduce((acc, e) => { acc[e.stage] = (acc[e.stage]||0)+1; return acc }, {})
    console.log(`  by stage:`, byStage)
  }
  console.log(`\nNext step:`)
  console.log(`  psql "$DATABASE_URL" -f scripts/verify-invariants.sql`)
  console.log(`  (or paste it into the Supabase SQL editor)\n`)
  console.log(`Cleanup when done:`)
  console.log(`  SELECT admin_wipe_simulated();\n`)
}

main().catch(e => { console.error(e); process.exit(99) })
