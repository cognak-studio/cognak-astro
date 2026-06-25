# Moving Domains: GoDaddy → Cloudflare Registrar

Goal: get all your domains off GoDaddy and onto Cloudflare Registrar (at-cost
renewals, no markup, independent of your Vercel hosting). Your sites stay on
Vercel — you'll just point DNS at Vercel from Cloudflare.

---

## Before you start — know the rules

- A domain can only be transferred if it's **more than 60 days old** and hasn't
  been transferred or registered in the last 60 days.
- Transferring **adds 1 year** to the registration (you don't lose paid time).
- Cloudflare charges the **wholesale renewal price** for that extra year — usually
  cheaper than what GoDaddy charged.
- Do this **before** any domain expires. Don't start a transfer in the final
  ~10 days before expiry; renew first if it's close.

---

## Step 0 — Inventory your GoDaddy domains

1. Log into GoDaddy → **My Products** → **Domains** (or go to dcc.godaddy.com).
2. List every domain, its expiry date, and whether auto-renew is on.
3. Fill in the tracker at the bottom of this file.

---

## Step 1 — At GoDaddy (per domain)

For EACH domain:

1. Open the domain's **Domain Settings**.
2. **Turn OFF Domain Lock** (Additional Settings → Domain lock → Off).
3. **Turn OFF privacy/forwarding** if it blocks the admin email (you can re-enable
   privacy free at Cloudflare after).
4. Confirm the **admin email** on the domain is one you can access — the approval
   email goes there.
5. Click **Get authorization code** / **Transfer domain away from GoDaddy**.
   GoDaddy emails you the **EPP/auth code** (or shows it on screen). Save it in the
   tracker.

> Tip: codes are case-sensitive and time-limited. Grab the code right before you
> start the Cloudflare side.

---

## Step 2 — At Cloudflare (per domain)

1. Create / log into a Cloudflare account (dash.cloudflare.com).
2. **Add a site** → enter the domain → pick the **Free** plan. Cloudflare scans and
   imports your existing DNS records so nothing breaks. **Review the imported
   records** — make sure your Vercel records (A / CNAME / etc.) are present.
3. Cloudflare gives you **two nameservers**. (You don't need to change GoDaddy NS for
   the transfer itself, but pointing DNS to Cloudflare early means zero downtime.)
4. Go to **Registrar → Domain Transfer** (or Cloudflare prompts you once the zone is
   active — note it can take a few hours for the zone to verify before transfer is
   offered).
5. Enter the **auth code** from GoDaddy, confirm contact info, and pay the transfer
   fee (= 1 year at wholesale).

---

## Step 3 — Approve the release

- GoDaddy emails you a **"transfer away" confirmation**. Approving it makes the
  transfer complete in minutes; ignoring it auto-completes in ~5 days.
- You'll get a Cloudflare email when each domain lands.

---

## Step 4 — Point DNS at Vercel (if not already)

In Cloudflare DNS for each domain:

- **Apex (cognak.com):** A record → `76.76.21.21` (Vercel's IP), or follow Vercel's
  current instructions in your Vercel project → Settings → Domains.
- **www:** CNAME → `cname.vercel-dns.com`.
- Set the records to **DNS only** (grey cloud) first if Vercel's SSL gets confused;
  you can turn the orange proxy on later.
- In Vercel, the domain should show **Valid Configuration**.

---

## Step 5 — Cleanup

- Re-enable **free WHOIS privacy** in Cloudflare (Registrar → your domain).
- Turn off auto-renew at GoDaddy for the moved domains (it should drop off anyway).
- Once all domains are gone and confirmed, you can close the GoDaddy account.

---

## Status — June 23, 2026

✅ **5 of 6 domains transferred to Cloudflare** (all approved at GoDaddy, completing
within minutes–5 days): cognak.com, coverstory.studio, lessergods.com,
mialiefeld.com, pierceliefeld.com.

🏷️ **higheredconsulting.com stays at GoDaddy** — listed for sale (Cloudflare has no
domain marketplace; GoDaddy/Afternic does the selling).

### Loose ends
1. ✅ **coverstory.studio attached to Vercel (Job 2) — DONE.** Connected via Vercel's
   apex CNAME method: `@ → 913c79194f5ed2c3.vercel-dns-017.com` (DNS only/grey) in
   Cloudflare; stale A records (`13.248.243.5`, `76.223.105.230`) deleted. Vercel shows
   "Valid Configuration." Email (CF Routing + SES) untouched. (`www` not added — bare
   domain only; add in Vercel later if wanted.)
2. ✅ **All 5 confirmed Active** in Cloudflare's Registrations (expiries each +1 yr).
   WHOIS privacy auto-restored by Cloudflare. Auto-renew on.
3. **Optional cleanup (not urgent):** prune dead GoDaddy `secureserver.net` /
   `_domainconnect` / `ftp` CNAMEs from cognak, mialiefeld, pierceliefeld zones.

## Per-domain tracker

| Domain | Expiry | Eligible? | Lock off | Privacy off | Auth code saved | Added to CF | Transfer started | Approved | DNS→Vercel OK |
|--------|--------|-----------|----------|-------------|-----------------|-------------|------------------|----------|----------------|
| cognak.com | Mar 20, 2027 | ✓ | ✅ | ✅ | ✅ | ✅ Active | ✅ approved | ✅ DONE | ✅ DNS only |
| coverstory.studio | Dec 13, 2026 | ✓ (.studio OK) | ✅ | ✅ | ✅ | ✅ records imported | ✅ submitted | ⏳ approve at GoDaddy | ⚠️ Job 2: attach to Vercel (A→216.198.79.1, www→cname.vercel-dns.com, grey). Email (CF routing+SES) preserved. |
| ~~higheredconsulting.com~~ | Feb 12, 2027 | — | — | — | — | **STAYING at GoDaddy (listed for sale)** | — | — | — |
| lessergods.com | May 7, 2027 | ✓ | ✅ | ✅ | ✅ | ✅ | ✅ submitted | ✅ approved | n/a (parked) |
| mialiefeld.com | Dec 6, 2027 | ✓ | ✅ | ✅ | ✅ | ✅ | ✅ submitted | ✅ approved | ✅ Squarespace records grey/DNS-only, no email |
| pierceliefeld.com | Jul 12, 2028 | ✓ | ✅ | ✅ | ✅ | ✅ | ✅ submitted | ✅ approved | ✅ Vercel records grey, no email (GoDaddy MX were junk) |

¹ **coverstory.studio** — Cloudflare Registrar only supports a fixed list of TLDs.
`.com` is always supported; `.studio` may not be. If Cloudflare won't accept it,
transfer that one to **Porkbun or Namecheap** instead (both support `.studio`).
Everything else here is `.com` and fine for Cloudflare.

> "Eligible?" = not registered/transferred in the last 60 days. All expiries are far
> out, so all are very likely past the 60-day window — confirm only if any was
> recently bought.

---

## Gotchas

- **60-day lock after a recent transfer/registration** — if any domain was just
  bought or moved, it can't leave yet. Note the date it's eligible.
- **Don't let the auth code expire** — grab it right before the Cloudflare step.
- **Email forwarding / mailboxes** — if GoDaddy hosts your email (e.g. Microsoft 365
  via GoDaddy), moving the domain's DNS can break mail. Recreate MX records in
  Cloudflare BEFORE switching nameservers. Flag this if cognak.com email runs
  through GoDaddy.
- **Keep paid time** — transfers don't erase existing registration time; they add a year.
