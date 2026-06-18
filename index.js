const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');

// Configuration from environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SUPABASE_EDGE_FUNCTION_URL = process.env.SUPABASE_EDGE_FUNCTION_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Conversation state tracker (in-memory, use Redis for production)
const conversations = new Map();
const processedMessages = new Set();
const processingLocks = new Map();
const replyCooldowns = new Map();
const inFlightMessages = new Set();

// Load conversation state from database
async function loadConversationState(userId) {
  try {
    const { data, error } = await supabase
      .from('ms_discord_conversation_state')
      .select('command, step, data')
      .eq('discord_user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      command: data.command,
      step: data.step,
      data: data.data
    };
  } catch (e) {
    console.error('Error loading conversation state:', e);
    return null;
  }
}

// Save conversation state to database
async function saveConversationState(userId, conversation) {
  try {
    const { error } = await supabase
      .from('ms_discord_conversation_state')
      .upsert({
        discord_user_id: userId,
        command: conversation.command,
        step: conversation.step,
        data: conversation.data,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'discord_user_id'
      });

    if (error) {
      console.error('Error saving conversation state:', error);
    }
  } catch (e) {
    console.error('Error saving conversation state:', e);
  }
}

// Delete conversation state from database
async function deleteConversationState(userId) {
  try {
    const { error } = await supabase
      .from('ms_discord_conversation_state')
      .delete()
      .eq('discord_user_id', userId);

    if (error) {
      console.error('Error deleting conversation state:', error);
    }
  } catch (e) {
    console.error('Error deleting conversation state:', e);
  }
}

// Game constants (matching the game)
const GENRE_TREE = [
  { genre: 'Pop', subgenres: ['Pop', 'Dance Pop', 'Synth Pop', 'Indie Pop', 'Art Pop', 'Dream Pop', 'Electropop', 'Bubblegum Pop', 'Hyperpop', 'K-Pop', 'J-Pop', 'Latin Pop', 'Arabic Pop', 'Afropop', 'City Pop', 'Chill Pop', 'Bedroom Pop'] },
  { genre: 'Hip Hop', subgenres: ['Hip Hop', 'Trap', 'Drill', 'Boom Bap', 'Cloud Rap', 'Emo Rap', 'Gangsta Rap', 'Conscious Hip Hop', 'Jazz Rap', 'Alternative Hip Hop', 'Grime', 'UK Drill', 'Phonk', 'Mumble Rap', 'Trap Metal'] },
  { genre: 'R&B', subgenres: ['R&B', 'Contemporary R&B', 'Neo-Soul', 'Alternative R&B', 'PBR&B', 'Soul', 'Funk', 'Motown', 'Quiet Storm', 'New Jack Swing', 'Gospel R&B', 'Smooth R&B'] },
  { genre: 'Rock', subgenres: ['Rock', 'Alternative Rock', 'Indie Rock', 'Pop Rock', 'Punk Rock', 'Hard Rock', 'Classic Rock', 'Psychedelic Rock', 'Grunge', 'Shoegaze', 'Post-Rock', 'Math Rock', 'Art Rock', 'Garage Rock', 'Arena Rock', 'Soft Rock', 'Folk Rock'] },
  { genre: 'Electronic', subgenres: ['Electronic', 'House', 'Techno', 'Dubstep', 'Trance', 'Drum & Bass', 'Ambient', 'IDM', 'Synthwave', 'Electronica', 'Glitch Hop', 'Future Bass', 'Hardstyle', 'Breakbeat', 'Downtempo', 'Chillwave', 'Vaporwave', 'UK Bass'] },
  { genre: 'Metal', subgenres: ['Metal', 'Heavy Metal', 'Death Metal', 'Black Metal', 'Doom Metal', 'Sludge Metal', 'Post-Metal', 'Nu-Metal', 'Djent', 'Thrash Metal', 'Speed Metal', 'Power Metal', 'Symphonic Metal', 'Folk Metal', 'Industrial Metal'] },
  { genre: 'Jazz', subgenres: ['Jazz', 'Jazz Fusion', 'Bebop', 'Cool Jazz', 'Free Jazz', 'Acid Jazz', 'Nu-Jazz', 'Nocturne Jazz', 'Smooth Jazz', 'Afro-Cuban Jazz', 'Modal Jazz', 'Post-Bop'] },
  { genre: 'Classical', subgenres: ['Classical', 'Neo-Classical', 'Contemporary Classical', 'Minimalist', 'Post-Chamber', 'Orchestral', 'Chamber Music', 'Opera', 'Baroque', 'Romantic', 'Avant-Garde Classical'] },
  { genre: 'Country', subgenres: ['Country', 'Country Pop', 'Outlaw Country', 'Bluegrass', 'Americana', 'Country Rock', 'Alt-Country', 'Honky Tonk', 'Country Trap', 'Folk Country'] },
  { genre: 'Folk / Acoustic', subgenres: ['Folk', 'Indie Folk', 'Folk Pop', 'Singer-Songwriter', 'Acoustic', 'Freak Folk', 'Anti-Folk', 'Celtic Folk', 'Contemporary Folk'] },
  { genre: 'World', subgenres: ['Afrobeats', 'Afropop', 'Amapiano', 'Reggaeton', 'Latin Pop', 'Salsa', 'Bossa Nova', 'Samba', 'Reggae', 'Dancehall', 'Cumbia', 'Baile Funk', 'Highlife', 'Jùjú', 'Mbalax', 'Bhangra', 'Bollywood', 'K-Wave', 'J-Rock', 'Fado', 'Flamenco'] },
  { genre: 'Experimental', subgenres: ['Experimental', 'Avant-Garde', 'Noise', 'Drone', 'Musique Concrète', 'Glitch', 'Voidwave', 'Synthcore', 'Neon Soul', 'Hypnagogic Pop', 'Deconstructed Club', 'Hauntology'] },
  { genre: 'Punk', subgenres: ['Punk', 'Punk Revival', 'Post-Punk', 'Hardcore Punk', 'Pop-Punk', 'Ska-Punk', 'Anarcho-Punk', 'Crust Punk', 'Riot Grrrl', 'Queercore'] },
  { genre: 'Dance', subgenres: ['Dance', 'EDM', 'Disco', 'Nu-Disco', 'Funk', 'Club', 'Eurodance', 'Hi-NRG', 'Italo Disco', 'Electro'] },
];

// Flat list of all genres for easy lookup
const GENRES = GENRE_TREE.flatMap(g => g.subgenres);
const SONG_FEATURES = ['Sailor Twift', 'Shed Eeran', 'Good Bunny', 'Dshovel', 'Billy Eyelash', 'Arianda Grandeur', 'The Weaknd', 'Candy West', 'Rianna', 'Bruno Bars', 'Dustin Bieber', 'M&M', 'Beyonder', 'Michael Jacket', 'Elfish Presley', 'Rob Marley', 'Maradona', 'The Beetles', 'Draft Punk', 'Stellar Voice', 'Melody Queen'];
const MERCH_TYPES = ['tshirt', 'hoodie', 'poster', 'vinyl', 'cap', 'jacket', 'figurine', 'fragrance', 'sneakers'];
const TOUR_VENUES = ['open-mic', 'local-bar', 'small-club', 'mid-venue', 'theatre', 'arena', 'stadium', 'world-tour'];
const FESTIVAL_TYPES = ['local', 'mid', 'major', 'elite'];
const STUDIO_COMPONENTS = ['mixing', 'vocals', 'mastering', 'studioMonitors', 'acoustics'];

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
];

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
];

// Studio options (index-based)
const STUDIOS = [
  { name: 'Your Studio', cost: 0, studioBoost: 0 },
  { name: 'Garage Booth', cost: 1000, studioBoost: 15 },
  { name: 'District 7 Loft', cost: 8000, studioBoost: 28 },
  { name: 'Noir Labs HQ', cost: 30000, studioBoost: 42 },
  { name: 'Crystal Room', cost: 100000, studioBoost: 56 },
  { name: 'Obsidian Tower', cost: 300000, studioBoost: 70 },
  { name: 'Void Citadel', cost: 1600000, studioBoost: 105 },
];

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
];

// AI artist feature costs (simplified - based on tier)
const FEATURE_COSTS = {
  'Sailor Twift': 50000,
  'Shed Eeran': 45000,
  'Good Bunny': 48000,
  'Dshovel': 42000,
  'Billy Eyelash': 46000,
  'Arianda Grandeur': 47000,
  'The Weaknd': 44000,
  'Candy West': 43000,
  'Rianna': 49000,
  'Bruno Bars': 41000,
  'Dustin Bieber': 40000,
  'M&M': 38000,
  'Beyonder': 50000,
  'Michael Jacket': 49000,
  'Elfish Presley': 47000,
  'Rob Marley': 45000,
  'Maradona': 43000,
  'The Beetles': 48000,
  'Draft Punk': 46000,
  'Stellar Voice': 35000,
  'Melody Queen': 34000
};

// Message parser - extracts information from natural language
function parseSongCreation(message) {
  const data = {};
  const lower = message.toLowerCase();

  // Extract title (in quotes or after "called" / "named")
  const titleMatch = message.match(/(?:called|named)\s+"([^"]+)"|called\s+(\w+)/i);
  if (titleMatch) {
    data.title = titleMatch[1] || titleMatch[2];
  }

  // Extract genre
  const genreMatch = GENRES.find(g => lower.includes(g.toLowerCase()));
  if (genreMatch) {
    data.genre = genreMatch;
  }

  // Extract features (AI artist names)
  const foundFeatures = SONG_FEATURES.filter(f => lower.includes(f.toLowerCase()));
  if (foundFeatures.length > 0) {
    data.features = foundFeatures;
  }

  // Extract album (after "album called", "in album called", "in", or "album")
  const albumMatch = message.match(/(?:album|in album)\s+(?:called|named)\s+"([^"]+)"|(?:in|album)\s+"([^"]+)"/i);
  if (albumMatch) {
    data.albumTitle = albumMatch[1] || albumMatch[2];
  }

  // Extract explicit
  data.explicit = lower.includes('explicit');

  // Extract producer by name
  const producerMatch = PRODUCERS.find((p, i) => lower.includes(p.name.toLowerCase()));
  if (producerMatch) {
    data.producerIndex = PRODUCERS.indexOf(producerMatch);
  }

  // Extract writer by name
  const writerMatch = WRITERS.find((w, i) => lower.includes(w.name.toLowerCase()));
  if (writerMatch) {
    data.writerIndex = WRITERS.indexOf(writerMatch);
  }

  // Extract studio by name
  const studioMatch = STUDIOS.find((s, i) => lower.includes(s.name.toLowerCase()));
  if (studioMatch) {
    data.studioIndex = STUDIOS.indexOf(studioMatch);
  }

  // Extract "myself/self" as index 0
  if (lower.includes('myself') || lower.includes('self') || lower.includes('my studio')) {
    data.producerIndex = 0;
    data.writerIndex = 0;
    data.studioIndex = 0;
  }

  return data;
}

function parseAlbumCreation(message) {
  const data = {};
  const lower = message.toLowerCase();

  // Extract album title (in quotes or after "called" / "named")
  const titleMatch = message.match(/(?:called|named)\s+"([^"]+)"|called\s+(\w+)/i);
  if (titleMatch) {
    data.title = titleMatch[1] || titleMatch[2];
  }

  return data;
}

function parseMerchCreation(message) {
  const data = {};
  const lower = message.toLowerCase();

  // Extract merch type
  const typeMatch = MERCH_TYPES.find(t => lower.includes(t.toLowerCase()));
  if (typeMatch) {
    data.type = typeMatch;
  }

  // Extract quantity (numbers)
  const quantityMatch = message.match(/(\d+)/);
  if (quantityMatch) {
    data.quantity = parseInt(quantityMatch[1]);
  }

  // Extract price (after "price" or "£")
  const priceMatch = message.match(/(?:price|£)\s*(\d+)/i);
  if (priceMatch) {
    data.price = parseInt(priceMatch[1]);
  }

  return data;
}

function parseTourBooking(message) {
  const data = {};
  const lower = message.toLowerCase();

  // Extract venue
  const venueMatch = TOUR_VENUES.find(v => lower.includes(v.replace('-', ' ')));
  if (venueMatch) {
    data.venue = venueMatch;
  }

  return data;
}

function parseStudioUpgrade(message) {
  const data = {};
  const lower = message.toLowerCase();

  // Extract component
  const componentMatch = STUDIO_COMPONENTS.find(c => lower.includes(c.toLowerCase()));
  if (componentMatch) {
    data.component = componentMatch;
  }

  return data;
}

// Determine which step to start at based on missing data
function determineMissingStep(command, data) {
  if (command === 'create_song') {
    if (!data.title) return 'title';
    if (!data.genre) return 'genre';
    if (data.explicit === undefined) return 'explicit';
    if (!data.features) return 'features';
    if (data.producerIndex === undefined) return 'producer';
    if (data.writerIndex === undefined) return 'writer';
    if (data.studioIndex === undefined) return 'studio';
    return 'confirm';
  }
  if (command === 'create_merch') {
    if (!data.type) return 'type';
    if (!data.quantity) return 'quantity';
    if (data.price === undefined) return 'price';
    return 'confirm';
  }
  if (command === 'book_tour') {
    if (!data.venue) return 'venue';
    return 'confirm';
  }
  if (command === 'upgrade_studio') {
    if (!data.component) return 'component';
    return 'confirm';
  }
  if (command === 'create_album') {
    if (!data.title) return 'title';
    return 'confirm';
  }
  return 'confirm';
}

// Handle each step of song creation
async function handleSongStep(message, conversation) {
  const { step, data } = conversation;
  const userId = message.author.id;

  if (step === 'title') {
    await message.reply(
      '🎵 **Let\'s create a new song!**\n\n' +
      'What should the song be called?'
    );
  } else if (step === 'genre') {
    await message.reply(
      `Title: **"${data.title}"**\n\n` +
      'What genre?\n' +
      'Options: ' + GENRES.join(', ')
    );
  } else if (step === 'explicit') {
    await message.reply(
      `Genre: **${data.genre}**\n\n` +
      'Should this song be explicit? (yes/no)'
    );
  } else if (step === 'features') {
    await message.reply(
      `Explicit: **${data.explicit ? 'Yes' : 'No'}**\n\n` +
      'What features should the song have?\n' +
      'Options: ' + SONG_FEATURES.join(', ') + '\n' +
      '(You can list multiple, separated by commas)'
    );
  } else if (step === 'producer') {
    const producerList = PRODUCERS.map((p, i) => `${i}. ${p.name} (£${p.cost.toLocaleString()})`).join('\n');
    await message.reply(
      `Features: **${data.features.join(', ')}**\n\n` +
      'Choose a producer:\n' + producerList + '\n\n(Say the number or name)'
    );
  } else if (step === 'writer') {
    const writerList = WRITERS.map((w, i) => `${i}. ${w.name} (£${w.cost.toLocaleString()})`).join('\n');
    await message.reply(
      `Producer: **${PRODUCERS[data.producerIndex || 0].name}**\n\n` +
      'Choose a writer:\n' + writerList + '\n\n(Say the number or name)'
    );
  } else if (step === 'studio') {
    const studioList = STUDIOS.map((s, i) => `${i}. ${s.name} (£${s.cost.toLocaleString()})`).join('\n');
    await message.reply(
      `Writer: **${WRITERS[data.writerIndex || 0].name}**\n\n` +
      'Choose a studio:\n' + studioList + '\n\n(Say the number or name)'
    );
  } else if (step === 'album') {
    await message.reply(
      `Studio: **${STUDIOS[data.studioIndex || 0].name}**\n\n` +
      'Add to an album? (Enter album name or "no" for standalone single)'
    );
  } else if (step === 'confirm') {
    const featureCost = (data.features || []).reduce((sum, feature) => sum + (FEATURE_COSTS[feature] || 0), 0);
    const producer = PRODUCERS[data.producerIndex || 0];
    const writer = WRITERS[data.writerIndex || 0];
    const studio = STUDIOS[data.studioIndex || 0];
    const totalCost = producer.cost + writer.cost + studio.cost + featureCost;
    const summary = `
**🎵 Song Summary**
Title: "${data.title}"
Genre: ${data.genre}
Explicit: ${data.explicit ? 'Yes' : 'No'}
Features: ${data.features.join(', ')} (£${featureCost.toLocaleString()})
Producer: ${producer.name} (£${producer.cost.toLocaleString()})
Writer: ${writer.name} (£${writer.cost.toLocaleString()})
Studio: ${studio.name} (£${studio.cost.toLocaleString()})
Album: ${data.albumTitle || 'Standalone single'}

Total cost: £${totalCost.toLocaleString()}

Confirm? (yes/no)`;
    await message.reply(summary);
  }
}

// Execute song creation when confirmed
async function executeSongCreation(message, conversation) {
  const userId = message.author.id;
  conversations.delete(userId);
  await deleteConversationState(userId);
  const result = await callEdgeFunction('create_song', {
    userId: message.author.id,
    ...conversation.data
  });
  if (result.success) {
    await message.reply(`✅ **Song created!**\n\n${result.message}`);
  } else {
    await message.reply(`❌ **Error:** ${result.error}`);
  }
}

// Handle each step of album creation
async function handleAlbumStep(message, conversation) {
  const { step, data } = conversation;

  if (step === 'title') {
    await message.reply(
      '💿 **Let\'s create a new album!**\n\n' +
      'What should the album be called?'
    );
  } else if (step === 'confirm') {
    const summary = `
**💿 Album Summary**
Title: "${data.title}"

Confirm album creation? (yes/no)`;
    await message.reply(summary);
  }
}

// Execute album creation when confirmed
async function executeAlbumCreation(message, conversation) {
  const userId = message.author.id;
  conversations.delete(userId);
  await deleteConversationState(userId);
  const result = await callEdgeFunction('create_album', {
    userId: message.author.id,
    ...conversation.data
  });
  if (result.success) {
    await message.reply(`✅ **Album created!**\n\n${result.message}`);
  } else {
    await message.reply(`❌ **Error:** ${result.error}`);
  }
}

// Handle each step of merch creation
async function handleMerchStep(message, conversation) {
  const { step, data } = conversation;

  if (step === 'type') {
    await message.reply(
      '👕 **Let\'s create new merch!**\n\n' +
      'What type of merch?\n' +
      'Options: ' + MERCH_TYPES.join(', ')
    );
  } else if (step === 'quantity') {
    await message.reply(
      `Type: **${data.type}**\n\n` +
      'How many units to produce?'
    );
  } else if (step === 'price') {
    await message.reply(
      `Quantity: **${data.quantity}**\n\n` +
      'Set price per unit? (Amount in £, or "default" for auto-pricing)'
    );
  } else if (step === 'confirm') {
    const summary = `
**👕 Merch Summary**
Type: ${data.type}
Quantity: ${data.quantity}
Price: ${data.price ? '£' + data.price.toLocaleString() : 'Auto'}

Confirm? (yes/no)`;
    await message.reply(summary);
  }
}

// Execute merch creation when confirmed
async function executeMerchCreation(message, conversation) {
  const userId = message.author.id;
  conversations.delete(userId);
  await deleteConversationState(userId);
  const result = await callEdgeFunction('create_merch', {
    userId: message.author.id,
    ...conversation.data
  });
  if (result.success) {
    await message.reply(`✅ **Merch created!**\n\n${result.message}`);
  } else {
    await message.reply(`❌ **Error:** ${result.error}`);
  }
}

// Handle each step of tour booking
async function handleTourStep(message, conversation) {
  const { step, data } = conversation;

  if (step === 'venue') {
    await message.reply(
      '🎤 **Let\'s book a tour!**\n\n' +
      'What venue type?\n' +
      'Options: ' + TOUR_VENUES.join(', ')
    );
  } else if (step === 'confirm') {
    await message.reply(
      `Venue: **${data.venue}**\n\n` +
      'Confirm tour booking? (yes/no)'
    );
  }
}

// Execute tour booking when confirmed
async function executeTourBooking(message, conversation) {
  const userId = message.author.id;
  conversations.delete(userId);
  await deleteConversationState(userId);
  const result = await callEdgeFunction('book_tour', {
    userId: message.author.id,
    ...conversation.data
  });
  if (result.success) {
    await message.reply(`✅ **Tour booked!**\n\n${result.message}`);
  } else {
    await message.reply(`❌ **Error:** ${result.error}`);
  }
}

// Handle each step of studio upgrade
async function handleStudioStep(message, conversation) {
  const { step, data } = conversation;

  if (step === 'component') {
    await message.reply(
      '🎚️ **Let\'s upgrade your studio!**\n\n' +
      'Which component?\n' +
      'Options: ' + STUDIO_COMPONENTS.join(', ')
    );
  } else if (step === 'confirm') {
    await message.reply(
      `Component: **${data.component}**\n\n` +
      'Confirm studio upgrade? (yes/no)'
    );
  }
}

// Execute studio upgrade when confirmed
async function executeStudioUpgrade(message, conversation) {
  const userId = message.author.id;
  conversations.delete(userId);
  await deleteConversationState(userId);
  const result = await callEdgeFunction('upgrade_studio', {
    userId: message.author.id,
    ...conversation.data
  });
  if (result.success) {
    await message.reply(`✅ **Studio upgraded!**\n\n${result.message}`);
  } else {
    await message.reply(`❌ **Error:** ${result.error}`);
  }
}

// Conversation flow handlers
async function handleConversation(message, userMessage) {
  const userId = message.author.id;
  let conversation = conversations.get(userId);

  // Try to load from database if not in memory
  if (!conversation) {
    conversation = await loadConversationState(userId);
    if (conversation) {
      conversations.set(userId, conversation);
      console.log('Loaded conversation from database:', conversation);
    }
  }

  // Always strip bot mention from user message
  console.log('Before strip:', userMessage);
  const cleanMessage = userMessage.replace(BOT_MENTION_REGEX, '').trim();
  console.log('After strip:', cleanMessage);

  if (!conversation) {
    // Start new conversation based on intent
    const intent = detectIntent(cleanMessage);
    if (intent === 'create_song') {
      // Parse the message for existing information
      const parsedData = parseSongCreation(cleanMessage);
      conversations.set(userId, {
        step: determineMissingStep('create_song', parsedData),
        data: parsedData,
        command: 'create_song'
      });
      const conversation = conversations.get(userId);
      await saveConversationState(userId, conversation);
      await handleSongStep(message, conversation);
      return;
    } else if (intent === 'create_album') {
      const parsedData = parseAlbumCreation(cleanMessage);
      conversations.set(userId, {
        step: determineMissingStep('create_album', parsedData),
        data: parsedData,
        command: 'create_album'
      });
      const conversation = conversations.get(userId);
      await saveConversationState(userId, conversation);
      await handleAlbumStep(message, conversation);
      return;
    } else if (intent === 'create_merch') {
      const parsedData = parseMerchCreation(cleanMessage);
      conversations.set(userId, {
        step: determineMissingStep('create_merch', parsedData),
        data: parsedData,
        command: 'create_merch'
      });
      const conversation = conversations.get(userId);
      await saveConversationState(userId, conversation);
      await handleMerchStep(message, conversation);
      return;
    } else if (intent === 'book_tour') {
      const parsedData = parseTourBooking(cleanMessage);
      conversations.set(userId, {
        step: determineMissingStep('book_tour', parsedData),
        data: parsedData,
        command: 'book_tour'
      });
      const conversation = conversations.get(userId);
      await saveConversationState(userId, conversation);
      await handleTourStep(message, conversation);
      return;
    } else if (intent === 'upgrade_studio') {
      const parsedData = parseStudioUpgrade(cleanMessage);
      conversations.set(userId, {
        step: determineMissingStep('upgrade_studio', parsedData),
        data: parsedData,
        command: 'upgrade_studio'
      });
      const conversation = conversations.get(userId);
      await saveConversationState(userId, conversation);
      await handleStudioStep(message, conversation);
      return;
    } else if (intent === 'view_stats') {
      return handleGameCommand(message, 'view_stats');
    } else if (intent === 'advance_week') {
      return handleGameCommand(message, 'advance_week');
    } else if (intent === 'release_song') {
      conversations.set(userId, {
        step: 'song_select',
        data: {},
        command: 'release_song'
      });
      const conversation = conversations.get(userId);
      await saveConversationState(userId, conversation);
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
      const conversation = conversations.get(userId);
      await saveConversationState(userId, conversation);
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
      const conversation = conversations.get(userId);
      await saveConversationState(userId, conversation);
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
      const conversation = conversations.get(userId);
      await saveConversationState(userId, conversation);
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
      const conversation = conversations.get(userId);
      await saveConversationState(userId, conversation);
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
  console.log('Continue - Before strip:', userMessage);
  const cleanMessage = userMessage.replace(BOT_MENTION_REGEX, '').trim();
  console.log('Continue - After strip:', cleanMessage);
  console.log('Continue - Conversation:', JSON.stringify(conversation));
  const lower = cleanMessage.toLowerCase().trim();

  // Check for cancel or help FIRST
  if (lower === 'cancel' || lower === 'stop' || lower === 'nevermind') {
    conversations.delete(userId);
    await deleteConversationState(userId);
    await message.reply('❌ Conversation cancelled.');
    return;
  }

  if (lower === 'help') {
    await message.reply(getHelpMessage());
    return;
  }

  // If already at confirm step and user says yes/no, handle it
  if (conversation.step === 'confirm') {
    if (lower === 'yes' || lower === 'y') {
      if (conversation.command === 'create_song') {
        await executeSongCreation(message, conversation);
      } else if (conversation.command === 'create_merch') {
        await executeMerchCreation(message, conversation);
      } else if (conversation.command === 'book_tour') {
        await executeTourBooking(message, conversation);
      } else if (conversation.command === 'upgrade_studio') {
        await executeStudioUpgrade(message, conversation);
      } else if (conversation.command === 'create_album') {
        await executeAlbumCreation(message, conversation);
      }
      return;
    } else if (lower === 'no' || lower === 'n') {
      conversations.delete(userId);
      await deleteConversationState(userId);
      await message.reply('❌ Cancelled.');
      return;
    }
  }

  // Handle the current step directly without re-parsing
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
      await deleteConversationState(userId);
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
      await saveConversationState(userId, conversation);
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
      await saveConversationState(userId, conversation);
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
      await saveConversationState(userId, conversation);
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
      await saveConversationState(userId, conversation);
      const producerList = PRODUCERS.map((p, i) => `${i}. ${p.name} (£${p.cost.toLocaleString()})`).join('\n');
      await message.reply(
        `Features: **${selectedFeatures.join(', ')}**\n\n` +
        'Choose a producer:\n' + producerList + '\n\n(Say the number or name)'
      );
      return;

    case 'producer':
      const producerIndex = parseInt(input);
      const producerMatch = PRODUCERS.find((p, i) => i === producerIndex || p.name.toLowerCase() === input.toLowerCase());
      if (!producerMatch) {
        await message.reply('Please choose a valid producer (number or name).');
        return;
      }
      conversation.data.producerIndex = PRODUCERS.indexOf(producerMatch);
      conversation.step = 'writer';
      conversations.set(userId, conversation);
      await saveConversationState(userId, conversation);
      const writerList = WRITERS.map((w, i) => `${i}. ${w.name} (£${w.cost.toLocaleString()})`).join('\n');
      await message.reply(
        `Producer: **${producerMatch.name}**\n\n` +
        'Choose a writer:\n' + writerList + '\n\n(Say the number or name)'
      );
      return;

    case 'writer':
      const writerIndex = parseInt(input);
      const writerMatch = WRITERS.find((w, i) => i === writerIndex || w.name.toLowerCase() === input.toLowerCase());
      if (!writerMatch) {
        await message.reply('Please choose a valid writer (number or name).');
        return;
      }
      conversation.data.writerIndex = WRITERS.indexOf(writerMatch);
      conversation.step = 'studio';
      conversations.set(userId, conversation);
      await saveConversationState(userId, conversation);
      const studioList = STUDIOS.map((s, i) => `${i}. ${s.name} (£${s.cost.toLocaleString()})`).join('\n');
      await message.reply(
        `Writer: **${writerMatch.name}**\n\n` +
        'Choose a studio:\n' + studioList + '\n\n(Say the number or name)'
      );
      return;

    case 'studio':
      const studioIndex = parseInt(input);
      const studioMatch = STUDIOS.find((s, i) => i === studioIndex || s.name.toLowerCase() === input.toLowerCase());
      if (!studioMatch) {
        await message.reply('Please choose a valid studio (number or name).');
        return;
      }
      conversation.data.studioIndex = STUDIOS.indexOf(studioMatch);
      conversation.step = 'album';
      conversations.set(userId, conversation);
      await saveConversationState(userId, conversation);
      await message.reply(
        `Studio: **${studioMatch.name}**\n\n` +
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
      await saveConversationState(userId, conversation);
      const featureCost = (conversation.data.features || []).reduce((sum, feature) => sum + (FEATURE_COSTS[feature] || 0), 0);
      const producer = PRODUCERS[conversation.data.producerIndex || 0];
      const writer = WRITERS[conversation.data.writerIndex || 0];
      const studio = STUDIOS[conversation.data.studioIndex || 0];
      const totalCost = producer.cost + writer.cost + studio.cost + featureCost;
      const summary = `
**🎵 Song Summary**
Title: "${conversation.data.title}"
Genre: ${conversation.data.genre}
Explicit: ${conversation.data.explicit ? 'Yes' : 'No'}
Features: ${conversation.data.features.join(', ')} (£${featureCost.toLocaleString()})
Producer: ${producer.name} (£${producer.cost.toLocaleString()})
Writer: ${writer.name} (£${writer.cost.toLocaleString()})
Studio: ${studio.name} (£${studio.cost.toLocaleString()})
Album: ${conversation.data.albumTitle || 'Standalone single'}

Total cost: £${totalCost.toLocaleString()}

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
    case 'title':
      if (!input || input.length < 2) {
        await message.reply('Please enter a valid album name (at least 2 characters).');
        return;
      }
      conversation.data.title = input;
      conversation.step = 'confirm';
      conversations.set(userId, conversation);
      await saveConversationState(userId, conversation);
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
      await saveConversationState(userId, conversation);
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
      await saveConversationState(userId, conversation);
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
      await saveConversationState(userId, conversation);
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
      await saveConversationState(userId, conversation);
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
      await saveConversationState(userId, conversation);
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
      await saveConversationState(userId, conversation);
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
      conversation.step = 'confirm';
      conversations.set(userId, conversation);
      await saveConversationState(userId, conversation);
      await message.reply(
        `Song: **"${input}"**\n\n` +
        'Marketing cost will be auto-calculated based on your fame.\n\nConfirm marketing campaign? (yes/no)'
      );
      return;

    case 'confirm':
      if (input === 'yes' || input === 'y') {
        conversations.delete(userId);
        const result = await callEdgeFunction('market_song', {
          userId: message.author.id,
          songTitle: conversation.data.songTitle
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
      conversation.data.choiceIndex = 0;
      conversation.step = 'choices';
      conversations.set(userId, conversation);
      await saveConversationState(userId, conversation);
      const choiceSet = VIDEO_CHOICES[0];
      const options = choiceSet.options.map((o, i) => `${i + 1}. ${o.label} (bonus: +${o.bonus}, risk: ${o.risk})`).join('\n');
      await message.reply(
        `Song: **"${input}"**\n\n` +
        choiceSet.prompt + '\n' + options + '\n\n(Say the number)'
      );
      return;

    case 'choices':
      const choiceIndex = conversation.data.choiceIndex || 0;
      const currentChoiceSet = VIDEO_CHOICES[choiceIndex];
      const selectedOption = parseInt(input) - 1;
      
      if (isNaN(selectedOption) || selectedOption < 0 || selectedOption >= currentChoiceSet.options.length) {
        await message.reply('Please choose a valid option number.');
        return;
      }
      
      if (!conversation.data.choices) {
        conversation.data.choices = [];
      }
      conversation.data.choices.push(currentChoiceSet.options[selectedOption]);
      
      if (choiceIndex < VIDEO_CHOICES.length - 1) {
        conversation.data.choiceIndex = choiceIndex + 1;
        conversations.set(userId, conversation);
        await saveConversationState(userId, conversation);
        const nextChoiceSet = VIDEO_CHOICES[choiceIndex + 1];
        const options = nextChoiceSet.options.map((o, i) => `${i + 1}. ${o.label} (bonus: +${o.bonus}, risk: ${o.risk})`).join('\n');
        await message.reply(
          nextChoiceSet.prompt + '\n' + options + '\n\n(Say the number)'
        );
      } else {
        conversation.step = 'confirm';
        conversations.set(userId, conversation);
        await saveConversationState(userId, conversation);
        const summary = conversation.data.choices.map(c => `• ${c.label} (bonus: +${c.bonus}, risk: ${c.risk})`).join('\n');
        await message.reply(
          `**🎬 Video Summary**\nSong: "${conversation.data.songTitle}"\n\nChoices:\n${summary}\n\nConfirm video creation? (yes/no)`
        );
      }
      return;

    case 'confirm':
      if (input === 'yes' || input === 'y') {
        conversations.delete(userId);
        const result = await callEdgeFunction('create_video', {
          userId: message.author.id,
          songTitle: conversation.data.songTitle,
          choices: conversation.data.choices
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
      await saveConversationState(userId, conversation);
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
      await saveConversationState(userId, conversation);
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

// Regex to match bot mentions (both user and role mentions)
const BOT_MENTION_REGEX = /<@!?&?(\d+)>|@tony/gi;

// Handle link command in DM
async function handleLinkCommand(message, args) {
  const parts = args.trim().split(/\s+/);
  const careerId = parts[0];
  const authCode = parts[1];

  if (!careerId || !authCode) {
    return await message.reply(
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
    return await message.reply('✅ **Account linked successfully!** You can now use Tony to control your game.');
  } else {
    return await message.reply(`❌ **Link failed:** ${result.error}`);
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
    return await message.reply(result.message);
  } else {
    return await message.reply(`❌ **Error:** ${result.error}`);
  }
}

// Handle AI chat
async function handleChat(message, userMessage) {
  const result = await callEdgeFunction('chat', {
    userId: message.author.id,
    message: userMessage,
  });

  if (result.success) {
    return await message.reply(result.response);
  } else {
    return await message.reply(`❌ **Error:** ${result.error}`);
  }
}

// Process incoming messages
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Per-user lock to prevent concurrent processing (check FIRST)
  const userId = message.author.id;
  if (processingLocks.has(userId)) {
    console.log('User already being processed, skipping:', userId);
    return;
  }
  processingLocks.set(userId, true);

  // Check if message is already being processed (in-flight)
  if (inFlightMessages.has(message.id)) {
    console.log('Message already in-flight, skipping:', message.id);
    processingLocks.delete(userId);
    return;
  }
  inFlightMessages.add(message.id);

  // Prevent duplicate processing using message ID only
  console.log('Processing message:', message.id, 'Content:', message.content);
  if (processedMessages.has(message.id)) {
    console.log('Duplicate message detected, skipping:', message.id);
    inFlightMessages.delete(message.id);
    processingLocks.delete(userId);
    return;
  }
  processedMessages.add(message.id);
  console.log('Added to processedMessages, total:', processedMessages.size);

  // Clean up old message keys (keep last 1000)
  if (processedMessages.size > 1000) {
    const first = processedMessages.values().next().value;
    processedMessages.delete(first);
  }

  // Clean up old in-flight messages (keep last 100)
  if (inFlightMessages.size > 100) {
    const first = inFlightMessages.values().next().value;
    inFlightMessages.delete(first);
  }

  try {

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
      return await message.reply(getHelpMessage());
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
        return await message.reply('✅ I\'ve sent you a DM with instructions!');
      } catch (error) {
        return await message.reply('❌ I couldn\'t send you a DM. Please enable DMs in your privacy settings.');
      }
    }

    // Help command
    if (cleanMessage.toLowerCase() === 'help') {
      return await message.reply(getHelpMessage());
    }

    if (!cleanMessage) {
      return await message.reply('Hi! I\'m Tony. Mention me with a command like: `@tony create a song` or say `@tony link my account` to connect your game.');
    }

    // Use conversation handler for everything else
    await handleConversation(message, cleanMessage);
    return;
  }
  } finally {
    // Release the lock
    processingLocks.delete(userId);
    // Remove from in-flight
    inFlightMessages.delete(message.id);
    // Update cooldown
    replyCooldowns.set(userId, Date.now());
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
