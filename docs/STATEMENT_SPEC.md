# Statement download — feature spec (for review, NOT yet built)

> **Status:** spec only. Nothing here is implemented. Read, mark up,
> and tell me what to cut or add before I build.

## What this is

A user-facing "Download statement" button (in Perfil → Cuenta) that
generates a **PDF** snapshot of their account activity for a chosen
date range. Patterned after the year-end statements Robinhood, Kalshi,
Polymarket, and Wealthsimple send their users — clean, signed, and
detailed enough that a Guatemalan accountant could use it to prepare
the user's annual tax return.

This is **not** an IRS 1099. b1n0 is a Guatemalan company serving
Central American users, so it has to fit *local* tax conventions
(SAT in Guatemala, DGI in Panama, etc.) rather than US 1099 fields.

## Who this is for

1. **Power users / influencers** who want their P&L for personal
   bookkeeping or social proof.
2. **Anyone preparing a tax return** in countries where prediction
   winnings are reportable. (Mostly Costa Rica + Panama in our
   footprint; Guatemala is murkier.)
3. **Customer support evidence**: when a user disputes a payout, the
   statement is what we mail back.
4. **Compliance**: future regulator asks "what data do you give the
   user?" — we point at this.

## When the user gets it

- One-tap from Perfil → "Descargar estado de cuenta".
- Modal asks: date range (defaults to current calendar year) and
  format (PDF only at launch; CSV later).
- Generated on demand server-side (Edge Function), emailed AND
  shown as a download link. Email so they have a record.

## What's in the PDF

### Cover page
- b1n0 logo, brand cream background.
- "Estado de Cuenta — {Nombre del usuario}"
- Range: "1 enero 2026 → 31 diciembre 2026"
- Generated on: `2026-05-16 14:32 GTM-6`
- Account ID, KYC tier (N1/N2/N3), email of record.
- One-line legal: *"Documento informativo emitido por Tres33 SAS de
  CV. No constituye un comprobante fiscal. Consultá a tu contador."*

### Section 1: Resumen del período (account summary)
A six-row mini-table:
| Concepto             | Monto      |
|----------------------|-----------:|
| Saldo inicial        | $124.00    |
| Depósitos            | +$500.00   |
| Retiros              | −$200.00   |
| Cobros (ganadas)     | +$842.50   |
| Entradas perdidas    | −$310.00   |
| Comisiones pagadas   | −$18.42    |
| **Saldo final**      | **$938.08**|

Net P&L line below: `Resultado neto del período: +$514.08`

### Section 2: Llamados (predictions)
A full table — every settled position in the range:

| Fecha       | Evento (truncado a 80c)          | Lado | Entrada | Cobro   | Resultado | P/L   |
|-------------|----------------------------------|------|---------|---------|-----------|-------|
| 2026-02-14  | "Mundial 2026: ¿Argentina..."    | SÍ   | $25.00  | $54.40  | Ganada    | +$29.40 |
| 2026-02-18  | "Inflación GT supera 6% en Q1"   | NO   | $10.00  | —       | Perdida   | −$10.00 |
| ...         |                                  |      |         |         |           |       |
| **Totales** |                                  |      | **$X**  | **$Y**  |           | **$Z**|

Sorted by date. Footnote: *"P/L = Cobro − Entrada. Las comisiones
están ya descontadas del cobro."*

### Section 3: Posiciones LP (liquidity provider activity)
Same shape, separate table:

| Fecha entrada | Evento | Capital | Retorno | Status | Ganancia |
|---------------|--------|--------:|--------:|--------|---------:|
| 2026-01-08    | "..."  | $100.00 | $112.40 | Cerrado| +$12.40  |
| 2026-03-22    | "..."  | $50.00  | —       | Activo | (en curso)|

Note for "Activo" rows: *"Posiciones LP activas no se reportan hasta
que el evento se resuelve."*

### Section 4: Movimientos de saldo (ledger)
Optional, behind a "Mostrar detalle" toggle. Direct dump of
`balance_ledger` rows in the range, columns:
`Fecha · Tipo · Monto · Saldo después · Referencia`

This is the raw audit trail — most users skip it but power users
and accountants will want it.

### Section 5: Información fiscal (tax-relevant aggregates)

A single grouped table the user can hand to their contador:

| Categoría             | Monto    |
|-----------------------|---------:|
| Total ganancias brutas| $842.50  |
| Total entradas brutas | $310.00  |
| Resultado neto        | +$514.08 |
| Comisiones pagadas    | $18.42   |
| Retenciones aplicadas | $0.00    |

**Critical caveat right under the table:**
> *Los regímenes fiscales aplicables a juegos de opinión / mercados
> de predicción varían por país. Este resumen es informativo y no
> sustituye asesoría profesional. Consultá a un contador habilitado
> en tu jurisdicción.*

### Section 6: Historial de niveles (KYC tier history)
A 2-3 row table:
| Fecha       | Cambio       |
|-------------|--------------|
| 2026-01-12  | Cuenta creada (Nivel 1) |
| 2026-02-20  | Subió a Nivel 2 |
| 2026-04-04  | Subió a Nivel 3 |

Useful for showing limits at the time of each transaction.

### Footer (every page)
- Page X of Y
- Document ID (uuid, also stored server-side so we can re-issue if
  asked)
- `Tres33 SAS de CV · NIT XXXXXXXX · Ciudad de Guatemala`
- `soporte@b1n0.com · www.b1n0.com`

## Technical plan (high level)

1. **New table `statements`** — `id, user_id, range_start, range_end,
   generated_at, pdf_url, doc_id`. So we can re-serve and audit.
2. **Edge function `generate-statement`** — fetches all the data,
   builds the PDF server-side. Two library options:
   - `pdfkit` via Deno (lightweight, programmatic — what I'd pick)
   - `puppeteer` (HTML→PDF, prettier but heavier cold-start)
3. **Storage**: writes PDF to Supabase Storage in the
   `statements/{user_id}/{doc_id}.pdf` path, signed URL expires
   in 30 days.
4. **Client**: `Descargar estado` button in Perfil opens a sheet
   that lets user pick range, then calls the edge fn and shows
   a progress state. PDF arrives by email AND via signed link.
5. **Rate limit**: max 3 statement generations per user per day
   (server-side), to keep cost predictable.

## Estimated effort (rough)

- Schema + storage policy: ~½ day
- Edge function + PDF generation: ~1 day (or ~½ day if I use
  pdfkit and you're OK with a slightly less designerly PDF)
- Client sheet + UI: ~½ day
- QA + first real-data smoke test: ~½ day
- **Total: ~2.5 days of focused work**

## What's NOT in v1 (deferred)

- CSV / Excel export (users overwhelmingly prefer PDFs for tax)
- Multi-language (English version) — Spanish only at launch
- Auto-mailing every Jan 1 — manual download only
- 1099 / SAT pre-filled forms — too jurisdiction-specific to do
  generically right now
- Withholding logic — Tres33 doesn't withhold anything today, so
  the "Retenciones" line will always be $0 until policy changes
- "Verified by Tres33" digital signature on the PDF — nice to have
  but adds 2-3 days to wire up a signing service

## Questions for you

1. **Spanish-only or also English?** I'd default to Spanish-only
   for v1.
2. **Should I include the raw ledger (Section 4) by default, or
   keep it behind a "detailed" toggle?** Detail is useful for
   power users but bloats the PDF.
3. **Calendar-year-default or always-let-user-pick range?**
   Defaulting to "this year so far" feels right but I'm open.
4. **Do we want Tres33's NIT on the document?** Strictly we don't
   need it for an informational doc, but it makes it look more
   official. Need you to confirm the NIT first.
5. **Build now, or wait?** If we're going to ship payments and KYC
   first, statements are arguably the next thing — but they're not
   blocking anyone today.
