require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes,
  ActivityType
} = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} = require('@discordjs/voice');
const play = require('play-dl');

const workerTokens = [
  process.env.MUSIC_NODE_1,
  process.env.MUSIC_NODE_2,
  process.env.MUSIC_NODE_3,
  process.env.MUSIC_NODE_4
].filter(Boolean);

if (workerTokens.length === 0) {
  console.error('❌ No MUSIC_NODE tokens found in .env!');
  process.exit(1);
}

const bots = [];
const botSessions = new Map();

class GuildMusicSession {
  constructor(botClient, guildId, voiceChannelId, textChannelId) {
    this.botClient = botClient;
    this.guildId = guildId;
    this.voiceChannelId = voiceChannelId;
    this.textChannelId = textChannelId;
    this.queue = [];
    this.current = null;
    this.connection = null;
    this.player = createAudioPlayer();
    this.idleTimer = null;

    this.setupPlayerListeners();
  }

  setupPlayerListeners() {
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.playNext();
    });

    this.player.on('error', (error) => {
      console.error(`[${this.botClient.user?.tag || 'Bot'}] Player Error:`, error.message);
      this.sendChannelMessage(`⚠️ **Playback error:** ${error.message || 'Stream interrupted'}`);
      this.playNext();
    });
  }

  async sendChannelMessage(payload) {
    try {
      const channel = this.botClient.channels.cache.get(this.textChannelId);
      if (channel) return await channel.send(payload);
    } catch (e) {
      console.warn('Could not send channel message:', e.message);
    }
    return null;
  }

  connectVoice(channel) {
    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      return this.connection;
    }

    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false
    });

    this.connection.subscribe(this.player);

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch (e) {
        this.destroy();
      }
    });

    return this.connection;
  }

  async playNext() {
    if (this.queue.length === 0) {
      this.current = null;
      this.sendChannelMessage({
        embeds: [
          new EmbedBuilder()
            .setColor(0x8B5CF6)
            .setTitle('🎶 MUSIC QUEUE FINISHED')
            .setDescription(`Finished all songs in <#${this.voiceChannelId}>.\nLeaving in **60 seconds** if idle...`)
            .setFooter({ text: 'NISHU MUSIC • Multi-Bot Engine' })
        ]
      });

      if (this.idleTimer) clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        if (!this.current && this.queue.length === 0) {
          this.destroy();
        }
      }, 60000);
      return;
    }

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.current = this.queue.shift();

    try {
      let stream = null;
      let streamType = null;

      if (this.current.source === 'youtube' || this.current.url.includes('youtube.com') || this.current.url.includes('youtu.be')) {
        const pStream = await play.stream(this.current.url);
        stream = pStream.stream;
        streamType = pStream.type;
      } else if (this.current.source === 'soundcloud' || this.current.url.includes('soundcloud.com')) {
        const pStream = await play.stream(this.current.url);
        stream = pStream.stream;
        streamType = pStream.type;
      } else {
        const searchResults = await play.search(this.current.title + ' ' + (this.current.artist || ''), { limit: 1 });
        if (searchResults && searchResults.length > 0) {
          const pStream = await play.stream(searchResults[0].url);
          stream = pStream.stream;
          streamType = pStream.type;
        } else {
          throw new Error('Track stream unavailable');
        }
      }

      const resource = createAudioResource(stream, { inputType: streamType, inlineVolume: true });
      if (resource.volume) resource.volume.setVolume(1.0);

      this.player.play(resource);

      const embed = new EmbedBuilder()
        .setColor(0x8B5CF6)
        .setTitle('🎶 NOW PLAYING // NISHU MUSIC')
        .setDescription(`🎵 **[${this.current.title}](${this.current.url})**\n\n` +
          `⏱️ **Duration:** \`${this.current.duration}\`\n` +
          `👤 **Artist:** \`${this.current.artist || 'Unknown'}\`\n` +
          `🎧 **Requested By:** <@${this.current.requesterId}>\n` +
          `🔊 **Voice Channel:** <#${this.voiceChannelId}>\n` +
          `🤖 **Music Node:** \`${this.botClient.user.username}\``)
        .setThumbnail(this.current.thumbnail || 'https://i.imgur.com/8Qp49Xn.png')
        .setFooter({ text: 'NISHU MULTI-BOT MUSIC • 100% Native High Performance' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('music_btn_pause_resume')
          .setLabel('Pause / Resume')
          .setEmoji('⏯️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('music_btn_skip')
          .setLabel('Skip Track')
          .setEmoji('⏭️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('music_btn_stop')
          .setLabel('Stop & Leave')
          .setEmoji('⏹️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('music_btn_queue')
          .setLabel('Queue')
          .setEmoji('📜')
          .setStyle(ButtonStyle.Secondary)
      );

      this.sendChannelMessage({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error(`[${this.botClient.user.tag}] Stream play error:`, err);
      this.sendChannelMessage(`⚠️ Failed to stream **${this.current.title}**: ${err.message}`);
      this.playNext();
    }
  }

  destroy() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.queue = [];
    this.current = null;
    try {
      this.player.stop();
      if (this.connection) {
        this.connection.destroy();
      }
    } catch (e) {}

    const guildMap = botSessions.get(this.botClient.user.id);
    if (guildMap) {
      guildMap.delete(this.guildId);
    }
  }
}

function getSessionForChannel(voiceChannelId) {
  for (const [botId, guildMap] of botSessions.entries()) {
    for (const [guildId, session] of guildMap.entries()) {
      if (session.voiceChannelId === voiceChannelId) {
        return session;
      }
    }
  }
  return null;
}

function getAvailableWorker(guild, voiceChannelId) {
  const existing = getSessionForChannel(voiceChannelId);
  if (existing) return existing.botClient;

  for (const bot of bots) {
    if (!bot.user || !bot.guilds.cache.has(guild.id)) continue;
    const guildMap = botSessions.get(bot.user.id);
    if (!guildMap || guildMap.size === 0) {
      return bot;
    }
  }
  return null;
}

const musicCommands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('🎵 Play any song by title search or YouTube/Spotify/SoundCloud link')
    .addStringOption(opt =>
      opt
        .setName('query')
        .setDescription('Song title, artist, or music URL')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('⏭️ Skip the currently playing track'),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('⏹️ Stop music, clear queue, and leave voice channel'),
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('📜 View upcoming songs in the queue'),
  new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('🎶 View currently playing track with interactive controls')
];

for (let i = 0; i < workerTokens.length; i++) {
  const token = workerTokens[i];
  const botClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages
    ]
  });

  botSessions.set(token, new Map());

  botClient.once('ready', async () => {
    botSessions.set(botClient.user.id, new Map());
    console.log(`🎶 [Music Bot #${i + 1}] Online as ${botClient.user.tag}`);
    botClient.user.setActivity('NISHU MUSIC 🎧', { type: ActivityType.Listening });

    if (i === 0) {
      try {
        const rest = new REST({ version: '10' }).setToken(token);
        const guild = botClient.guilds.cache.first();
        if (guild) {
          await rest.put(
            Routes.applicationGuildCommands(botClient.user.id, guild.id),
            { body: musicCommands }
          );
          console.log(`⚡ Instant Guild Slash Commands registered for ${guild.name}!`);
        }
        await rest.put(
          Routes.applicationCommands(botClient.user.id),
          { body: musicCommands }
        );
        console.log('✅ Global music slash commands registered!');
      } catch (regErr) {
        console.error('Failed to register slash commands:', regErr.message);
      }
    }
  });

  botClient.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const voiceChannel = interaction.member?.voice?.channel;

        if (['play', 'skip', 'stop', 'queue', 'nowplaying'].includes(commandName)) {
          if (!voiceChannel) {
            return interaction.reply({
              content: '❌ **You must be in a Voice Channel** to use music commands!',
              ephemeral: true
            });
          }
        }

        if (commandName === 'play') {
          await interaction.deferReply();
          const query = interaction.options.getString('query');

          let selectedBot = getAvailableWorker(interaction.guild, voiceChannel.id);
          if (!selectedBot) {
            return interaction.editReply({
              content: '⚠️ **All Music Bots are currently occupied** in other Voice Channels! Please join an active channel or wait.'
            });
          }

          let guildMap = botSessions.get(selectedBot.user.id);
          if (!guildMap) {
            guildMap = new Map();
            botSessions.set(selectedBot.user.id, guildMap);
          }

          let session = guildMap.get(interaction.guild.id);
          if (!session) {
            session = new GuildMusicSession(
              selectedBot,
              interaction.guild.id,
              voiceChannel.id,
              interaction.channel.id
            );
            guildMap.set(interaction.guild.id, session);
          }

          session.connectVoice(voiceChannel);

          let searchResult = null;
          const isUrl = /^https?:\/\//i.test(query);

          if (isUrl) {
            const val = await play.validate(query);
            if (val === 'yt_video') {
              const info = await play.video_info(query);
              searchResult = [{
                title: info.video_details.title,
                url: info.video_details.url,
                duration: info.video_details.durationRaw || 'Unknown',
                artist: info.video_details.channel?.name || 'YouTube',
                thumbnail: info.video_details.thumbnails?.[0]?.url,
                source: 'youtube',
                requesterId: interaction.user.id
              }];
            } else if (val === 'so_track') {
              const info = await play.soundcloud(query);
              searchResult = [{
                title: info.name,
                url: info.url,
                duration: 'Track',
                artist: info.user?.name || 'SoundCloud',
                thumbnail: info.thumbnail,
                source: 'soundcloud',
                requesterId: interaction.user.id
              }];
            }
          }

          if (!searchResult || searchResult.length === 0) {
            const res = await play.search(query, { limit: 1 });
            if (res && res.length > 0) {
              const video = res[0];
              searchResult = [{
                title: video.title,
                url: video.url,
                duration: video.durationRaw || 'Unknown',
                artist: video.channel?.name || 'YouTube',
                thumbnail: video.thumbnails?.[0]?.url,
                source: 'youtube',
                requesterId: interaction.user.id
              }];
            }
          }

          if (!searchResult || searchResult.length === 0) {
            return interaction.editReply({
              content: `❌ No results found matching **"${query}"**!`
            });
          }

          const track = searchResult[0];
          session.queue.push(track);

          if (!session.current) {
            await interaction.editReply({
              content: `🎶 Loading **${track.title}** into ${voiceChannel} via **${selectedBot.user.username}**...`
            });
            await session.playNext();
          } else {
            const addedEmbed = new EmbedBuilder()
              .setColor(0x10B981)
              .setTitle('➕ ADDED TO QUEUE // NISHU MUSIC')
              .setDescription(`🎵 **[${track.title}](${track.url})**\n\n` +
                `⏱️ **Duration:** \`${track.duration}\`\n` +
                `👤 **Artist:** \`${track.artist}\`\n` +
                `📍 **Queue Position:** \`#${session.queue.length}\`\n` +
                `🤖 **Node:** \`${selectedBot.user.username}\`\n` +
                `👤 **Requested By:** ${interaction.user}`)
              .setThumbnail(track.thumbnail)
              .setFooter({ text: 'NISHU MUSIC • Song Queued' });

            return interaction.editReply({ embeds: [addedEmbed] });
          }
        }

        if (commandName === 'skip') {
          const session = getSessionForChannel(voiceChannel.id);
          if (!session || !session.current) {
            return interaction.reply({ content: '❌ There is no music playing in your channel right now!', ephemeral: true });
          }
          const skipped = session.current;
          session.player.stop();
          return interaction.reply({ content: `⏭️ **Skipped:** \`${skipped.title}\`!` });
        }

        if (commandName === 'stop') {
          const session = getSessionForChannel(voiceChannel.id);
          if (!session) {
            return interaction.reply({ content: '❌ No music bot is active in your voice channel!', ephemeral: true });
          }
          session.destroy();
          return interaction.reply({ content: '⏹️ **Stopped playback, cleared the queue, and disconnected from Voice!**' });
        }

        if (commandName === 'queue') {
          const session = getSessionForChannel(voiceChannel.id);
          if (!session || (!session.current && session.queue.length === 0)) {
            return interaction.reply({ content: '📜 The music queue for your channel is currently empty!', ephemeral: true });
          }

          let desc = `🤖 **Serving Node:** \`${session.botClient.user.username}\`\n\n`;
          if (session.current) {
            desc += `🎶 **Currently Playing:**\n**[${session.current.title}](${session.current.url})** (\`${session.current.duration}\`) • <@${session.current.requesterId}>\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
          }

          desc += `📜 **Upcoming Tracks (${session.queue.length} in queue):**\n`;
          if (session.queue.length === 0) {
            desc += '*No more songs in queue. Add more using `/play`!*\n';
          } else {
            session.queue.slice(0, 10).forEach((t, idx) => {
              desc += `**${idx + 1}.** ${t.title} (\`${t.duration}\`)\n`;
            });
          }

          const qEmbed = new EmbedBuilder()
            .setColor(0x8B5CF6)
            .setTitle('📜 NISHU MUSIC // QUEUE LIST')
            .setDescription(desc)
            .setFooter({ text: 'NISHU MULTI-BOT MUSIC' })
            .setTimestamp();

          return interaction.reply({ embeds: [qEmbed] });
        }

        if (commandName === 'nowplaying') {
          const session = getSessionForChannel(voiceChannel.id);
          if (!session || !session.current) {
            return interaction.reply({ content: '❌ There is no song currently playing in your channel!', ephemeral: true });
          }
          const current = session.current;
          const npEmbed = new EmbedBuilder()
            .setColor(0x8B5CF6)
            .setTitle('🎶 CURRENTLY PLAYING')
            .setDescription(`🎵 **[${current.title}](${current.url})**\n\n` +
              `⏱️ **Duration:** \`${current.duration}\`\n` +
              `👤 **Artist:** \`${current.artist || 'Unknown'}\`\n` +
              `👤 **Requested By:** <@${current.requesterId}>\n` +
              `🤖 **Music Node:** \`${session.botClient.user.username}\``)
            .setThumbnail(current.thumbnail)
            .setFooter({ text: 'NISHU MUSIC' });

          return interaction.reply({ embeds: [npEmbed] });
        }
      }

      if (interaction.isButton() && interaction.customId.startsWith('music_btn_')) {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({ content: '❌ You must be in the voice channel to use controller buttons!', ephemeral: true });
        }

        const session = getSessionForChannel(voiceChannel.id);
        if (!session) {
          return interaction.reply({ content: '❌ No active music session in your channel!', ephemeral: true });
        }

        if (interaction.customId === 'music_btn_pause_resume') {
          if (session.player.state.status === AudioPlayerStatus.Paused) {
            session.player.unpause();
            return interaction.reply({ content: '▶️ Resumed playback!', ephemeral: true });
          } else {
            session.player.pause();
            return interaction.reply({ content: '⏸️ Paused playback!', ephemeral: true });
          }
        }

        if (interaction.customId === 'music_btn_skip') {
          session.player.stop();
          return interaction.reply({ content: '⏭️ Skipped track!', ephemeral: true });
        }

        if (interaction.customId === 'music_btn_stop') {
          session.destroy();
          return interaction.reply({ content: '⏹️ Stopped music and disconnected!', ephemeral: true });
        }

        if (interaction.customId === 'music_btn_queue') {
          let desc = `🤖 **Serving Node:** \`${session.botClient.user.username}\`\n\n`;
          if (session.current) {
            desc += `🎶 **Currently Playing:**\n**${session.current.title}** (\`${session.current.duration}\`) • <@${session.current.requesterId}>\n\n`;
          }
          desc += `📜 **Upcoming Tracks (${session.queue.length}):**\n`;
          session.queue.slice(0, 5).forEach((t, idx) => {
            desc += `**${idx + 1}.** ${t.title}\n`;
          });
          const embed = new EmbedBuilder().setColor(0x8B5CF6).setDescription(desc);
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
      }
    } catch (cmdErr) {
      console.error('Error handling music interaction:', cmdErr);
      if (!interaction.replied && !interaction.deferred) {
        interaction.reply({ content: `❌ Error: ${cmdErr.message}`, ephemeral: true }).catch(() => {});
      }
    }
  });

  botClient.login(token).catch(err => {
    console.warn(`⚠️ Failed to login Music Worker Bot #${i + 1}: ${err.message}`);
  });

  bots.push(botClient);
}
