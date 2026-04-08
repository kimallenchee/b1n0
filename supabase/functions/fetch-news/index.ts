import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WPPost {
  title: { rendered: string }
  link: string
  date: string
  jetpack_featured_media_url?: string
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"').replace(/&nbsp;/g, ' ')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { source_id, api_url, source_name, country } = await req.json() as {
    source_id: string
    api_url: string
    source_name: string
    country: string
  }

  if (!api_url) {
    return new Response(JSON.stringify({ error: 'No api_url' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const baseUrl = api_url.replace(/\/$/, '')
    const resp = await fetch(
      `${baseUrl}/wp-json/wp/v2/posts?per_page=10&_fields=title,link,date,jetpack_featured_media_url`
    )

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `WordPress API returned ${resp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const posts: WPPost[] = await resp.json()

    const rows = posts.map((p) => ({
      headline: stripHtml(p.title.rendered),
      original_headline: stripHtml(p.title.rendered),
      category: 'general',
      source: source_name,
      country,
      url: p.link,
      image_url: p.jetpack_featured_media_url || null,
      published_at: new Date(p.date).toISOString(),
      active: true,
    }))

    const { data, error } = await supabase
      .from('news_articles')
      .upsert(rows, { onConflict: 'url' })
      .select('id')

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, count: posts.length, ids: data?.map((r: { id: string }) => r.id) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
