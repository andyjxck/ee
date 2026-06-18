const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');

// Configuration from environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SUPABASE_EDGE_FUNCTION_URL = process.env.SUPABASE_EDGE_FUNCTION_URL;

// Debug: Log environment variables (without exposing the full token)
console.log('Environment check:');
console.log('DISCORD_TOKEN exists:', !!DISCORD_TOKEN);
console.log('DISCORD_TOKEN length:', DISCORD_TOKEN ? DISCORD_TOKEN.length : 0);
console.log('SUPABASE_EDGE_FUNCTION_URL exists:', !!SUPABASE_EDGE_FUNCTION_URL);

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
    const response = await axios.post(SUPABASE_EDGE_FUNCTION_URL, {
      type,
      data,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Edge Function error:', error.response?.data || error.message);
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
    const content = message.content.trim().toLowerCase();
    
    // Link command
    if (content.startsWith('/link ')) {
      const args = message.content.slice(6).trim();
      return handleLinkCommand(message, args);
    }
    
    // Help command
    if (content === '/link' || content === 'help') {
      return message.reply(
        '**Tony Bot Commands**\n\n' +
        '`/link <career_id> <auth_code>` - Link your Discord account to your game\n' +
        'Get your Career ID from Settings.\n' +
        'Get your Auth Code from Settings (changes every 30 seconds).\n\n' +
        'After linking, mention me in any server with @tony <command>'
      );
    }
    
    // Default: treat as chat
    return handleChat(message, message.content);
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
          'Reply with: `/link <career_id> <auth_code>`\n' +
          'Example: `/link 251 123456`'
        );
        return message.reply('✅ I\'ve sent you a DM with instructions!');
      } catch (error) {
        return message.reply('❌ I couldn\'t send you a DM. Please enable DMs in your privacy settings.');
      }
    }
    
    if (!cleanMessage) {
      return message.reply('Hi! I\'m Tony. Mention me with a command like: `@tony create a song` or say `@tony link my account` to connect your game.');
    }
    
    return handleGameCommand(message, cleanMessage);
  }
});

// Check if message mentions the bot
function isBotMention(message) {
  return message.mentions.has(client.user);
}

// Bot ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log('Tony is ready to help!');
});

// Login
client.login(DISCORD_TOKEN);
