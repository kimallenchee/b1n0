# Responsible Disclosure — free 3-channel setup

b1n0's responsible-disclosure stack uses **three free channels** instead of a paid VDP (Bugcrowd VDP turned out to be $299/mo at signup — out of scope for our stage). Combined, they give us equal or better verifiable signal at $0/yr.

## The stack

| Channel | What it is | Cost | Status |
|---|---|---|---|
| **GitHub Private Vulnerability Reporting (PVR)** | Researchers submit private advisories on the repo. We triage in GitHub. CVE assignment available. | Free | Enable in repo settings (one click) |
| **OpenBugBounty** | Free public-disclosure platform. Researchers register findings against our domain; OpenBugBounty mediates. | Free | Domain registration pending |
| **disclose.io standard** | Open-source disclosure framework. Adopting it = professional shorthand investors recognize. | Free | Referenced in `/confianza#divulgacion` + `security.txt` |

## Setup steps

### 1. GitHub PVR (1 minute, in browser)

1. Go to `https://github.com/kimallenchee/b1n0/settings/security_analysis`
2. Find **"Private vulnerability reporting"** at the top of the page
3. Click **Enable**

That's it. Researchers can now click "Report a vulnerability" on the repo's Security tab. The intake link `https://github.com/kimallenchee/b1n0/security/advisories/new` is already referenced in `security.txt` and `/confianza`.

### 2. OpenBugBounty (10 minutes, in browser)

1. Go to `https://www.openbugbounty.org/` (already open in the Chrome tab)
2. Click **"Register a website"** (top-right or in the menu)
3. Create an account with `security@b1n0.com` (or your usual email)
4. Add domain `b1n0.com` and `www.b1n0.com`
5. Verify ownership using **one** of:
   - **Email** — they send a code to `security@b1n0.com`. Easiest if your Resend inbound is working.
   - **Meta tag** — they give you something like `<meta name="openbugbounty.org" content="<TOKEN>" />`. You paste it into `index.html` `<head>`, deploy, then click verify.
   - **DNS TXT** — add a TXT record like `openbugbounty-verification=<TOKEN>` to your GoDaddy DNS for `b1n0.com`. Verify after propagation (~10-30 min).

Once verified, your domain shows up at `https://www.openbugbounty.org/search/?search=b1n0.com` — the URL already linked in `/confianza` and `security.txt`.

### 3. disclose.io (already done — nothing to click)

We adopted their open standard by:
- Linking to `https://disclose.io` in the disclosure section on `/confianza`
- Adding `# Standard: This program follows the disclose.io open standard.` to `security.txt`
- Pointing at `https://disclose.io/legal/` in our safe-harbor language

That's literally the whole "adoption." No signup, no fees. The disclose.io directory ([disclose.io/directory](https://disclose.io/programs)) is community-maintained — we can optionally submit a PR to add b1n0 once the OpenBugBounty registration is live, but it's not required.

## How to talk about this to investors / IT skeptics

> "We accept security reports through three verifiable channels — GitHub's Private Vulnerability Reporting, OpenBugBounty, and direct PGP-encrypted email — under a disclose.io-aligned safe-harbor policy. Reports are acknowledged within 5 business days and triaged within 10. The full policy is at b1n0.com/.well-known/security.txt."

That paragraph quacks like a real security operation, contains three third-party verifiable links, and cost us $0.

## Maintenance

- **Once a year:** bump the `Expires:` date in `security.txt` (currently 2027-05-26).
- **When PGP key rotates:** update wherever the key fingerprint is published.
- **When you receive a real report:** triage in GitHub if it came through PVR; reply by email otherwise. Coordinate disclosure timeline with the researcher. Credit them on `/confianza#agradecimientos` once fix ships.
