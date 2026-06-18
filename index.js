const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');

// Configuration from environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SUPABASE_EDGE_FUNCTION_URL = process.env.SUPABASE_EDGE_FUNCTION_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Conversation state tracker (in-memory, use Redis for production)
const conversations = new Map();

// Game constants (matching the game)
const GENRES = ['pop', 'hip hop', 'rock', 'electronic', 'r&b', 'country', 'jazz', 'classical', 'indie', 'alternative'];
const SONG_FEATURES = ['vocals', 'instrumental', 'collab', 'remix', 'acoustic', 'electronic', 'live', 'produced'];
const MERCH_TYPES = ['t-shirt', 'hoodie', 'hat', 'poster', 'accessory', 'vinyl', 'cd', 'digital'];
const TOUR_VENUES = ['open-mic', 'local-bar', 'small-club', 'mid-venue', 'theatre', 'arena', 'stadium', 'world-tour'];
const FESTIVAL_TYPES = ['local', 'mid', 'major', 'elite'];

// Conversation flow handlers
async function handleConversation(message, userMessage) {
  const userId = message.author.id;
  const conversation = conversations.get(userId);

  // Always strip bot mention from user message
  const cleanMessage = userMessage.replace(BOT_MENTION_REGEX, '').trim();

  if (!conversation) {
    // Start new conversation based on intent
    const intent = detectIntent(cleanMessage);
    if (intent === 'create_song') {
      conversations.set(userId, {
        step: 'title',
        data: {},
        command: 'create_song'
      });
      await message.reply(
        '🎵 **Let\'s create a new song!**\n\n' +
        'What should the song be called?'
      );
      return;
    } else if (intent === 'create_album') {
      conversations.set(userId, {
        step: 'name',
        data: {},
        command: 'create_album'
      });
      await message.reply(
        '💿 **Let\'s create a new album!**\n\n' +
        'What should the album be called?'
      );
      return;
    } else if (intent === 'create_merch') {
      conversations.set(userId, {
        step: 'type',
        data: {},
        command: 'create_merch'
      });
      await message.reply(
        '👕 **Let\'s create new merch!**\n\n' +
        'What type of merch?\n' +
        'Options: ' + MERCH_TYPES.join(', ')
      );
      return;
    } else if (intent === 'book_tour') {
      conversations.set(userId, {
        step: 'venue',
        data: {},
        command: 'book_tour'
      });
      await message.reply(
        '🎤 **Let\'s book a tour!**\n\n' +
        'What venue type?\n' +
        'Options: ' + TOUR_VENUES.join(', ')
      );
      return;
    } else if (intent === 'upgrade_studio') {
      conversations.set(userId, {
        step: 'component',
        data: {},
        command: 'upgrade_studio'
      });
      await message.reply(
        '🎚️ **Let\'s upgrade your studio!**\n\n' +
        'Which component?\n' +
        'Options: vocals, production, mixing, mastering'
      );
      return;
    } else if (intent === 'view_stats') {
      return handleGameCommand(message, 'view stats');
    } else if (intent === 'advance_week') {
      return handleGameCommand(message, 'advance week');
    } else if (intent === 'release_song') {
      conversations.set(userId, {
        step: 'song_select',
        data: {},
        command: 'release_song'
      });
      await message.reply(
        '📀 **Let\'s release a song!**\n\n' +
        'Which song? (Say the song title or "list" to see your unreleased songs)'
      );
      return;
    } else if (intent === 'market_song') {
      conversations.set(userId, {
        step: 'song_select',
        data: {},
        command: 'market_song'
      });
      await message.reply(
        '📢 **Let\'s market a song!**\n\n' +
        'Which song? (Say the song title or "list" to see your released songs)'
      );
      return;
    } else if (intent === 'create_video') {
      conversations.set(userId, {
        step: 'song_select',
        data: {},
        command: 'create_video'
      });
      await message.reply(
        '🎬 **Let\'s create a music video!**\n\n' +
        'Which song? (Say the song title or "list" to see your released songs)'
      );
      return;
    } else if (intent === 'create_short') {
      conversations.set(userId, {
        step: 'song_select',
        data: {},
        command: 'create_short'
      });
      await message.reply(
        '📱 **Let\'s create a short!**\n\n' +
        'Which song? (Say the song title or "list" to see your released songs)'
      );
      return;
    } else if (intent === 'sign_label') {
      conversations.set(userId, {
        step: 'label_select',
        data: {},
        command: 'sign_label'
      });
      await message.reply(
        '📝 **Let\'s sign with a label!**\n\n' +
        'Which label? (Say the label name or "list" to see available labels)'
      );
      return;
    } else if (intent === 'cancel') {
      await message.reply('No active conversation to cancel.');
      return;
    } else {
      // Fall through to AI chat
      await handleChat(message, cleanMessage);
      return;
    }
  }

  // Continue existing conversation
  return continueConversation(message, cleanMessage, conversation);
}

function detectIntent(message) {
  const lower = message.toLowerCase();
  if ((lower.includes('create') && lower.includes('song')) || lower.includes('new song') || lower.includes('make song') || lower.includes('write song')) {
    return 'create_song';
  }
  if ((lower.includes('create') && lower.includes('album')) || lower.includes('new album') || lower.includes('make album')) {
    return 'create_album';
  }
  if ((lower.includes('create') && lower.includes('merch')) || lower.includes('new merch') || lower.includes('make merch') || lower.includes('design merch')) {
    return 'create_merch';
  }
  if ((lower.includes('book') && lower.includes('tour')) || lower.includes('go on tour') || lower.includes('start tour')) {
    return 'book_tour';
  }
  if ((lower.includes('upgrade') && lower.includes('studio')) || lower.includes('improve studio') || lower.includes('studio upgrade')) {
    return 'upgrade_studio';
  }
  if ((lower.includes('release') && lower.includes('song')) || lower.includes('drop song') || lower.includes('publish song')) {
    return 'release_song';
  }
  if (lower.includes('market') || lower.includes('promote') || lower.includes('advertise')) {
    return 'market_song';
  }
  if (lower.includes('video') || lower.includes('music video') || lower.includes('mv')) {
    return 'create_video';
  }
  if (lower.includes('short') || lower.includes('tiktok') || lower.includes('reels')) {
    return 'create_short';
  }
  if ((lower.includes('sign') && lower.includes('label')) || lower.includes('join label') || lower.includes('label deal')) {
    return 'sign_label';
  }
  if (lower.includes('stats') || lower.includes('status') || lower.includes('progress') || lower.includes('how am i doing')) {
    return 'view_stats';
  }
  if ((lower.includes('advance') && lower.includes('week')) || lower.includes('next week') || lower.includes('skip week') || lower.includes('end week')) {
    return 'advance_week';
  }
  if (lower === 'cancel' || lower === 'stop' || lower === 'nevermind') {
    return 'cancel';
  }
  return null;
}

async function continueConversation(message, userMessage, conversation) {
  const userId = message.author.id;
  // Strip bot mention from user message
  const cleanMessage = userMessage.replace(BOT_MENTION_REGEX, '').trim();
  const lower = cleanMessage.toLowerCase().trim();

  // Check for cancel or help FIRST
  if (lower === 'cancel' || lower === 'stop' || lower === 'nevermind') {
    conversations.delete(userId);
    await message.reply('❌ Conversation cancelled.');
    return;
  }

  if (lower === 'help') {
    await message.reply(getHelpMessage());
    return;
  }

  switch (conversation.command) {
    case 'create_song':
      await continueSongCreation(message, cleanMessage, conversation);
      return;
    case 'create_album':
      await continueAlbumCreation(message, cleanMessage, conversation);
      return;
    case 'create_merch':
      await continueMerchCreation(message, cleanMessage, conversation);
      return;
    case 'book_tour':
      await continueTourBooking(message, cleanMessage, conversation);
      return;
    case 'upgrade_studio':
      await continueStudioUpgrade(message, cleanMessage, conversation);
      return;
    case 'release_song':
      await continueSongRelease(message, cleanMessage, conversation);
      return;
    case 'market_song':
      await continueSongMarketing(message, cleanMessage, conversation);
      return;
    case 'create_video':
      await continueVideoCreation(message, cleanMessage, conversation);
      return;
    case 'create_short':
      await continueShortCreation(message, cleanMessage, conversation);
      return;
    case 'sign_label':
      await continueLabelSigning(message, cleanMessage, conversation);
      return;
    default:
      conversations.delete(userId);
      await message.reply('Conversation reset. Try again!');
      return;
  }
}

async function continueSongCreation(message, input, conversation) {
  const userId = message.author.id;

  switch (conversation.step) {
    case 'title':
      if (!input || input.length < 2) {
        await message.reply('Please enter a valid song title (at least 2 characters).');
        return;
      }
      conversation.data.title = input;
      conversation.step = 'genre';
      conversations.set(userId, conversation);
      await message.reply(
        `Title: **"${input}"**\n\n` +
        'What genre?\n' +
        'Options: ' + GENRES.join(', ')
      );
      return;

    case 'genre':
      console.log('Genre input:', input, 'Lower:', input.toLowerCase());
      if (!GENRES.includes(input.toLowerCase())) {
        await message.reply(`Please choose a valid genre: ${GENRES.join(', ')}`);
        return;
      }
      conversation.data.genre = input.toLowerCase();
      conversation.step = 'explicit';
      conversations.set(userId, conversation);
      await message.reply(
        `Genre: **${input}**\n\n` +
        'Should this song be explicit? (yes/no)'
      );
      return;

    case 'explicit':
      const isExplicit = input === 'yes' || input === 'y';
      conversation.data.explicit = isExplicit;
      conversation.step = 'features';
      conversations.set(userId, conversation);
      await message.reply(
        `Explicit: **${isExplicit ? 'Yes' : 'No'}**\n\n` +
        'What features should the song have?\n' +
        'Options: ' + SONG_FEATURES.join(', ') + '\n' +
        '(You can list multiple, separated by commas)'
      );
      return;

    case 'features':
      const selectedFeatures = input.split(',').map(f => f.trim()).filter(f => SONG_FEATURES.includes(f));
      if (selectedFeatures.length === 0) {
        await message.reply(`Please choose valid features: ${SONG_FEATURES.join(', ')}`);
        return;
      }
      conversation.data.features = selectedFeatures;
      conversation.step = 'producer';
      conversations.set(userId, conversation);
      await message.reply(
        `Features: **${selectedFeatures.join(', ')}**\n\n` +
        'Producer budget? (Amount in £, e.g., "5000" or "0" for no producer)'
      );
      return;

    case 'producer':
      const producerCost = parseInt(input);
      if (isNaN(producerCost) || producerCost < 0) {
        await message.reply('Please enter a valid number (0 or higher).');
        return;
      }
      conversation.data.producerCost = producerCost;
      conversation.step = 'writer';
      conversations.set(userId, conversation);
      await message.reply(
        `Producer budget: £${producerCost.toLocaleString()}\n\n` +
        'Writer budget? (Amount in £, e.g., "3000" or "0" for no writer)'
      );
      return;

    case 'writer':
      const writerCost = parseInt(input);
      if (isNaN(writerCost) || writerCost < 0) {
        await message.reply('Please enter a valid number (0 or higher).');
        return;
      }
      conversation.data.writerCost = writerCost;
      conversation.step = 'studio';
      conversations.set(userId, conversation);
      await message.reply(
        `Writer budget: £${writerCost.toLocaleString()}\n\n` +
        'Studio budget? (Amount in £, e.g., "2000" or "0" for default studio)'
      );
      return;

    case 'studio':
      const studioCost = parseInt(input);
      if (isNaN(studioCost) || studioCost < 0) {
        await message.reply('Please enter a valid number (0 or higher).');
        return;
      }
      conversation.data.studioCost = studioCost;
      conversation.step = 'album';
      conversations.set(userId, conversation);
      await message.reply(
        `Studio budget: £${studioCost.toLocaleString()}\n\n` +
        'Add to an album? (Enter album name or "no" for standalone single)'
      );
      return;

    case 'album':
      if (input === 'no' || input === 'n') {
        conversation.data.albumTitle = null;
      } else {
        conversation.data.albumTitle = input;
      }
      conversation.step = 'confirm';
      conversations.set(userId, conversation);
      const summary = `
**🎵 Song Summary**
Title: "${conversation.data.title}"
Genre: ${conversation.data.genre}
Explicit: ${conversation.data.explicit ? 'Yes' : 'No'}
Features: ${conversation.data.features.join(', ')}
Producer: £${conversation.data.producerCost.toLocaleString()}
Writer: £${conversation.data.writerCost.toLocaleString()}
Studio: £${conversation.data.studioCost.toLocaleString()}
Album: ${conversation.data.albumTitle || 'Standalone single'}

Total cost: £${(conversation.data.producerCost + conversation.data.writerCost + conversation.data.studioCost).toLocaleString()}

Confirm? (yes/no)`;
      await message.reply(summary);
      return;

    case 'confirm':
      if (input === 'yes' || input === 'y') {
        conversations.delete(userId);
        const result = await callEdgeFunction('create_song', {
          userId: message.author.id,
          ...conversation.data
        });
        if (result.success) {
          await message.reply(`✅ **Song created!**\n\n${result.message}`);
        } else {
          await message.reply(`❌ **Error:** ${result.error}`);
        }
      } else {
        conversations.delete(userId);
        await message.reply('❌ Song creation cancelled.');
      }
      return;
  }
}

async function continueAlbumCreation(message, input, conversation) {
  const userId = message.author.id;

  switch (conversation.step) {
    case 'name':
      if (!input || input.length < 2) {
        await message.reply('Please enter a valid album name (at least 2 characters).');
        return;
      }
      conversation.data.name = input;
      conversation.step = 'confirm';
      conversations.set(userId, conversation);
      await message.reply(
        `Album name: **"${input}"**\n\n` +
        'Confirm album creation? (yes/no)'
      );
      return;

    case 'confirm':
      if (input === 'yes' || input === 'y') {
        conversations.delete(userId);
        const result = await callEdgeFunction('create_album', {
          userId: message.author.id,
          ...conversation.data
        });
        if (result.success) {
          await message.reply(`✅ **Album created!**\n\n${result.message}`);
        } else {
          await message.reply(`❌ **Error:** ${result.error}`);
        }
      } else {
        conversations.delete(userId);
        await message.reply('❌ Album creation cancelled.');
      }
      return;
  }
}

async function continueMerchCreation(message, input, conversation) {
  const userId = message.author.id;

  switch (conversation.step) {
    case 'type':
      if (!MERCH_TYPES.includes(input)) {
        await message.reply(`Please choose a valid type: ${MERCH_TYPES.join(', ')}`);
        return;
      }
      conversation.data.type = input;
      conversation.step = 'quantity';
      conversations.set(userId, conversation);
      await message.reply(
        `Type: **${input}**\n\n` +
        'How many units to produce?'
      );
      return;

    case 'quantity':
      const quantity = parseInt(input);
      if (isNaN(quantity) || quantity < 1) {
        await message.reply('Please enter a valid number (1 or higher).');
        return;
      }
      conversation.data.quantity = quantity;
      conversation.step = 'price';
      conversations.set(userId, conversation);
      await message.reply(
        `Quantity: **${quantity}**\n\n` +
        'Set price per unit? (Amount in £, or "default" for auto-pricing)'
      );
      return;

    case 'price':
      if (input === 'default' || input === 'd') {
        conversation.data.price = null;
      } else {
        const price = parseInt(input);
        if (isNaN(price) || price < 0) {
          await message.reply('Please enter a valid number or "default".');
          return;
        }
        conversation.data.price = price;
      }
      conversation.step = 'confirm';
      conversations.set(userId, conversation);
      const summary = `
**👕 Merch Summary**
Type: ${conversation.data.type}
Quantity: ${conversation.data.quantity}
Price: ${conversation.data.price ? '£' + conversation.data.price.toLocaleString() : 'Auto'}

Confirm? (yes/no)`;
      await message.reply(summary);
      return;

    case 'confirm':
      if (input === 'yes' || input === 'y') {
        conversations.delete(userId);
        const result = await callEdgeFunction('create_merch', {
          userId: message.author.id,
          ...conversation.data
        });
        if (result.success) {
          await message.reply(`✅ **Merch created!**\n\n${result.message}`);
        } else {
          await message.reply(`❌ **Error:** ${result.error}`);
        }
      } else {
        conversations.delete(userId);
        await message.reply('❌ Merch creation cancelled.');
      }
      return;
  }
}

async function continueTourBooking(message, input, conversation) {
  const userId = message.author.id;

  switch (conversation.step) {
    case 'venue':
      if (!TOUR_VENUES.includes(input)) {
        await message.reply(`Please choose a valid venue: ${TOUR_VENUES.join(', ')}`);
        return;
      }
      conversation.data.venue = input;
      conversation.step = 'confirm';
      conversations.set(userId, conversation);
      await message.reply(
        `Venue: **${input}**\n\n` +
        'Confirm tour booking? (yes/no)'
      );
      return;

    case 'confirm':
      if (input === 'yes' || input === 'y') {
        conversations.delete(userId);
        const result = await callEdgeFunction('book_tour', {
          userId: message.author.id,
          ...conversation.data
        });
        if (result.success) {
          await message.reply(`✅ **Tour booked!**\n\n${result.message}`);
        } else {
          await message.reply(`❌ **Error:** ${result.error}`);
        }
      } else {
        conversations.delete(userId);
        await message.reply('❌ Tour booking cancelled.');
      }
      return;
  }
}

async function continueStudioUpgrade(message, input, conversation) {
  const userId = message.author.id;

  switch (conversation.step) {
    case 'component':
      const components = ['vocals', 'production', 'mixing', 'mastering'];
      if (!components.includes(input)) {
        await message.reply(`Please choose a valid component: ${components.join(', ')}`);
        return;
      }
      conversation.data.component = input;
      conversation.step = 'confirm';
      conversations.set(userId, conversation);
      await message.reply(
        `Component: **${input}**\n\n` +
        'Confirm studio upgrade? (yes/no)'
      );
      return;

    case 'confirm':
      if (input === 'yes' || input === 'y') {
        conversations.delete(userId);
        const result = await callEdgeFunction('upgrade_studio', {
          userId: message.author.id,
          ...conversation.data
        });
        if (result.success) {
          await message.reply(`✅ **Studio upgraded!**\n\n${result.message}`);
        } else {
          await message.reply(`❌ **Error:** ${result.error}`);
        }
      } else {
        conversations.delete(userId);
        await message.reply('❌ Studio upgrade cancelled.');
      }
      return;
  }
}

async function continueSongRelease(message, input, conversation) {
  const userId = message.author.id;

  switch (conversation.step) {
    case 'song_select':
      conversation.data.songTitle = input;
      conversation.step = 'confirm';
      conversations.set(userId, conversation);
      await message.reply(
        `Song: **"${input}"**\n\n` +
        'Confirm release? (yes/no)'
      );
      return;

    case 'confirm':
      if (input === 'yes' || input === 'y') {
        conversations.delete(userId);
        const result = await callEdgeFunction('release_song', {
          userId: message.author.id,
          songTitle: conversation.data.songTitle
        });
        if (result.success) {
          await message.reply(`✅ **Song released!**\n\n${result.message}`);
        } else {
          await message.reply(`❌ **Error:** ${result.error}`);
        }
      } else {
        conversations.delete(userId);
        await message.reply('❌ Release cancelled.');
      }
      return;
  }
}

async function continueSongMarketing(message, input, conversation) {
  const userId = message.author.id;

  switch (conversation.step) {
    case 'song_select':
      conversation.data.songTitle = input;
      conversation.step = 'budget';
      conversations.set(userId, conversation);
      await message.reply(
        `Song: **"${input}"**\n\n` +
        'Marketing budget? (Amount in £)'
      );
      return;

    case 'budget':
      const budget = parseInt(input);
      if (isNaN(budget) || budget < 0) {
        await message.reply('Please enter a valid number (0 or higher).');
        return;
      }
      conversation.data.budget = budget;
      conversation.step = 'confirm';
      conversations.set(userId, conversation);
      await message.reply(
        `Budget: £${budget.toLocaleString()}\n\n` +
        'Confirm marketing campaign? (yes/no)'
      );
      return;

    case 'confirm':
      if (input === 'yes' || input === 'y') {
        conversations.delete(userId);
        const result = await callEdgeFunction('market_song', {
          userId: message.author.id,
          ...conversation.data
        });
        if (result.success) {
          await message.reply(`✅ **Marketing campaign launched!**\n\n${result.message}`);
        } else {
          await message.reply(`❌ **Error:** ${result.error}`);
        }
      } else {
        conversations.delete(userId);
        await message.reply('❌ Marketing cancelled.');
      }
      return;
  }
}

async function continueVideoCreation(message, input, conversation) {
  const userId = message.author.id;

  switch (conversation.step) {
    case 'song_select':
      conversation.data.songTitle = input;
      conversation.step = 'budget';
      conversations.set(userId, conversation);
      await message.reply(
        `Song: **"${input}"**\n\n` +
        'Video budget? (Amount in £)'
      );
      return;

    case 'budget':
      const budget = parseInt(input);
      if (isNaN(budget) || budget < 0) {
        await message.reply('Please enter a valid number (0 or higher).');
        return;
      }
      conversation.data.budget = budget;
      conversation.step = 'confirm';
      conversations.set(userId, conversation);
      await message.reply(
        `Budget: £${budget.toLocaleString()}\n\n` +
        'Confirm video creation? (yes/no)'
      );
      return;

    case 'confirm':
      if (input === 'yes' || input === 'y') {
        conversations.delete(userId);
        const result = await callEdgeFunction('create_video', {
          userId: message.author.id,
          ...conversation.data
        });
        if (result.success) {
          await message.reply(`✅ **Video created!**\n\n${result.message}`);
        } else {
          await message.reply(`❌ **Error:** ${result.error}`);
        }
      } else {
        conversations.delete(userId);
        await message.reply('❌ Video creation cancelled.');
      }
      return;
  }
}

async function continueShortCreation(message, input, conversation) {
  const userId = message.author.id;

  switch (conversation.step) {
    case 'song_select':
      conversation.data.songTitle = input;
      conversation.step = 'confirm';
      conversations.set(userId, conversation);
      await message.reply(
        `Song: **"${input}"**\n\n` +
        'Confirm short creation? (yes/no)'
      );
      return;

    case 'confirm':
      if (input === 'yes' || input === 'y') {
        conversations.delete(userId);
        const result = await callEdgeFunction('create_short', {
          userId: message.author.id,
          songTitle: conversation.data.songTitle
        });
        if (result.success) {
          await message.reply(`✅ **Short created!**\n\n${result.message}`);
        } else {
          await message.reply(`❌ **Error:** ${result.error}`);
        }
      } else {
        conversations.delete(userId);
        await message.reply('❌ Short creation cancelled.');
      }
      return;
  }
}

async function continueLabelSigning(message, input, conversation) {
  const userId = message.author.id;

  switch (conversation.step) {
    case 'label_select':
      conversation.data.labelName = input;
      conversation.step = 'confirm';
      conversations.set(userId, conversation);
      await message.reply(
        `Label: **"${input}"**\n\n` +
        'Confirm label signing? (yes/no)'
      );
      return;

    case 'confirm':
      if (input === 'yes' || input === 'y') {
        conversations.delete(userId);
        const result = await callEdgeFunction('sign_label', {
          userId: message.author.id,
          labelName: conversation.data.labelName
        });
        if (result.success) {
          await message.reply(`✅ **Label signed!**\n\n${result.message}`);
        } else {
          await message.reply(`❌ **Error:** ${result.error}`);
        }
      } else {
        conversations.delete(userId);
        await message.reply('❌ Label signing cancelled.');
      }
      return;
  }
}

// Debug: Log environment variables (without exposing the full token)
console.log('Environment check:');
console.log('DISCORD_TOKEN exists:', !!DISCORD_TOKEN);
console.log('DISCORD_TOKEN length:', DISCORD_TOKEN ? DISCORD_TOKEN.length : 0);
console.log('SUPABASE_EDGE_FUNCTION_URL exists:', !!SUPABASE_EDGE_FUNCTION_URL);
console.log('SUPABASE_ANON_KEY exists:', !!SUPABASE_ANON_KEY);
console.log('SUPABASE_ANON_KEY length:', SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.length : 0);

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// Helper: Call Edge Function
async function callEdgeFunction(type, data) {
  try {
    console.log('Calling Edge Function:', { type, data: { ...data, authCode: '***' } });
    console.log('URL:', SUPABASE_EDGE_FUNCTION_URL);
    console.log('Has ANON_KEY:', !!SUPABASE_ANON_KEY);
    const response = await axios.post(SUPABASE_EDGE_FUNCTION_URL, {
      type,
      data,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
    });
    console.log('Edge Function response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Edge Function error:', error.response?.data || error.message);
    console.error('Full error:', error);
    return { success: false, error: 'Failed to connect to game server' };
  }
}

// Regex to match bot mentions
const BOT_MENTION_REGEX = /<@!?(\d+)>/;

// Handle link command in DM
async function handleLinkCommand(message, args) {
  const parts = args.trim().split(/\s+/);
  const careerId = parts[0];
  const authCode = parts[1];

  if (!careerId || !authCode) {
    return message.reply(
      'Please provide both your Career ID and Auth Code.\n\n' +
      'Usage: `/link <career_id> <auth_code>`\n\n' +
      'Example: `/link 251 123456`\n\n' +
      'Get your Career ID from Settings.\n' +
      'Get your Auth Code from Settings (changes every 30 seconds).'
    );
  }

  const result = await callEdgeFunction('link', {
    careerId: careerId.trim(),
    authCode: authCode.trim(),
    discordUserId: message.author.id,
  });

  if (result.success) {
    return message.reply('✅ **Account linked successfully!** You can now use Tony to control your game.');
  } else {
    return message.reply(`❌ **Link failed:** ${result.error}`);
  }
}

// Handle game commands
async function handleGameCommand(message, commandText) {
  const result = await callEdgeFunction('command', {
    userId: message.author.id,
    command: commandText,
    params: {},
  });

  if (result.success) {
    return message.reply(result.message);
  } else {
    return message.reply(`❌ **Error:** ${result.error}`);
  }
}

// Handle AI chat
async function handleChat(message, userMessage) {
  const result = await callEdgeFunction('chat', {
    userId: message.author.id,
    message: userMessage,
  });

  if (result.success) {
    return message.reply(result.response);
  } else {
    return message.reply(`❌ **Error:** ${result.error}`);
  }
}

// Process incoming messages
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Handle DMs
  if (message.channel.type === 1) { // DM
    const content = message.content.trim();
    console.log('DM received:', content);

    // Link command
    if (content.toLowerCase().startsWith('/link ')) {
      const args = content.slice(6).trim();
      return handleLinkCommand(message, args);
    }

    // Help command
    if (content.toLowerCase() === '/link' || content.toLowerCase() === 'help' || content.toLowerCase() === '/help') {
      console.log('Help command matched');
      return message.reply(getHelpMessage());
    }

    // Use conversation handler for everything else
    return handleConversation(message, content);
  }

  // Handle server messages with bot mention
  if (isBotMention(message)) {
    // Remove the mention from the message
    const cleanMessage = message.content.replace(BOT_MENTION_REGEX, '').trim();

    // Link account command
    if (cleanMessage.toLowerCase().includes('link') && cleanMessage.toLowerCase().includes('account')) {
      try {
        await message.author.send(
          '🔗 **Link Your Account**\n\n' +
          'To link your Discord account to your game, I need:\n\n' +
          '1. **Career ID** - Found in Settings\n' +
          '2. **Auth Code** - Found in Settings (changes every 30 seconds)\n\n' +
          'Reply with: `/link <career_id> <any_code>`\n' +
          'Example: `/link 251 123456`'
        );
        return message.reply('✅ I\'ve sent you a DM with instructions!');
      } catch (error) {
        return message.reply('❌ I couldn\'t send you a DM. Please enable DMs in your privacy settings.');
      }
    }

    // Help command
    if (cleanMessage.toLowerCase() === 'help') {
      return message.reply(getHelpMessage());
    }

    if (!cleanMessage) {
      return message.reply('Hi! I\'m Tony. Mention me with a command like: `@tony create a song` or say `@tony link my account` to connect your game.');
    }

    // Use conversation handler for everything else
    await handleConversation(message, cleanMessage);
    return;
  }
});

// Check if message mentions the bot
function isBotMention(message) {
  return message.mentions.has(client.user);
}

function getHelpMessage() {
  return '**🎵 Tony Bot Commands**\n\n' +
    '**Account:**\n' +
    '`/link <career_id> <any_code>` - Link your Discord account to your game\n\n' +
    '**Music Creation:**\n' +
    '`create song` - Create a new song (guided conversation)\n' +
    '`create album` - Create a new album\n' +
    '`release song` - Release an unreleased song\n' +
    '`market song` - Run marketing campaign for a song\n' +
    '`create video` - Create a music video\n' +
    '`create short` - Create a short/TikTok\n\n' +
    '**Merch & Tours:**\n' +
    '`create merch` - Create new merchandise\n' +
    '`book tour` - Book a tour\n\n' +
    '**Studio & Label:**\n' +
    '`upgrade studio` - Upgrade your studio equipment\n' +
    '`sign label` - Sign with a record label\n\n' +
    '**Progress:**\n' +
    '`stats` or `status` - View your career stats\n' +
    '`advance week` - Advance to the next week\n\n' +
    '**General:**\n' +
    '`@tony <any message>` - Chat with Tony (AI assistant)\n' +
    '`cancel` - Cancel current conversation\n\n' +
    '**Tip:** Just say what you want to do naturally, Tony will guide you through it!';
}

// Bot ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log('Tony is ready to help!');
});

// Login
client.login(DISCORD_TOKEN);
