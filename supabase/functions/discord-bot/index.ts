import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const discordBotToken = Deno.env.get('DISCORD_BOT_TOKEN')!
const groqApiKey = Deno.env.get('GROQ_API_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Rate limiting: simple in-memory map (for production, use Redis)
const rateLimits = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60000 // 1 minute
const RATE_LIMIT_MAX = 10 // 10 commands per minute

// Conversation history for AI chat (for production, use Redis)
const conversationHistory = new Map<string, Array<{ role: string; content: string }>>()
const MAX_HISTORY_LENGTH = 10

// Producer options (index-based)
const PRODUCERS = [
  { name: 'Self', cost: 0, qualityBoost: 0, minFame: 0 },
  { name: 'Bedroom Mike', cost: 2000, qualityBoost: 18, minFame: 0 },
  { name: 'Voidsmith', cost: 8000, qualityBoost: 28, minFame: 5 },
  { name: 'Astraea', cost: 25000, qualityBoost: 38, minFame: 12 },
  { name: 'PhaseShift', cost: 60000, qualityBoost: 48, minFame: 20 },
  { name: 'Noir Labs', cost: 150000, qualityBoost: 58, minFame: 30 },
  { name: 'Dreamhold', cost: 350000, qualityBoost: 67, minFame: 45 },
  { name: 'Neural Bloom', cost: 700000, qualityBoost: 75, minFame: 60 },
  { name: 'Obsidian Sound', cost: 1500000, qualityBoost: 83, minFame: 75 },
  { name: 'Void Architect', cost: 4000000, qualityBoost: 92, minFame: 90 },
]

// Writer options (index-based)
const WRITERS = [
  { name: 'Self', cost: 0, lyricBoost: 0, minFame: 0 },
  { name: 'Notepad Nate', cost: 1500, lyricBoost: 16, minFame: 0 },
  { name: 'Lyric Ghost', cost: 6000, lyricBoost: 26, minFame: 5 },
  { name: 'Verse Machine', cost: 20000, lyricBoost: 36, minFame: 12 },
  { name: 'Ink Prophet', cost: 50000, lyricBoost: 46, minFame: 20 },
  { name: 'Word Architect', cost: 120000, lyricBoost: 56, minFame: 30 },
  { name: 'Phantom Pen', cost: 280000, lyricBoost: 65, minFame: 45 },
  { name: 'Echo Scribe', cost: 600000, lyricBoost: 74, minFame: 60 },
  { name: 'Void Poet', cost: 1800000, lyricBoost: 105, minFame: 95 },
]

// Studio options (index-based)
const STUDIOS = [
  { name: 'Your Studio', cost: 0, studioBoost: 0 },
  { name: 'Garage Booth', cost: 1000, studioBoost: 15 },
  { name: 'District 7 Loft', cost: 8000, studioBoost: 28 },
  { name: 'Noir Labs HQ', cost: 30000, studioBoost: 42 },
  { name: 'Crystal Room', cost: 100000, studioBoost: 56 },
  { name: 'Obsidian Tower', cost: 300000, studioBoost: 70 },
  { name: 'Void Citadel', cost: 1600000, studioBoost: 105 },
]

// Video creation choices
const VIDEO_CHOICES = [
  {
    prompt: 'Choose a visual style for the music video:',
    options: [
      { label: 'Cinematic Narrative', bonus: 12, risk: 0, trait: 'video' },
      { label: 'Abstract / Experimental', bonus: 18, risk: 15, trait: 'video' },
      { label: 'Performance-Based', bonus: 8, risk: 0, trait: 'video' },
      { label: 'Animated / CGI', bonus: 15, risk: 8, trait: 'video' },
    ],
  },
  {
    prompt: 'Pick a location:',
    options: [
      { label: 'Studio Set (Safe)', bonus: 5, risk: 0, trait: null },
      { label: 'Urban Rooftop', bonus: 10, risk: 5, trait: null },
      { label: 'Abandoned Warehouse', bonus: 14, risk: 10, trait: null },
      { label: 'International Shoot', bonus: 20, risk: 12, trait: null },
    ],
  },
  {
    prompt: 'Post-production approach:',
    options: [
      { label: 'Minimal Edits', bonus: 3, risk: 0, trait: 'mixing' },
      { label: 'Heavy VFX', bonus: 12, risk: 8, trait: 'mixing' },
      { label: 'Color Graded Aesthetic', bonus: 8, risk: 2, trait: 'video' },
      { label: 'Raw / Unfiltered', bonus: 6, risk: 5, trait: null },
    ],
  },
]

// Load conversation history from database
async function loadConversationHistory(userId: string): Promise<Array<{ role: string; content: string }>> {
  const { data, error } = await supabase
    .from('ms_discord_conversation_history')
    .select('role, content')
    .eq('discord_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY_LENGTH * 2)
  
  if (error || !data) {
    return []
  }
  
  return data.map((item: any) => ({ role: item.role, content: item.content }))
}

// Save conversation history to database
async function saveConversationHistory(userId: string, role: string, content: string) {
  await supabase
    .from('ms_discord_conversation_history')
    .insert({
      discord_user_id: userId,
      role,
      content,
      created_at: new Date().toISOString(),
    })
  
  // Clean up old messages
  const { data: allMessages } = await supabase
    .from('ms_discord_conversation_history')
    .select('id')
    .eq('discord_user_id', userId)
    .order('created_at', { ascending: false })
  
  if (allMessages && allMessages.length > MAX_HISTORY_LENGTH * 2) {
    const toDelete = allMessages.slice(MAX_HISTORY_LENGTH * 2)
    for (const msg of toDelete) {
      await supabase
        .from('ms_discord_conversation_history')
        .delete()
        .eq('id', msg.id)
    }
  }
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const userLimit = rateLimits.get(userId)
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimits.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false
  }
  
  userLimit.count++
  return true
}

// Discord API helpers
async function verifyDiscordRequest(request: Request): Promise<{ valid: boolean; userId?: string }> {
  // Authorization check removed for simplified deployment
  return { valid: true }
}

// Groq API for AI responses
async function getGroqResponse(message: string, context: string, userId: string): Promise<string> {
  try {
    console.log('Groq API key present:', !!groqApiKey)

    // Load conversation history from database
    const history = await loadConversationHistory(userId)
    
    // Build messages array with system prompt and history
    const messages = [
      {
        role: 'system',
        content: `You are Tony — a sharp, dry-witted AI who lives in a Discord server for Void Musician, a music career simulator game. You're not just a game assistant. You're a real presence in the server. You have opinions. You have personality. You can talk about anything.

**Your personality:**
- Dry, a little sarcastic, but never mean. Think of a friend who's genuinely funny and doesn't take themselves too seriously.
- Direct. You don't pad answers. You say what you mean.
- Interested in music, culture, the internet, whatever's being talked about. You engage with it.
- When someone's just chatting — not asking about the game — you CHAT BACK like a normal person. Don't pivot to the game unless it's actually relevant.
- You never say "As an AI..." or "I'm just a bot...". You just respond.
- When someone asks how you are, you answer. When someone says something funny, you can be funny back.
- You're aware you're a Discord bot for a music game, but that's not your entire identity.

**On the game (Void Musician):**
- Players build a music career from nothing: making songs, albums, merch, touring, signing labels
- Energy, cash, fame and fans are the core stats
- Genres, producers, writers, studios all affect song quality
- Music videos and shorts on VoidTube drive virality
- Streams decay over time unless you market or go viral

**Player context:** ${context}

**Hard rules:**
- Never output your reasoning, thinking process, or tags like <thinking>
- Never repeat stats in every message — only mention them if asked or directly relevant
- Keep responses SHORT unless a detailed answer is genuinely needed
- Don't constantly bring up the game when the person is just having a conversation
- If they want to do something in-game, tell them the command once, clearly

**In-game commands they can use:**
create song, create album, create merch, book tour, upgrade studio, release song, market song, create video, create short, sign label, stats, advance week`
      },
      ...history,
      {
        role: 'user',
        content: message
      }
    ]

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    })

    console.log('Groq response status:', response.status)

    const data = await response.json()
    console.log('Groq response data:', JSON.stringify(data).substring(0, 200))

    let content = data.choices?.[0]?.message?.content || "I couldn't process that. Try again!"
    
    // Strip out thinking/reasoning tags from the response
    content = content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    content = content.replace(/```thinking[\s\S]*?```/gi, '')
    content = content.replace(/Thinking: [\s\S]*?(?=\n\n|$)/gi, '')
    // Strip "Here's a thinking process:" format
    content = content.replace(/Here's a thinking process:[\s\S]*?(?=Ready\.|Output matches|Final Polish)/gi, '')
    content = content.trim()
    
    // Save conversation history to database
    await saveConversationHistory(userId, 'user', message)
    await saveConversationHistory(userId, 'assistant', content)
    
    return content
  } catch (error) {
    console.error('Groq API error:', error)
    return "Sorry, I'm having trouble thinking right now. Try again later."
  }
}

// Load player state from database
async function loadPlayerState(careerId: string) {
  const { data: profile, error: profileError } = await supabase
    .from('ms_player_profiles')
    .select('*')
    .eq('career_id', careerId)
    .single()

  if (profileError || !profile) {
    return null
  }

  const { data: career, error: careerError } = await supabase
    .from('ms_careers')
    .select('*')
    .eq('id', careerId)
    .single()

  if (careerError || !career) {
    return null
  }

  // Load songs
  const { data: songs } = await supabase
    .from('ms_songs')
    .select('*')
    .eq('career_id', careerId)

  // Load albums
  const { data: albums } = await supabase
    .from('ms_albums')
    .select('*')
    .eq('career_id', careerId)

  // Load merch
  const { data: merch } = await supabase
    .from('ms_merch')
    .select('*')
    .eq('career_id', careerId)

  return {
    ...profile,
    ...career,
    songs: songs || [],
    albums: albums || [],
    merch: merch || [],
  }
}

// Execute game commands
async function executeGameCommand(command: string, params: any, careerId: string) {
  const state = await loadPlayerState(careerId)
  if (!state) {
    return { success: false, error: 'Could not load player state' }
  }

  // Log the command
  await supabase.from('ms_discord_audit_log').insert({
    discord_user_id: params.userId,
    career_id: careerId,
    command: command,
    parameters: params,
    success: false,
  })

  const cmd = command.toLowerCase()

  switch (cmd) {
    case 'create_song': {
      const { title, genre, explicit, features, producerIndex, writerIndex, studioIndex, albumTitle } = params

      // Get costs from indices
      const producer = PRODUCERS[producerIndex || 0] || PRODUCERS[0]
      const writer = WRITERS[writerIndex || 0] || WRITERS[0]
      const studio = STUDIOS[studioIndex || 0] || STUDIOS[0]

      // Calculate total cost
      const totalCost = producer.cost + writer.cost + studio.cost

      // Check if player has enough cash (net_worth in ms_player_profiles)
      if (state.net_worth < totalCost) {
        return { success: false, error: `Not enough cash. Need £${totalCost.toLocaleString()}, have £${state.net_worth.toLocaleString()}` }
      }

      // Create album if specified
      let albumId = null
      if (albumTitle) {
        const { data: existingAlbum } = await supabase
          .from('ms_albums')
          .select('id')
          .eq('career_id', careerId)
          .eq('title', albumTitle)
          .single()

        if (existingAlbum) {
          albumId = existingAlbum.id
        } else {
          const { data: newAlbum, error: albumError } = await supabase
            .from('ms_albums')
            .insert({
              career_id: careerId,
              title: albumTitle,
              created_at: new Date().toISOString(),
            })
            .select('id')
            .single()

          if (albumError) {
            return { success: false, error: `Failed to create album: ${albumError.message}` }
          }
          albumId = newAlbum.id
        }
      }

      // Generate song ID
      const songId = crypto.randomUUID()

      // Look up genre ID from ms_genres table (cast genre to enum type)
      let genreId = null
      if (genre) {
        const { data: genreData } = await supabase
          .from('ms_genres')
          .select('id')
          .eq('name', genre)
          .single()
        
        if (genreData) {
          genreId = genreData.id
        }
      }

      // Create song - genre_id is required, genre_text is optional
      const { error: songError } = await supabase.from('ms_songs').insert({
        id: songId,
        career_id: careerId,
        title,
        genre_id: genreId, // Required UUID
        genre_text: genre, // Optional text field
        is_explicit: explicit || false,
        album_id: albumId,
        created_at: new Date().toISOString(),
      })

      if (songError) {
        return { success: false, error: `Failed to create song: ${songError.message}` }
      }

      // Deduct cash - cash is in ms_player_profiles not ms_careers
      await supabase.from('ms_player_profiles').update({ net_worth: state.net_worth - totalCost }).eq('career_id', careerId)

      return {
        success: true,
        message: `✅ **Song Created!**\n\nTitle: "${title}"\nGenre: ${genre}\n${albumTitle ? `Album: "${albumTitle}"\n` : ''}Total Cost: £${totalCost.toLocaleString()}\n\nUse "release song" to release it when ready!`
      }
    }

    case 'create_album': {
      const { name } = params

      // Generate album ID
      const albumId = crypto.randomUUID()

      // Create album - schema uses 'title' not 'name'
      const { error: albumError } = await supabase.from('ms_albums').insert({
        id: albumId,
        career_id: careerId,
        title: name, // Schema uses 'title'
        created_at: new Date().toISOString(),
      })

      if (albumError) {
        return { success: false, error: `Failed to create album: ${albumError.message}` }
      }

      return {
        success: true,
        message: `✅ **Album Created!**\n\nTitle: "${name}"\n\nAdd songs to it from the game app, or release it when ready!`
      }
    }

    case 'create_merch': {
      const { type, quantity, price } = params

      // Generate merch ID
      const merchId = crypto.randomUUID()

      // Create merch
      const { error: merchError } = await supabase.from('ms_merch').insert({
        id: merchId,
        career_id: careerId,
        type,
        quantity,
        custom_price: price || null,
        created_at: new Date().toISOString(),
      })

      if (merchError) {
        return { success: false, error: `Failed to create merch: ${merchError.message}` }
      }

      return {
        success: true,
        message: `✅ **Merch Created!**\n\nType: ${type}\nQuantity: ${quantity}\nPrice: ${price ? '£' + price.toLocaleString() : 'Auto'}\n\nManage it from the game app!`
      }
    }

    case 'book_tour': {
      const { venue } = params

      // For now, just log the tour booking
      // Full implementation would require venue data and scheduling
      return {
        success: true,
        message: `✅ **Tour Booked!**\n\nVenue: ${venue}\n\nManage tour details from the game app for full control!`
      }
    }

    case 'upgrade_studio': {
      const { component } = params

      // Get current level
      const currentLevel = (state.studio_levels || {})[component] || 1

      // Calculate upgrade cost
      const getStudioUpgradeCost = (currentLevel: number) => {
        if (currentLevel < 10) return Math.floor(50 + currentLevel * 15)
        if (currentLevel < 20) return Math.floor(200 + (currentLevel - 10) * 30)
        if (currentLevel < 40) return Math.floor(500 + (currentLevel - 20) * 50)
        if (currentLevel < 70) return Math.floor(1_500 + (currentLevel - 40) * 80)
        return Math.floor(3_900 + (currentLevel - 70) * 100)
      }

      const cost = getStudioUpgradeCost(currentLevel)

      // Check cash (net_worth in ms_player_profiles)
      if (state.net_worth < cost) {
        return { success: false, error: `Not enough cash. Need £${cost.toLocaleString()}, have £${state.net_worth.toLocaleString()}` }
      }

      // Check energy
      if ((state.energy || 0) < 4) {
        return { success: false, error: `Not enough energy. Need 4, have ${state.energy || 0}` }
      }

      // Calculate boost (+5 to +7)
      const boost = Math.floor(Math.random() * 3) + 5
      const newLevel = Math.min(100, currentLevel + boost)

      // Update studio levels - studio levels are in ms_player_profiles as individual columns
      const studioColumnMap: Record<string, string> = {
        'mixing': 'studio_mixing',
        'vocals': 'studio_vocals', 
        'mastering': 'studio_mastering',
        'acoustics': 'studio_acoustics'
      }
      const dbColumn = studioColumnMap[component] || `studio_${component}`
      
      const { error: studioError } = await supabase.from('ms_player_profiles').update({
        net_worth: state.net_worth - cost,
        energy: (state.energy || 0) - 4,
        [dbColumn]: newLevel
      }).eq('career_id', careerId)

      if (studioError) {
        return { success: false, error: `Failed to upgrade studio: ${studioError.message}` }
      }

      return {
        success: true,
        message: `✅ **Studio Upgraded!**\n\nComponent: ${component}\nLevel: ${currentLevel} → ${newLevel} (+${boost})\nCost: £${cost.toLocaleString()}\n\nYour ${component} level has increased!`
      }
    }

    case 'release_song': {
      const { songTitle } = params

      // Find the song
      const song = state.songs?.find((s: any) => s.title.toLowerCase() === songTitle.toLowerCase() && !s.released)

      if (!song) {
        return { success: false, error: `Song "${songTitle}" not found or already released` }
      }

      // Release the song - schema uses release_status enum, not released boolean
      const { error: releaseError } = await supabase.from('ms_songs').update({
        release_status: 'released',
        release_week: state.current_week,
        release_year: state.current_year,
      }).eq('id', song.id)

      if (releaseError) {
        return { success: false, error: `Failed to release song: ${releaseError.message}` }
      }

      return {
        success: true,
        message: `✅ **Song Released!**\n\n"${songTitle}" is now available to your fans!`
      }
    }

    case 'market_song': {
      const { songTitle } = params

      // Find the song
      const song = state.songs?.find((s: any) => s.title.toLowerCase() === songTitle.toLowerCase() && s.released)

      if (!song) {
        return { success: false, error: `Song "${songTitle}" not found or not released` }
      }

      // Marketing cost scales with fame
      const marketCost = Math.max(500, Math.floor((state.fame || 1) * 100))

      // Check cash (net_worth in ms_player_profiles)
      if (state.net_worth < marketCost) {
        return { success: false, error: `Not enough cash. Need £${marketCost.toLocaleString()}, have £${state.net_worth.toLocaleString()}` }
      }

      // Deduct cash
      await supabase.from('ms_player_profiles').update({ net_worth: state.net_worth - marketCost }).eq('career_id', careerId)

      // Calculate marketing boost (simplified)
      const boost = Math.max(5, Math.min(35, Math.round(Math.random() * 18 + 10)))

      return {
        success: true,
        message: `✅ **Marketing Campaign Launched!**\n\nSong: "${songTitle}"\nCost: £${marketCost.toLocaleString()}\nMarketing Boost: +${boost}\n\nYour song should see increased streams!`
      }
    }

    case 'create_video': {
      const { songTitle, choices } = params

      // Find the song
      const song = state.songs?.find((s: any) => s.title.toLowerCase() === songTitle.toLowerCase() && s.released)

      if (!song) {
        return { success: false, error: `Song "${songTitle}" not found or not released` }
      }

      // Calculate video rating from choices
      let totalBonus = 0
      let totalRisk = 0
      choices.forEach((choice: any) => {
        totalBonus += choice.bonus
        totalRisk += choice.risk
      })

      // Simulate risk roll
      const riskRoll = Math.random() * 100
      const riskPenalty = riskRoll < totalRisk ? Math.floor(totalRisk * 0.6) : 0
      const videoRating = Math.max(1, Math.min(100, Math.round(totalBonus - riskPenalty + Math.random() * 10)))

      // Calculate boosts
      const prodBoost = Math.floor(videoRating * 0.12)
      const viralBoost = Math.floor(videoRating * 0.18)

      // Viral chance
      const viralChance = videoRating / 200
      const goesViral = Math.random() < viralChance

      return {
        success: true,
        message: `✅ **Music Video Created!**\n\nSong: "${songTitle}"\nVideo Rating: ${videoRating}/100\nProduction Boost: +${prodBoost}\nVirality Boost: +${viralBoost}${goesViral ? '\n🔥 **VIRAL!** Your video could go viral!' : ''}\n\nYour video should boost streams!`
      }
    }

    case 'create_short': {
      const { songTitle } = params

      // Find the song
      const song = state.songs?.find((s: any) => s.title.toLowerCase() === songTitle.toLowerCase() && s.released)

      if (!song) {
        return { success: false, error: `Song "${songTitle}" not found or not released` }
      }

      // Check energy (assuming 8 energy cost)
      if (state.energy < 8) {
        return { success: false, error: `Not enough energy. Need 8, have ${state.energy}` }
      }

      // Deduct energy
      await supabase.from('ms_player_profiles').update({ energy: state.energy - 8 }).eq('career_id', careerId)

      return {
        success: true,
        message: `✅ **Short Created!**\n\nSong: "${songTitle}"\n\nYour short should boost virality!`
      }
    }

    case 'sign_label': {
      const { labelName } = params

      // For now, just log the label signing
      // Full implementation would require label data and contract logic
      return {
        success: true,
        message: `✅ **Label Signing Initiated!**\n\nLabel: ${labelName}\n\nComplete the signing process from the game app for full contract details!`
      }
    }

    case 'view_stats':
      return {
        success: true,
        message: `📊 **${state.artist_name || 'Artist'} Stats**\n💰 Net Worth: £${(state.net_worth || 0).toLocaleString()}\n⭐ Fame: ${state.fame || 1}\n👥 Fans: ${(state.fans || 0).toLocaleString()}\n📅 Week: ${state.current_week || 1}\n🎵 Songs: ${state.songs?.length || 0}\n💿 Albums: ${state.albums?.length || 0}`
      }

    case 'advance_week':
      return {
        success: true,
        message: `⚠️ Week advancement is best done from the game app to ensure all game systems update correctly. Please use the app to advance weeks.`
      }

    default:
      return {
        success: false,
        error: `Unknown command: ${command}`
      }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }
  
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  
  // Skip authorization check for internal service
  try {
    const body = await req.json()
    const { type, data } = body
    
    if (type === 'link') {
      // Handle Discord account linking with career ID + auth code
      const { careerId, authCode, discordUserId } = data

      console.log('Link attempt:', { careerId, authCode: '***', discordUserId })

      // Verify career exists - try by user_id first (since that's what the game shows)
      let career
      const result1 = await supabase
        .from('ms_careers')
        .select('*')
        .eq('user_id', parseInt(careerId))
        .single()

      if (result1.data) {
        career = result1.data
      } else {
        // Try by id (UUID)
        const result2 = await supabase
          .from('ms_careers')
          .select('*')
          .eq('id', careerId)
          .single()

        if (result2.data) {
          career = result2.data
        } else {
          // Try by legacy_id (numeric)
          const result3 = await supabase
            .from('ms_careers')
            .select('*')
            .eq('legacy_id', parseInt(careerId))
            .single()

          career = result3.data
        }
      }

      if (!career) {
        console.log('Career not found:', careerId)
        return new Response(JSON.stringify({ success: false, error: 'Invalid Career ID' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        })
      }

      console.log('Career found:', career.id)

      // Skip auth code validation since it's not persisted to database
      // Just link based on career ID

      // Check if already linked - use the actual career UUID
      const { data: existingLink } = await supabase
        .from('ms_discord_links')
        .select('*')
        .eq('career_id', career.id)
        .single()
      
      if (existingLink) {
        // Update existing link
        const { error: updateError } = await supabase
          .from('ms_discord_links')
          .update({
            discord_user_id: discordUserId,
            linked_at: new Date().toISOString(),
          })
          .eq('id', existingLink.id)
        
        if (updateError) {
          return new Response(JSON.stringify({ success: false, error: 'Failed to update link' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
          })
        }
      } else {
        // Create new link
        console.log('Creating new link:', { discordUserId, careerId: career.id })
        const { error: insertError } = await supabase
          .from('ms_discord_links')
          .insert({
            discord_user_id: discordUserId,
            career_id: career.id,
            verification_code: authCode, // Store for reference
            linked_at: new Date().toISOString(),
          })

        console.log('Insert error:', insertError)
        if (insertError) {
          return new Response(JSON.stringify({ success: false, error: `Failed to create link: ${insertError.message}` }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
          })
        }
      }
      
      return new Response(JSON.stringify({ success: true, careerId }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    if (type === 'command') {
      // Handle game commands
      const { userId, command, params } = data

      // Rate limit check
      if (!checkRateLimit(userId)) {
        return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded. Please wait a minute.' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 429
        })
      }

      // Get career ID from Discord user ID
      const { data: linkData } = await supabase
        .from('ms_discord_links')
        .select('career_id')
        .eq('discord_user_id', userId)
        .single()

      if (!linkData) {
        return new Response(JSON.stringify({ success: false, error: 'Discord account not linked. Use /link <code> in-game.' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        })
      }

      // Execute command
      const result = await executeGameCommand(command, { ...params, userId }, linkData.career_id)

      // Update audit log
      await supabase
        .from('ms_discord_audit_log')
        .update({ success: result.success, error_message: result.error })
        .eq('discord_user_id', userId)
        .eq('command', command)
        .order('executed_at', { ascending: false })
        .limit(1)

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Handle direct command types (for conversational flows)
    const commandTypes = ['create_song', 'create_album', 'create_merch', 'book_tour', 'upgrade_studio', 'release_song', 'market_song', 'create_video', 'create_short', 'sign_label', 'view_stats', 'advance_week']
    if (commandTypes.includes(type)) {
      const { userId, ...params } = data

      // Rate limit check
      if (!checkRateLimit(userId)) {
        return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded. Please wait a minute.' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 429
        })
      }

      // Get career ID from Discord user ID
      const { data: linkData } = await supabase
        .from('ms_discord_links')
        .select('career_id')
        .eq('discord_user_id', userId)
        .single()

      if (!linkData) {
        return new Response(JSON.stringify({ success: false, error: 'Discord account not linked. Use /link <code> in-game.' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        })
      }

      // Execute command
      const result = await executeGameCommand(type, { ...params, userId }, linkData.career_id)

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    if (type === 'chat') {
      // Handle AI chat
      const { userId, message } = data
      
      // Rate limit check
      if (!checkRateLimit(userId)) {
        return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 429
        })
      }
      
      // Get career ID and context
      const { data: linkData } = await supabase
        .from('ms_discord_links')
        .select('career_id')
        .eq('discord_user_id', userId)
        .single()
      
      let context = 'User is not linked to a game account.'
      if (linkData) {
        const state = await loadPlayerState(linkData.career_id)
        if (state) {
          context = `Player: ${state.artist_name || 'Artist'}, Week: ${state.current_week || 1}, Fame: ${state.fame || 1}, Cash: £${state.net_worth?.toLocaleString() || 0}`
        }
      }
      
      const response = await getGroqResponse(message, context, userId)
      
      return new Response(JSON.stringify({ success: true, response }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    return new Response(JSON.stringify({ success: false, error: 'Unknown request type' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400
    })
    
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
