# Bugcrowd VDP application — copy-paste ready

This doc has every field pre-filled for Bugcrowd's free **Vulnerability Disclosure Program (VDP)** application. When you're at https://bugcrowd.com/programs/new and they ask for each field, paste the matching block below.

> **Why VDP and not Bug Bounty:** VDP costs nothing and gives you a public Bugcrowd page that says "we have a responsible-disclosure channel" — which is what investors actually want to see. Bug Bounty pays out cash per finding and starts ~$5k+/yr; you can always upgrade later once you're funded.

---

## Program basics

| Field | Value |
|---|---|
| Program name | **b1n0** |
| Program type | **Vulnerability Disclosure Program (VDP)** |
| Visibility | **Public** (so it's verifiable from /confianza) |
| Organization | Tres33 SAS de CV |
| Website | https://www.b1n0.com |
| Industry | Fintech / Online Marketplaces |
| Region | Central America (El Salvador) |

---

## Program description (paste into the "About this program" / brief field)

```
b1n0 is an LP-backed fixed-payout event-options market for Central America, operated by Tres33 SAS de CV (El Salvador) under the CNAD framework. Users buy SÍ/NO positions on real-world events at a market price; payouts are funded by liquidity-provider capital.

We're a small team and we take security seriously — RLS-isolated Postgres via Supabase, SECURITY DEFINER RPCs, admin claim in auth.users.app_metadata, strict CSP + HSTS preload, automated dependency + static-analysis scanning, and a 5-business-day response SLA on incoming reports.

We welcome good-faith security research within the scope below. Researchers who follow this policy will not be subject to legal action and will be credited publicly at https://www.b1n0.com/confianza#agradecimientos unless they prefer to stay anonymous.
```

---

## Targets (in-scope)

Bugcrowd lets you list one or more "targets." Paste these as separate entries:

| Target | Type | Notes |
|---|---|---|
| `https://www.b1n0.com` | Website | Primary production app |
| `https://b1n0.com` | Website | Apex redirect to www |
| `https://*.b1n0.com` | Wildcard | Any future subdomain at b1n0 |
| `https://bebdvsdiqlruqzmkvmgy.supabase.co` | API | Supabase project — auth, RLS, edge functions, RPCs |

---

## Out-of-scope (paste as bullet list)

```
- Social engineering of Tres33 employees, contractors, or partners
- Physical attacks against Tres33 infrastructure or staff
- Denial-of-service / volumetric / brute-force attacks
- Rate-limit bypass without a downstream impact
- Findings from automated scanners without a working proof-of-concept
- Self-XSS or attacks requiring an already-compromised client browser
- Vulnerabilities in third-party services (Supabase, Vercel, Didit, Resend, etc.) unless the integration enables a vulnerability in b1n0 itself
- Missing best-practice security headers on purely static / non-auth surfaces
- UI/UX bugs, broken links, content typos — these belong in soporte@b1n0.com
- Email spoofing reports based on missing/lenient DMARC if the domain has no inbound mail flow
- Public information disclosure of marketing material, blog content, or already-published documentation
```

---

## Reward model

| Field | Value |
|---|---|
| Reward type | **Acknowledgment-only (Hall of Fame)** |
| Monetary bounty | **None at this stage** — we may add paid bounties post-launch / post-funding |
| Swag | Optional once we have merch |
| Credit | Public credit on https://www.b1n0.com/confianza#agradecimientos with researcher's preferred name/handle, unless they prefer anonymity |

---

## Response SLA

| Stage | Commitment |
|---|---|
| Acknowledge receipt | 5 business days |
| Triage + preliminary severity | 10 business days |
| Status update cadence | Every 2 weeks until resolution |
| Public disclosure window | Coordinated with researcher; default 90 days post-fix |

---

## Safe harbor language (paste verbatim)

```
Tres33 SAS de CV will not pursue legal action against security researchers who:

1. Act in good faith and stay within the scope of this program;
2. Do not exfiltrate, modify, or destroy user data;
3. Do not degrade or disrupt service for other users;
4. Give us a reasonable window to remediate before public disclosure (default: 90 days post-fix);
5. Do not violate any other applicable laws.

This safe-harbor commitment applies to authorized testing under this program only.
```

---

## Contact

| Field | Value |
|---|---|
| Security email | security@b1n0.com |
| Backup contact | hola@b1n0.com |
| security.txt | https://www.b1n0.com/.well-known/security.txt |

---

## Brand assets Bugcrowd may ask for

- Logo: `public/brand/b1n0-logo-white.png` (1024×1024 or whatever they request — they auto-resize)
- Brand color: `#06D47F` (vibrant green)
- One-line tagline: *"LP-backed fixed-payout event-options market for Central America."*

---

## After you submit

Bugcrowd takes 1-3 business days to approve a VDP. Once approved:

1. You'll get a public Bugcrowd URL like `https://bugcrowd.com/b1n0` — add it to `security.txt` under a new `Policy:` line (or replace the current one) and to `/confianza#divulgacion` as a "Verify our program" link.
2. Researchers submit reports through your Bugcrowd inbox — you can keep `security@b1n0.com` as the primary inbound channel and use Bugcrowd as the verification badge.
3. Add the Bugcrowd badge SVG (they provide one) to `/confianza` and/or your footer.

I'll wire those changes in as soon as you have the program URL — just ping me with it.
