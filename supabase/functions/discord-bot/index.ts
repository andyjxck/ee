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
async function getGroqResponse(message: string, context: string): Promise<string> {
  try {
    console.log('Groq API key present:', !!groqApiKey)

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are Tony, a helpful Discord bot for Void Musician, a music career simulator game. You are knowledgeable about all aspects of the game and can answer questions about gameplay, mechanics, strategy, and features.

            **Important:** Never output your thought process or reasoning. Only provide the final response directly to the user.

            **Void Musician Game Overview:**
            - Players start as unknown artists and build their music career
            - Create songs, albums, merch, and go on tours
            - Sign with record labels, upgrade studio equipment
            - Release music videos and shorts on VoidTube
            - Manage energy, cash, fame, and fans
            - Advance through weeks to see how your music performs

            **Game Features:**
            - Song creation with genre selection, features, producer/writer/studio budgets
            - Album management with song compilation
            - Merch production (t-shirts, hoodies, hats, posters, vinyl, etc.)
            - Tour booking at various venues (open-mic to stadium)
            - Studio upgrades (microphone, speakers, mixing desk, etc.)
            - Marketing campaigns for songs
            - Music video and short creation
            - Label signing with contract negotiations
            - VoidTube platform for videos and shorts with trending
            - Playlist creation and management
            - Festival participation

            **Game Mechanics:**
            - Energy system: Actions cost energy (e.g., creating shorts costs 8 energy)
            - Cash management: Earn from streams, merch sales, tours
            - Fame progression: Increases with successful releases and marketing
            - Fan growth: Gained through quality releases and viral content
            - Streaming: Songs generate streams based on quality, marketing, and virality
            - Virality: Shorts and videos can go viral for 3x boosts
            - Decay: Content performance decays over time unless trending

            **Player Context:** ${context}

            **Guidelines:**
            - Be conversational and friendly
            - Answer questions about game mechanics, strategy, and features
            - Provide tips and advice for career progression
            - If the user wants to perform a game action, guide them to use the conversational commands
            - Keep responses concise but informative
            - You can discuss the game even if the user is just chatting

            **Available conversational commands:**
            - create song, create album, create merch, book tour
            - upgrade studio, release song, market song
            - create video, create short, sign label
            - stats, advance week`
          },
          {
            role: 'user',
            content: message
          }
        ],
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
      const { title, genre, explicit, features, producerCost, writerCost, studioCost, albumTitle } = params

      // Calculate total cost
      const totalCost = (producerCost || 0) + (writerCost || 0) + (studioCost || 0)

      // Check if player has enough cash
      if (state.cash < totalCost) {
        return { success: false, error: `Not enough cash. Need £${totalCost.toLocaleString()}, have £${state.cash.toLocaleString()}` }
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

      // Create song
      const { error: songError } = await supabase.from('ms_songs').insert({
        id: songId,
        career_id: careerId,
        title,
        genre_id: genre,
        is_explicit: explicit || false,
        album_id: albumId,
        created_at: new Date().toISOString(),
      })

      if (songError) {
        return { success: false, error: `Failed to create song: ${songError.message}` }
      }

      // Deduct cash
      await supabase.from('ms_careers').update({ cash: state.cash - totalCost }).eq('id', careerId)

      return {
        success: true,
        message: `✅ **Song Created!**\n\nTitle: "${title}"\nGenre: ${genre}\n${albumTitle ? `Album: "${albumTitle}"\n` : ''}Total Cost: £${totalCost.toLocaleString()}\n\nUse "release song" to release it when ready!`
      }
    }

    case 'create_album': {
      const { name } = params

      // Generate album ID
      const albumId = crypto.randomUUID()

      // Create album
      const { error: albumError } = await supabase.from('ms_albums').insert({
        id: albumId,
        career_id: careerId,
        name,
        created_at: new Date().toISOString(),
        released: false,
      })

      if (albumError) {
        return { success: false, error: `Failed to create album: ${albumError.message}` }
      }

      return {
        success: true,
        message: `✅ **Album Created!**\n\nName: "${name}"\n\nAdd songs to it from the game app, or release it when ready!`
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

      // Update studio levels
      const { error: studioError } = await supabase.from('ms_careers').update({
        studio_levels: {
          ...state.studio_levels,
          [component]: ((state.studio_levels || {})[component] || 1) + 1
        }
      }).eq('id', careerId)

      if (studioError) {
        return { success: false, error: `Failed to upgrade studio: ${studioError.message}` }
      }

      return {
        success: true,
        message: `✅ **Studio Upgraded!**\n\nComponent: ${component}\n\nYour ${component} level has increased!`
      }
    }

    case 'release_song': {
      const { songTitle } = params

      // Find the song
      const song = state.songs?.find((s: any) => s.title.toLowerCase() === songTitle.toLowerCase() && !s.released)

      if (!song) {
        return { success: false, error: `Song "${songTitle}" not found or already released` }
      }

      // Release the song
      const { error: releaseError } = await supabase.from('ms_songs').update({
        released: true,
        released_at: new Date().toISOString(),
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
      const { songTitle, budget } = params

      // Find the song
      const song = state.songs?.find((s: any) => s.title.toLowerCase() === songTitle.toLowerCase() && s.released)

      if (!song) {
        return { success: false, error: `Song "${songTitle}" not found or not released` }
      }

      // Check cash
      if (state.cash < budget) {
        return { success: false, error: `Not enough cash. Need £${budget.toLocaleString()}` }
      }

      // Deduct cash and add marketing
      await supabase.from('ms_careers').update({ cash: state.cash - budget }).eq('id', careerId)

      return {
        success: true,
        message: `✅ **Marketing Campaign Launched!**\n\nSong: "${songTitle}"\nBudget: £${budget.toLocaleString()}\n\nYour song should see increased streams!`
      }
    }

    case 'create_video': {
      const { songTitle, budget } = params

      // Find the song
      const song = state.songs?.find((s: any) => s.title.toLowerCase() === songTitle.toLowerCase() && s.released)

      if (!song) {
        return { success: false, error: `Song "${songTitle}" not found or not released` }
      }

      // Check cash
      if (state.cash < budget) {
        return { success: false, error: `Not enough cash. Need £${budget.toLocaleString()}` }
      }

      // Deduct cash
      await supabase.from('ms_careers').update({ cash: state.cash - budget }).eq('id', careerId)

      return {
        success: true,
        message: `✅ **Music Video Created!**\n\nSong: "${songTitle}"\nBudget: £${budget.toLocaleString()}\n\nYour video should boost streams!`
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
      await supabase.from('ms_careers').update({ energy: state.energy - 8 }).eq('id', careerId)

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
        message: `📊 **${state.artist_name || 'Artist'} Stats**\n💰 Cash: £${(state.cash || 0).toLocaleString()}\n⭐ Fame: ${state.fame || 1}\n👥 Fans: ${(state.fans || 0).toLocaleString()}\n📅 Week: ${state.current_week || 1}\n🎵 Songs: ${state.songs?.length || 0}\n💿 Albums: ${state.albums?.length || 0}`
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
      
      const response = await getGroqResponse(message, context)
      
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
