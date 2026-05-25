# Vendor outreach — email templates + call agendas

Copy these into your email client. Each is calibrated for the
specific vendor's product positioning and asks the exact questions
that will determine fit (per `docs/payments-architecture.md` §7).

---

## 1. Redbajas — card processing

**To:** their sales / integrations contact (find on https://redbaja.com or LinkedIn → Hugo Chinchilla appears in their API docs as a contact)
**Subject:** Tres33 SAS de CV — Redbajas integration interest (prediction-market platform, El Salvador)

> Hola,
>
> Soy Kim Allen Chee, fundador de Tres33 SAS de CV, una compañía
> salvadoreña operando b1n0.com — un mercado de opciones sobre
> eventos (predicción) registrada bajo el marco regulatorio CNAD de
> El Salvador.
>
> Estamos evaluando integrar Redbajas como nuestro procesador de
> tarjetas para depósitos y retiros en USD para usuarios en Centroamérica.
> Recibimos el manual de integración (v0.0.1, marzo 2026) y nuestro
> equipo técnico ya identificó la arquitectura — OAuth2 + iframe
> Pagadito.
>
> Antes de avanzar a contrato, necesitamos confirmar 5 puntos:
>
> 1. **Pagos salientes** — ¿Redbajas / Pagadito soporta payouts (push
>    desde nuestra cuenta merchant a la tarjeta o cuenta bancaria del
>    cliente), o solo cobros entrantes?
> 2. **Liquidación** — ¿Cuál es el T+N típico hasta nuestra cuenta
>    bancaria, y a cuál de nuestras cuentas pueden liquidar (operativa
>    vs FBO de fondos de clientes)?
> 3. **Tarifas** — Tabla de tarifas oficial para nuestro volumen
>    estimado (~$50K USD/mes en el primer trimestre, escalando a $500K).
> 4. **Vertical** — Trabajamos con un producto de skill-prediction
>    bajo licencia CNAD; ¿Redbajas acepta este vertical, o requiere
>    revisión de compliance específica?
> 5. **Credenciales sandbox** — ¿Podemos recibir client_id /
>    client_secret de sandbox para arrancar la integración técnica
>    en paralelo a la negociación contractual?
>
> Adjunto un one-pager con nuestra arquitectura de pagos y la posición
> de Redbajas en el stack. ¿Tienes 30 minutos esta semana para una
> llamada?
>
> Saludos,
> Kim Allen Chee
> Tres33 SAS de CV
> www.b1n0.com

**Call agenda (30 min):**
- 5 min: b1n0 product + vertical positioning (you bring one-pager)
- 10 min: 5 questions above
- 5 min: Compliance / KYC bridging (Didit already integrated)
- 5 min: Sandbox credentials + integration timeline
- 5 min: Next steps + MSA timing

---

## 2. Vudy — crypto rails

**To:** their sales team — use the form at https://www.vudy.app or
the `support@vudy.me` address from their ToS
**Subject:** Tres33 / b1n0 — Vudy Payments API + custody arrangement for SV-licensed prediction market

> Hi Vudy team,
>
> I'm Kim Allen Chee, founder of Tres33 SAS de CV, building b1n0.com —
> an LP-backed fixed-payout prediction market for Central America,
> registered under El Salvador's CNAD framework.
>
> We're shortlisting Vudy as the crypto rail (USDC / USDT deposits +
> withdrawals) for our users alongside a card processor (Redbajas) and
> a tokenization layer (Monetae candidate). Your Payments API + Send
> API are a clean fit for the rail layer; before we proceed I'd like
> to confirm 5 things on a quick call:
>
> 1. **Custody recommendation for SV fintechs** — Given that Vudy
>    explicitly is not a custodian, who do you recommend as the
>    downstream custody partner? Your partner page lists IBEX; is
>    that your preferred path, or does Monetae custody fit (since
>    they're CNAD-registered and we're considering them for
>    tokenization)?
> 2. **Prediction-market vertical** — Do you accept skill-based event
>    options as a vertical, or does our license category need to be
>    reviewed first?
> 3. **Pricing for our volume** — projected $30K-100K USDC/month in
>    Y1, scaling. Can you share the OTC + Send fee schedule for that
>    volume?
> 4. **Chain support** — We want to default users to Polygon (USDC)
>    and Tron (USDT) for low fees. Both fully supported on Payments
>    + Send APIs?
> 5. **Sandbox + SDK** — Can we get sandbox credentials to start
>    integrating in parallel with contract negotiation?
>
> Happy to share our payments architecture doc on the call. 30
> minutes this week?
>
> Best,
> Kim Allen Chee
> Tres33 SAS de CV
> www.b1n0.com

**Call agenda (30 min):**
- 5 min: b1n0 + the three-vendor stack we're building
- 10 min: 5 questions above
- 5 min: Webhook delivery / dedup / SLA discussion
- 5 min: Pilot proposal — low-volume launch, validate, scale
- 5 min: Next steps

---

## 3. Monetae — tokenization + custody

**To:** Calendly link on their site — https://calendly.com/monetae
**Subject:** Tres33 / b1n0 — Tokenization + custody for an LP-backed prediction market (CNAD-registered)

> Hi Monetae team,
>
> I'm Kim Allen Chee, founder of Tres33 SAS de CV — Salvadoran
> company building b1n0.com, an LP-backed fixed-payout prediction
> market regulated under the CNAD framework here in El Salvador.
>
> We're shortlisting Monetae as our primary tokenization + custody
> provider. Your stack (PSAD + PSB licenses, Fireblocks custody,
> Sumsub + Chainalysis) aligns exactly with what we need to operate
> with regulator-grade compliance from day one.
>
> Before we proceed, the central question for our use case: do you
> natively support — or are you willing to deploy — **Conditional
> Token Framework (CTF)**-style binary outcome tokens à la Polymarket?
>
> Our positions aren't long-dated securities (real estate, debt,
> equity, which I see across your case studies); they're ephemeral
> event contracts that spawn on event creation, mint outcome tokens
> on user purchase, and burn/redeem on resolution. We'd need:
>
> 1. CTF or equivalent multi-token contract per event (binary or
>    multi-option)
> 2. Mint / burn / redeem on-chain operations callable via API from
>    our backend
> 3. A 2-of-3 resolver multisig (Tres33 + Monetae + neutral third
>    party) authorizing event resolution
> 4. Smart wallet provisioning for our users — we'd prefer embedded
>    wallets (Privy or your equivalent) so the experience stays
>    inside our app
> 5. KYC bridging with our existing Didit integration (we're already
>    live on T1/T2/T3)
> 6. USDC collateral custody for the locked CTF pools
>
> If CTF is in your roadmap or a custom build via your "Blockchain
> Solutions" line, I'd like to scope it out. If it's not a fit,
> better to know now so we can pursue Tokeny + a Salvadoran legal
> wrapper as plan B.
>
> Booked your Calendly for next week. Looking forward to talking.
>
> Best,
> Kim Allen Chee
> Tres33 SAS de CV
> www.b1n0.com

**Call agenda (45 min — this is the most important of the three):**
- 5 min: b1n0 product + why tokenization matters for our regulatory positioning
- 5 min: CTF question — direct answer before going further
- 10 min: If yes, scope + cost model (per-deploy vs per-mint, monthly platform fee)
- 5 min: Custody architecture — FBO vault separation, resolver multisig
- 5 min: KYC bridging from Didit
- 5 min: Smart wallet partnership (Privy / Monetae-native / Coinbase Smart Wallet)
- 5 min: Timeline — pilot in shadow mode, then authoritative
- 5 min: Next steps + commercial discussion

---

## One-pager (attach to all three emails)

Generate a one-page PDF from `scripts/build_payments_one_pager.py` (TODO
— not yet written). Contents:

1. b1n0 logo + tagline ("Mercado de opciones sobre eventos para Centroamérica")
2. Company facts: Tres33 SAS de CV, NIT, El Salvador HQ
3. Product stage: live at www.b1n0.com, X users, $Y in pools
4. Regulatory: CNAD framework, Didit KYC live, looking for PSAD + PSB partners
5. Architecture diagram: User ↔ b1n0 ↔ [Redbajas | Vudy | Monetae] ↔ rails/chains/custody
6. Where this vendor fits in the stack (customizable per recipient)
7. Contact: kimallenchee@gmail.com + WhatsApp +503 …

---

## After the calls — comparison matrix

Update `docs/vendor-comparison.md` (TODO — to be created after first round of calls) with:

| Vendor      | License fit | Vertical accepted? | Tech fit | Cost | Timeline | Decision |
|-------------|-------------|--------------------|----------|------|----------|----------|
| Redbajas    | ✅          | ?                  | ?        | ?    | ?        | ?        |
| Vudy        | ✅          | ?                  | ?        | ?    | ?        | ?        |
| Monetae     | ✅          | ?                  | ?        | ?    | ?        | ?        |
