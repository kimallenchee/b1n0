import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
  const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { article_ids } = await req.json() as { article_ids: string[] }

  if (!article_ids?.length) {
    return new Response(JSON.stringify({ error: 'No article_ids' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: articles } = await supabase
    .from('news_articles')
    .select('id, headline, original_headline, category')
    .in('id', article_ids)

  if (!articles?.length) {
    return new Response(JSON.stringify({ error: 'No articles found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const results: { id: string; ai_headline?: string; image_url?: string; error?: string }[] = []

  for (const article of articles) {
    const original = article.original_headline || article.headline
    let aiHeadline = original
    let imageUrl: string | null = null

    // ── Step 1: Rewrite headline with Claude ──
    if (ANTHROPIC_KEY) {
      try {
        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 120,
            messages: [{
              role: 'user',
              content: `Reescribí este titular de noticias en español centroamericano. Hacelo más provocativo, directo y que genere curiosidad — como si un amigo te estuviera contando algo que no podés creer. Máximo 15 palabras. No uses comillas. Solo devolvé el titular reescrito, nada más.

Titular original: ${original}`,
            }],
          }),
        })
        const claudeData = await claudeResp.json()
        const text = claudeData?.content?.[0]?.text?.trim()
        if (text) aiHeadline = text
      } catch (e) {
        console.error('Claude error:', e)
      }
    }

    // ── Step 2: Generate image with DALL-E ──
    if (OPENAI_KEY) {
      try {
        const dalleResp = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_KEY}`,
          },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: `Photojournalism style, editorial news photo for this headline: "${aiHeadline}". Dramatic lighting, high contrast, no text or words in the image. Central American context.`,
            n: 1,
            size: '1792x1024',
            quality: 'standard',
          }),
        })
        const dalleData = await dalleResp.json()
        const tempUrl = dalleData?.data?.[0]?.url

        if (tempUrl) {
          // Download and upload to Supabase Storage
          const imgResp = await fetch(tempUrl)
          const imgBlob = await imgResp.blob()
          const fileName = `news/${article.id}.webp`

          await supabase.storage.from('news-images').upload(fileName, imgBlob, {
            contentType: 'image/webp',
            upsert: true,
          })

          const { data: urlData } = supabase.storage.from('news-images').getPublicUrl(fileName)
          imageUrl = urlData?.publicUrl || null
        }
      } catch (e) {
        console.error('DALL-E error:', e)
      }
    }

    // ── Step 3: Update article in DB ──
    const updates: Record<string, unknown> = {
      original_headline: original,
      ai_headline: aiHeadline,
      headline: aiHeadline,
    }
    if (imageUrl) updates.image_url = imageUrl

    await supabase.from('news_articles').update(updates).eq('id', article.id)

    results.push({ id: article.id, ai_headline: aiHeadline, image_url: imageUrl || undefined })
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
