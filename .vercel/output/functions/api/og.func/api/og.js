import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ImageResponse } from '@vercel/og';
/**
 * /api/og — dynamic Open Graph image generator.
 *
 * Renders a 1200x630 PNG card with the event's question, current
 * SÍ/NO split, and brand mark. WhatsApp / Twitter / LinkedIn embed
 * this as the link preview when someone shares /eventos/<id>.
 *
 * Inputs (query params):
 *   ?event=<id>     — event id (required)
 *
 * Implementation:
 *   - Reads event data from Supabase REST endpoint (anon key, public
 *     event data only — never sensitive)
 *   - Hand-renders the card with JSX → ImageResponse
 *   - Caches at the CDN edge for 5 minutes (s-maxage=300)
 *
 * Why edge runtime: ImageResponse uses Satori under the hood and
 * works best on Vercel's edge runtime (lower cold-start, faster
 * response). The Node runtime works too but is slower.
 */
// Note: defaulting to Node.js runtime — @vercel/og works there without
// the Edge-runtime restrictions on bundled modules. Cold start is slightly
// slower but the function still completes well under 1s for an OG image.
export const config = {
    runtime: 'nodejs',
};
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const CATEGORY_LABEL = {
    deportes: 'DEPORTES',
    politica: 'POLÍTICA',
    economia: 'ECONOMÍA',
    geopolitica: 'GEOPOLÍTICA',
    cultura: 'CULTURA',
    tecnologia: 'TECNOLOGÍA',
    finanzas: 'FINANZAS',
    otro: 'OTRO',
};
async function fetchEvent(id) {
    if (!SUPABASE_URL || !SUPABASE_KEY)
        return null;
    try {
        const url = `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}&select=id,question,category,yes_percent,no_percent,pool_size,currency,status`;
        const res = await fetch(url, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
        });
        if (!res.ok)
            return null;
        const rows = (await res.json());
        return rows[0] ?? null;
    }
    catch {
        return null;
    }
}
export default async function handler(req) {
    const url = new URL(req.url);
    const eventId = url.searchParams.get('event') || '';
    const event = eventId ? await fetchEvent(eventId) : null;
    // Brand defaults that show when no event id is given (or lookup fails)
    const question = event?.question ?? 'b1n0 — Predicciones que importan';
    const yesPct = event?.yes_percent ?? 50;
    const noPct = event?.no_percent ?? 50;
    const poolSize = event?.pool_size ?? 0;
    const category = event?.category ?? 'otro';
    const ogImage = new ImageResponse((_jsxs("div", { style: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#0d0d0d',
            color: '#f2efea',
            padding: 64,
            position: 'relative',
        }, children: [_jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }, children: [_jsx("div", { style: {
                            fontFamily: 'Syne',
                            fontWeight: 800,
                            fontSize: 56,
                            letterSpacing: -2,
                            color: '#f2efea',
                            display: 'flex',
                        }, children: "b1n0" }), _jsx("div", { style: {
                            padding: '8px 16px',
                            border: '1px solid rgba(255,255,255,0.16)',
                            borderRadius: 999,
                            fontFamily: 'Inter',
                            fontWeight: 600,
                            fontSize: 18,
                            letterSpacing: 2,
                            color: '#a09a90',
                            display: 'flex',
                        }, children: CATEGORY_LABEL[category] || 'OTRO' })] }), _jsx("div", { style: {
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    paddingTop: 40,
                    paddingBottom: 40,
                }, children: _jsx("div", { style: {
                        fontFamily: 'Syne',
                        fontWeight: 800,
                        fontSize: question.length > 90 ? 56 : 72,
                        lineHeight: 1.1,
                        letterSpacing: -2,
                        color: '#f2efea',
                        display: 'flex',
                    }, children: question }) }), _jsxs("div", { style: {
                    display: 'flex',
                    gap: 8,
                    height: 64,
                    marginBottom: 24,
                }, children: [_jsxs("div", { style: {
                            width: `${Math.max(yesPct, 12)}%`,
                            background: 'rgba(74, 222, 128, 0.16)',
                            border: '1px solid #4ade80',
                            borderRadius: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0 24px',
                            fontFamily: 'Inter',
                            fontWeight: 700,
                            fontSize: 28,
                            color: '#4ade80',
                        }, children: [_jsx("span", { style: { display: 'flex' }, children: "S\u00CD" }), _jsxs("span", { style: { display: 'flex' }, children: [yesPct, "%"] })] }), _jsxs("div", { style: {
                            flex: 1,
                            background: 'rgba(248, 113, 113, 0.14)',
                            border: '1px solid #f87171',
                            borderRadius: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0 24px',
                            fontFamily: 'Inter',
                            fontWeight: 700,
                            fontSize: 28,
                            color: '#f87171',
                        }, children: [_jsxs("span", { style: { display: 'flex' }, children: [noPct, "%"] }), _jsx("span", { style: { display: 'flex' }, children: "NO" })] })] }), _jsxs("div", { style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    fontFamily: 'Inter',
                    fontSize: 22,
                    color: '#8a8580',
                }, children: [_jsxs("div", { style: { display: 'flex' }, children: ["Pool: ", _jsxs("span", { style: { color: '#f2efea', fontWeight: 700, marginLeft: 8, display: 'flex' }, children: ["$", poolSize.toLocaleString()] })] }), _jsx("div", { style: { display: 'flex' }, children: "www.b1n0.com" })] })] })), {
        width: 1200,
        height: 630,
    });
    // Cache at CDN edge for 5 minutes — events update split percentages
    // gradually so a 5-min stale window is acceptable for shares.
    ogImage.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return ogImage;
}
//# sourceMappingURL=og.js.map