
require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActivityType, 
  AttachmentBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const express = require('express');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');
const fs = require('fs');
const https = require('https');

// --- 0. REGISTER MODERN SLEEK TYPOGRAPHY ---
const winFonts = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
try {
  if (fs.existsSync(path.join(winFonts, 'bahnschrift.ttf'))) {
    GlobalFonts.registerFromPath(path.join(winFonts, 'bahnschrift.ttf'), 'Bahnschrift');
  }
  if (fs.existsSync(path.join(winFonts, 'segoeuib.ttf'))) {
    GlobalFonts.registerFromPath(path.join(winFonts, 'segoeuib.ttf'), 'SegoeUIBold');
  }
} catch (fontErr) {
  console.warn('⚠️ Font notice: fallback to sans-serif.');
}

// --- 1. HEALTH CHECK WEB SERVER (For 24/7 Hosting) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send({ status: 'online', bot: 'Nishu Store Bot is active!' });
});

app.listen(PORT, () => {
  console.log(`🌐 Web server listening on port ${PORT} (Keep-alive ready)`);
});

// Helper: Strip emojis / crowns from server name
function getCleanServerName(name) {
  return name.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}👑]/gu, '').trim() || name;
}

// --- PRELOAD GALAXY BACKGROUND FRAMES ---
const BG_FRAMES_DIR = path.join(__dirname, 'bg_frames');
let preloadedBgImages = [];

async function loadBackgroundFrames() {
  if (fs.existsSync(BG_FRAMES_DIR)) {
    const files = fs.readdirSync(BG_FRAMES_DIR)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
      .sort();
    
    preloadedBgImages = await Promise.all(
      files.map(f => loadImage(path.join(BG_FRAMES_DIR, f)))
    );
    console.log('✨ All Galaxy video background frames loaded ready!');
  }
}
loadBackgroundFrames();

// --- 2. GENERATE ANIMATED WELCOME POSTER ---
async function generateAnimatedWelcomeCard(user, guild) {
  const width = 750;
  const height = 340;
  const totalFrames = preloadedBgImages.length > 0 ? preloadedBgImages.length : 22;

  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(70);
  encoder.setQuality(15);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const cleanServerName = getCleanServerName(guild.name).replace(/[^\x20-\x7E]/g, '').trim() || 'OUR SERVER';
  const fullTypingText = 'WELCOME TO ' + cleanServerName.toUpperCase();

  const avatarX = width / 2;
  const avatarY = 100;
  const avatarRadius = 50;

  let avatarImg = null;
  try {
    const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true });
    avatarImg = await loadImage(avatarUrl);
  } catch (err) {
    avatarImg = null;
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    const angle = (frame * Math.PI * 2) / totalFrames;
    const coinScaleX = Math.cos(angle);

    if (preloadedBgImages.length > frame && preloadedBgImages[frame]) {
      ctx.drawImage(preloadedBgImages[frame], 0, 0, width, height);
      ctx.fillStyle = 'rgba(7, 6, 18, 0.45)';
      ctx.fillRect(0, 0, width, height);
    } else {
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#090814');
      bgGrad.addColorStop(0.5, '#15102e');
      bgGrad.addColorStop(1, '#090d24');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
    }

    const pulse = Math.abs(Math.sin(angle)) * 25;
    ctx.save();
    const glow1 = ctx.createRadialGradient(avatarX, avatarY, 10, avatarX, avatarY, 160 + pulse);
    glow1.addColorStop(0, 'rgba(88, 101, 242, 0.45)');
    glow1.addColorStop(0.5, 'rgba(235, 69, 158, 0.25)');
    glow1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(20, 18, width - 40, height - 36, 20);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 3D Coin Spin
    if (Math.abs(coinScaleX) > 0.05) {
      ctx.save();
      ctx.translate(avatarX, avatarY);
      ctx.scale(coinScaleX, 1);

      ctx.lineWidth = 5;
      const rimGrad = ctx.createLinearGradient(-55, -55, 55, 55);
      rimGrad.addColorStop(0, '#5865F2');
      rimGrad.addColorStop(0.33, '#EB459E');
      rimGrad.addColorStop(0.66, '#FEE75C');
      rimGrad.addColorStop(1, '#57F287');
      ctx.strokeStyle = rimGrad;
      ctx.beginPath();
      ctx.arc(0, 0, avatarRadius + 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, avatarRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      if (avatarImg) {
        ctx.drawImage(avatarImg, -avatarRadius, -avatarRadius, avatarRadius * 2, avatarRadius * 2);
      } else {
        ctx.fillStyle = '#5865F2';
        ctx.fillRect(-avatarRadius, -avatarRadius, avatarRadius * 2, avatarRadius * 2);
      }

      const shineGrad = ctx.createLinearGradient(-avatarRadius, -avatarRadius, avatarRadius, avatarRadius);
      const shineAlpha = Math.max(0, 0.35 * Math.sin(angle));
      shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      shineGrad.addColorStop(0.5, `rgba(255, 255, 255, ${shineAlpha})`);
      shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = shineGrad;
      ctx.fillRect(-avatarRadius, -avatarRadius, avatarRadius * 2, avatarRadius * 2);

      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = '#FEE75C';
      ctx.fillRect(avatarX - 2, avatarY - avatarRadius, 4, avatarRadius * 2);
      ctx.restore();
    }

    // Typewriter
    const typingProgress = Math.min(1, (frame + 1) / 16);
    const charsCount = Math.floor(typingProgress * fullTypingText.length);
    const currentTypedText = fullTypingText.substring(0, charsCount);
    const cursor = (Math.floor(frame / 3) % 2 === 0) ? '▎' : ' ';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '600 15px "Bahnschrift", "SegoeUIBold", sans-serif';
    ctx.fillStyle = '#67E8F9';
    ctx.shadowColor = 'rgba(103, 232, 249, 0.7)';
    ctx.shadowBlur = 8;
    ctx.fillText(currentTypedText + cursor, avatarX, 195);
    ctx.restore();

    // Username
    let username = user.username;
    if (username.length > 20) username = username.substring(0, 18) + '...';

    ctx.save();
    const nameShift = (frame / totalFrames) * 220;
    const nameGrad = ctx.createLinearGradient(avatarX - 160 + nameShift, 0, avatarX + 160 + nameShift, 0);
    nameGrad.addColorStop(0, '#FFFFFF');
    nameGrad.addColorStop(0.25, '#38BDF8');
    nameGrad.addColorStop(0.65, '#F472B6');
    nameGrad.addColorStop(1, '#FFFFFF');

    ctx.shadowColor = 'rgba(56, 189, 248, 0.85)';
    ctx.shadowBlur = 12 + Math.sin(angle) * 4;

    ctx.fillStyle = nameGrad;
    ctx.textAlign = 'center';
    ctx.font = '700 36px "SegoeUIBold", "Bahnschrift", sans-serif';
    ctx.fillText(username, avatarX, 246);
    ctx.restore();

    // Badge
    const badgeText = 'MEMBER #' + guild.memberCount;
    ctx.save();
    ctx.font = '600 13px "Bahnschrift", "SegoeUIBold", sans-serif';
    const badgeWidth = ctx.measureText(badgeText).width + 32;
    const badgeHeight = 26;
    const badgeX = avatarX - badgeWidth / 2;
    const badgeY = 270;

    ctx.fillStyle = 'rgba(12, 12, 35, 0.75)';
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 13);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#E0E7FF';
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, avatarX, badgeY + 18);
    ctx.restore();

    encoder.addFrame(ctx);
  }

  encoder.finish();
  return encoder.out.getData();
}

// --- 3. GENERATE VISUAL CYBER CAPTCHA ---
function generateCaptchaImage(code) {
  const width = 360;
  const height = 110;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#060610');
  grad.addColorStop(0.5, '#120f26');
  grad.addColorStop(1, '#050718');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(0, 217, 255, 0.25)' : 'rgba(235, 69, 158, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.random() * width, Math.random() * height);
    ctx.bezierCurveTo(
      Math.random() * width, Math.random() * height,
      Math.random() * width, Math.random() * height,
      Math.random() * width, Math.random() * height
    );
    ctx.stroke();
  }

  const colors = ['#00D9FF', '#57F287', '#EB459E', '#FEE75C', '#38BDF8'];
  const startX = 40;
  for (let i = 0; i < code.length; i++) {
    ctx.save();
    const x = startX + i * 58;
    const y = 72 + (Math.random() * 10 - 5);
    const rot = (Math.random() * 0.3) - 0.15;
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.font = '700 46px "Bahnschrift", sans-serif';
    ctx.fillStyle = colors[i % colors.length];
    ctx.shadowColor = colors[i % colors.length];
    ctx.shadowBlur = 12;
    ctx.fillText(code[i], 0, 0);
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

const pendingCaptchas = new Map();

function randomCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let res = '';
  for (let i = 0; i < 5; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

// --- 4. DISCORD CLIENT SETUP ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  client.user.setActivity('NISHU STORE 🚀', { type: ActivityType.Watching });

  setupRolesChannelPanel();
  setupTicketPanel();
  setupCinemaPanel();
  registerSlashCommands();
});

client.once('ready', () => {
  console.log(`✅ Connected and ready as ${client.user.tag}!`);
});

// Setup VIP Cinema Panel in #🎬・vip-cinema
async function setupCinemaPanel() {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    const cinemaChannel = guild.channels.cache.find(c => c.name.includes('vip-cinema'));
    if (!cinemaChannel) return;

    const messages = await cinemaChannel.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('VIP CINEMA'));
    if (botMsg) {
      console.log('📌 VIP Cinema Panel already exists in #vip-cinema.');
      return;
    }

    const cinemaEmbed = new EmbedBuilder()
      .setColor(0x9333EA)
      .setTitle('🎬 NISHU VIP CINEMA // PRIVATE WATCH PARTY LOUNGE')
      .setDescription(
        'Welcome to **NISHU STORE\'s Official Virtual Cinema**! 🍿\n\n' +
        'An exclusive high-speed entertainment hub for movie lovers, series bingers, and private watch parties with friends.\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '**🌟 VIP CINEMA FEATURES:**\n' +
        '• 🎬 **Unlimited Library:** Access over 50,000+ Movies & TV Series in 1080p / 4K.\n' +
        '• 🍿 **Private Watch Parties:** Spawn your own Private Voice Cinema room & invite friends to watch together.\n' +
        '• ⚡ **Ad-Free Streaming:** Clean, fast multi-server streaming with zero popups.\n' +
        '• 🔍 **Interactive Search:** Find any Hollywood, Bollywood, Anime, or Netflix title in seconds.\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '**💎 HOW TO ACCESS / BUY VIP:**\n' +
        'If you already have the **💎・VIP MEMBER** role, click **"VIP: Search & Play"** below.\n\n' +
        '🔒 **Don\'t have VIP yet?**\n' +
        'Upgrade your account today to unlock full VIP Cinema access, custom private rooms and premium perks! Click **"💎 Upgrade / Buy VIP"** below to open an instant order ticket!'
      )
      .setFooter({ text: 'NISHU STORE • Premium Entertainment' });

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cinema_btn_open_search')
        .setLabel('🍿 VIP: Search & Play Movie')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setLabel('💎 Upgrade / Buy VIP')
        .setStyle(ButtonStyle.Link)
        .setURL('https://discord.com/channels/' + guild.id + '/1566968095422287912')
    );

    await cinemaChannel.send({ embeds: [cinemaEmbed], components: [actionRow] });
    console.log('✅ Posted VIP Cinema panel in #vip-cinema!');
  } catch (err) {
    console.error('Error in setupCinemaPanel:', err);
  }
}

// Setup Main Role & Security Panel in #choose-your-roles
async function setupRolesChannelPanel() {
  try {
    const rolesChannelId = process.env.ROLES_CHANNEL_ID || '1566958208512163961';
    const channel = client.channels.cache.get(rolesChannelId);
    if (!channel) return;

    const messages = await channel.messages.fetch({ limit: 20 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('VERIFY & UNLOCK NISHU STORE'));
    if (botMsg) {
      console.log('📌 Verification & Role Panel already exists in #choose-your-roles.');
      return;
    }

    const rolesEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🛡️ VERIFY & UNLOCK NISHU STORE')
      .setDescription(
        'Welcome to **NISHU STORE | PREMIUM DIGITAL**!\n\n' +
        'To prevent spam bots and unlock server channels based on your membership, please verify yourself below:\n\n' +
        '🌸 **COMMUNITY ACCESS**: Unlocks general chat, giveaways, free resources & community.\n' +
        '🛍️ **CUSTOMER ACCESS**: Unlocks store categories, premium access, and support channels.\n\n' +
        '👇 Click **VERIFY NOW** to complete the quick security check!'
      )
      .setFooter({ text: 'NISHU STORE • Security & Role Gateway' })
      .setTimestamp();

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_open_role_verify')
        .setLabel('VERIFY NOW')
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({ embeds: [rolesEmbed], components: [actionRow] });
    console.log('✅ Posted clean Verification & Role panel in #choose-your-roles');
  } catch (err) {
    console.error('Error in setupRolesChannelPanel:', err);
  }
}

// --- 5. WELCOME EVENT (Clean Card in #welcome with direct link button) ---
client.on('guildMemberAdd', async (member) => {
  try {
    const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
    const rulesChannelId = process.env.RULES_CHANNEL_ID;
    const rolesChannelId = process.env.ROLES_CHANNEL_ID || '1566958208512163961';

    if (!welcomeChannelId) return;
    const channel = member.guild.channels.cache.get(welcomeChannelId);
    if (!channel) return;

    const gifBuffer = await generateAnimatedWelcomeCard(member.user, member.guild);
    const gifAttachment = new AttachmentBuilder(gifBuffer, { name: 'welcome-card.gif' });
    const cleanTitleName = getCleanServerName(member.guild.name);

    const rulesNotice = rulesChannelId 
      ? `📜 Please check out <#${rulesChannelId}> to get started!` 
      : '📜 Please check out the server rules!';

    const descriptionText = [
      `Hey ${member}, we are thrilled to have you here!`,
      '',
      rulesNotice,
      '',
      `👉 Please head over to <#${rolesChannelId}> to verify and get your role to unlock channels!`
    ].join('\n');

    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🎉 Welcome to ${cleanTitleName}!`)
      .setDescription(descriptionText)
      .addFields(
        { name: '👤 Username', value: member.user.username, inline: true },
        { name: '👥 Member #', value: `#${member.guild.memberCount}`, inline: true }
      )
      .setImage('attachment://welcome-card.gif')
      .setFooter({ text: `Server: ${cleanTitleName} • Welcome`, iconURL: member.guild.iconURL() || undefined })
      .setTimestamp();

    const linkRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🎭 CHOOSE YOUR ROLES')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${member.guild.id}/${rolesChannelId}`)
    );

    await channel.send({ 
      content: `👋 Hey ${member}, welcome to **${cleanTitleName}**!`,
      embeds: [welcomeEmbed], 
      files: [gifAttachment],
      components: [linkRow]
    });
    console.log(`📢 Welcomed ${member.user.tag}`);

    // Direct Message (DM)
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle(`Welcome to ${cleanTitleName}! 👋`)
        .setDescription(
          `Hello ${member.user.username}! Welcome to our store community.\n\n` +
          `👉 Head over to <#${rolesChannelId}> in the server to verify yourself and unlock the channels!`
        )
        .setThumbnail(member.guild.iconURL() || member.user.displayAvatarURL())
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] });
    } catch (dmErr) {}
  } catch (error) {
    console.error('❌ Error handling guildMemberAdd:', error);
  }
});

// --- 6. INTERACTION HANDLER FOR #choose-your-roles ---
client.on('interactionCreate', async (interaction) => {
  try {
    // 1. User clicks "VERIFY NOW" in #choose-your-roles
    if (interaction.isButton() && interaction.customId === 'btn_open_role_verify') {
      await interaction.deferReply({ flags: 64 });

      const correctCode = randomCode();
      pendingCaptchas.set(interaction.user.id, { code: correctCode, timestamp: Date.now() });

      const options = [correctCode];
      while (options.length < 4) {
        const decoy = randomCode();
        if (!options.includes(decoy)) options.push(decoy);
      }
      options.sort(() => Math.random() - 0.5);

      const captchaBuffer = generateCaptchaImage(correctCode);
      const captchaAttachment = new AttachmentBuilder(captchaBuffer, { name: 'cyber-captcha.png' });

      const buttonRow = new ActionRowBuilder();
      options.forEach(opt => {
        buttonRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`role_verify_${opt}`)
            .setLabel(opt)
            .setStyle(ButtonStyle.Primary)
        );
      });

      const captchaEmbed = new EmbedBuilder()
        .setColor(0x00D9FF)
        .setTitle('🛡️ NISHU STORE // SECURITY GATEWAY')
        .setDescription(
          '**HUMAN VERIFICATION SCANNER**\n\n' +
          'Please select the exact **5-character code** shown in the holographic scanner below to unlock server channels.\n\n' +
          '⏱️ *Expires in 2 minutes.*'
        )
        .setImage('attachment://cyber-captcha.png')
        .setFooter({ text: 'Anti-Raid Visual Security • Click your matching code below' });

      return interaction.editReply({
        embeds: [captchaEmbed],
        files: [captchaAttachment],
        components: [buttonRow]
      });
    }

    // 2. User selects Captcha Code Button
    if (interaction.isButton() && interaction.customId.startsWith('role_verify_')) {
      const chosenCode = interaction.customId.replace('role_verify_', '');
      const stored = pendingCaptchas.get(interaction.user.id);

      if (!stored) {
        return interaction.reply({
          content: '⚠️ **Session expired.** Please click "VERIFY NOW" again.',
          flags: 64
        });
      }

      if (chosenCode === stored.code) {
        pendingCaptchas.delete(interaction.user.id);

        // Auto-assign COMMUNITY role (ID: 1566957216546684969)
        const communityRoleId = process.env.VERIFIED_ROLE_ID || '1566957216546684969';
        try {
          await interaction.member.roles.add(communityRoleId);
        } catch (e) {
          console.error('Role add error:', e);
        }

        // Dropdown to allow selecting Customer role if they are a buyer
        const roleMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_user_roles')
            .setPlaceholder('🛍️ Are you a store customer? Select here...')
            .addOptions([
              {
                label: '🌸 COMMUNITY MEMBER (Already Granted)',
                description: 'Access Community Chat, Giveaways, & General Discussions',
                value: '1566957216546684969',
                default: true
              },
              {
                label: '🛍️ CUSTOMER ACCESS',
                description: 'Unlocks Store Menu, Premium Access, Content Studio & Support',
                value: '1566957024749551656'
              }
            ])
        );

        const successEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🔓 ACCESS GRANTED // VERIFICATION COMPLETE!')
          .setDescription(
            `🎉 **Welcome to NISHU STORE, ${interaction.user}!**\n\n` +
            '✅ You have been granted the **🌸・COMMUNITY** role!\n' +
            '🚀 **Community channels and chats are now unlocked.**\n\n' +
            '🛍️ *Are you a store buyer or customer? Select "CUSTOMER ACCESS" in the menu below to unlock store orders & customer categories!*'
          )
          .setFooter({ text: 'NISHU STORE • Verification Gateway' });

        return interaction.update({
          embeds: [successEmbed],
          components: [roleMenu],
          files: []
        });
      } else {
        return interaction.reply({
          content: '❌ **Incorrect code.** Please click "VERIFY NOW" to try again.',
          flags: 64
        });
      }
    }

    // 3. User selects CUSTOMER in Dropdown
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_user_roles') {
      const selected = interaction.values;
      const customerRoleId = '1566957024749551656';

      if (selected.includes(customerRoleId)) {
        await interaction.member.roles.add(customerRoleId).catch(() => {});
        return interaction.reply({
          content: '🛍️ **CUSTOMER Role Granted!** All store categories, premium access, and customer channels have been unlocked for you! 🚀',
          flags: 64
        });
      } else {
        return interaction.reply({
          content: '🌸 You have Community access active!',
          flags: 64
        });
      }
    }

    // 4. Ticket System: Open Ticket Buttons
    if (interaction.isButton() && (interaction.customId === 'ticket_buy' || interaction.customId === 'ticket_support')) {
      await handleTicketCreate(interaction);
    }

    // 5. Ticket System: Close Ticket Button
    if (interaction.isButton() && interaction.customId === 'ticket_close') {
      await handleTicketClose(interaction);
    }

    // 6. VIP Cinema System
    if (interaction.isChatInputCommand() && interaction.commandName === 'cinema') {
      await handleCinemaCommand(interaction);
    }

    if (interaction.isButton() && interaction.customId.startsWith('cinema_')) {
      await handleCinemaButton(interaction);
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('cinema_')) {
      await handleCinemaSelect(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'modal_cinema_search') {
      await handleCinemaModal(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err);
  }
});

// --- TICKET SYSTEM CONSTANTS ---
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID || '1566967818866524212';
const TICKET_PANEL_CHANNEL_ID = process.env.TICKET_PANEL_CHANNEL_ID || '1566968095422287912';
const TICKET_LOG_CHANNEL_ID = process.env.TICKET_LOG_CHANNEL_ID || '1566975747879477299';

// Staff Roles with ticket access
const STAFF_ROLE_IDS = [
  '1566955712851222699', // 👑 OWNER
  '1566956388213850153', // 💜 STORE MANAGER
  '1566956542933213345', // 🛡️ ADMIN
  '1566956709115728083'  // 🎫 SUPPORT TEAM
];

// Setup Ticket Panel in #open-a-ticket
async function setupTicketPanel() {
  try {
    const channel = client.channels.cache.get(TICKET_PANEL_CHANNEL_ID);
    if (!channel) {
      console.warn('⚠️ Ticket panel channel not found:', TICKET_PANEL_CHANNEL_ID);
      return;
    }

    const messages = await channel.messages.fetch({ limit: 10 });
    const existingMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('SUPPORT & ORDER DESK'));
    if (existingMsg) {
      console.log('📌 Ticket panel already exists in #open-a-ticket.');
      return;
    }

    const ticketEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎫 NISHU STORE • SUPPORT & ORDER DESK')
      .setDescription(
        'Welcome to the official **NISHU STORE Help Desk**!\n\n' +
        'Need to place an order, make a payment, or get assistance with digital services? Click a button below to open a private ticket with our staff:\n\n' +
        '🛒 **BUY / ORDER TICKET**\n' +
        '└ For purchasing accounts, digital assets, subscriptions & custom orders.\n\n' +
        '🛠️ **GENERAL SUPPORT**\n' +
        '└ For payment inquiries, technical assistance, questions & order help.\n\n' +
        '⚠️ *Please do not open multiple tickets for the same request.*'
      )
      .setFooter({ text: 'NISHU STORE • Customer Service 24/7' })
      .setTimestamp();

    const ticketButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_buy')
        .setLabel('Buy / Order')
        .setEmoji('🛒')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('ticket_support')
        .setLabel('Get Support')
        .setEmoji('🛠️')
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({ embeds: [ticketEmbed], components: [ticketButtons] });
    console.log('✅ Posted Ticket Panel in #open-a-ticket');
  } catch (err) {
    console.error('Error in setupTicketPanel:', err);
  }
}

// Handle Ticket Creation
async function handleTicketCreate(interaction) {
  try {
    await interaction.deferReply({ flags: 64 });

    const guild = interaction.guild;
    const user = interaction.user;
    const isOrder = interaction.customId === 'ticket_buy';
    const typeLabel = isOrder ? 'Order' : 'Support';
    const prefix = isOrder ? '🛒' : '🛠️';

    // Prevent user from opening too many duplicate open tickets
    const existingChannel = guild.channels.cache.find(c => 
      c.parentId === TICKET_CATEGORY_ID && 
      c.topic && 
      c.topic.includes(user.id)
    );

    if (existingChannel) {
      return interaction.editReply({
        content: `⚠️ You already have an open ticket in ${existingChannel}! Please use that channel.`
      });
    }

    // Channel name format: order-username or support-username
    const sanitizedName = user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 15) || 'user';
    const channelName = `${prefix}・${isOrder ? 'order' : 'support'}-${sanitizedName}`;

    // Permission overwrites: private channel
    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.EmbedLinks
        ]
      }
    ];

    // Grant access to Staff roles
    for (const roleId of STAFF_ROLE_IDS) {
      if (guild.roles.cache.has(roleId)) {
        permissionOverwrites.push({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory
          ]
        });
      }
    }

    // Create the ticket channel
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY_ID,
      topic: `Ticket Owner: ${user.tag} (${user.id}) | Type: ${typeLabel}`,
      permissionOverwrites
    });

    // Send Welcome Message inside the new ticket
    const ticketWelcomeEmbed = new EmbedBuilder()
      .setColor(isOrder ? 0x57F287 : 0x5865F2)
      .setTitle(`${prefix} Welcome to your ${typeLabel} Ticket!`)
      .setDescription(
        `Hello ${user}, thank you for contacting **NISHU STORE**!\n\n` +
        (isOrder
          ? '📦 **For Orders:** Please mention the product/service you want to purchase and your preferred payment method.\n'
          : '🛠️ **For Support:** Please describe your issue in detail so our team can help you immediately.\n') +
        '\n👥 Our staff team (<@&1566956709115728083>) will be with you shortly.\n\n' +
        '🔒 *Click the button below when you are finished to close this ticket.*'
      )
      .setFooter({ text: 'NISHU STORE • Ticket Help Desk' })
      .setTimestamp();

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `${user} | <@&1566956709115728083> 🔔`,
      embeds: [ticketWelcomeEmbed],
      components: [controlRow]
    });

    // Notify user in the interaction
    await interaction.editReply({
      content: `✅ Your ticket channel has been created: ${ticketChannel}! Please click to view.`
    });

    // Send Ticket Open Log to #ticket-logs
    const logChannel = client.channels.cache.get(TICKET_LOG_CHANNEL_ID);
    if (logChannel) {
      const openLog = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('📥 Ticket Opened')
        .addFields(
          { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
          { name: '🏷️ Type', value: `${prefix} ${typeLabel}`, inline: true },
          { name: '💬 Channel', value: `${ticketChannel.name} (<#${ticketChannel.id}>)`, inline: true }
        )
        .setTimestamp();
      await logChannel.send({ embeds: [openLog] }).catch(() => {});
    }

    console.log(`🎫 Created ticket channel ${ticketChannel.name} for ${user.tag}`);
  } catch (err) {
    console.error('Error creating ticket channel:', err);
    await interaction.editReply({
      content: '❌ Failed to create ticket channel. Please contact an admin!'
    }).catch(() => {});
  }
}

// Handle Ticket Closing
async function handleTicketClose(interaction) {
  try {
    const channel = interaction.channel;

    // Check if channel is inside the ticket category
    if (channel.parentId !== TICKET_CATEGORY_ID) {
      return interaction.reply({
        content: '❌ This command can only be used inside a ticket channel!',
        flags: 64
      });
    }

    const closeEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🔒 Ticket Closing')
      .setDescription('This ticket will be permanently closed and deleted in **5 seconds**...')
      .setFooter({ text: 'NISHU STORE • Ticket Management' });

    await interaction.reply({ embeds: [closeEmbed] });

    // Send Closed Log to #ticket-logs
    const logChannel = client.channels.cache.get(TICKET_LOG_CHANNEL_ID);
    if (logChannel) {
      const closeLog = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('📕 Ticket Closed')
        .addFields(
          { name: '💬 Channel', value: channel.name, inline: true },
          { name: '👤 Closed By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
          { name: 'ℹ️ Topic', value: channel.topic || 'N/A', inline: false }
        )
        .setTimestamp();
      await logChannel.send({ embeds: [closeLog] }).catch(() => {});
    }

    setTimeout(async () => {
      await channel.delete('Ticket closed by user or staff').catch(err => {
        console.error('Error deleting ticket channel:', err);
      });
    }, 5000);
  } catch (err) {
    console.error('Error closing ticket:', err);
  }
}

// ==========================================
// --- 7. VIP MOVIE & PRIVATE CINEMA SYSTEM ---
// ==========================================
const VIP_ROLE_ID = '1566956868461527133'; // 💎・VIP MEMBER
const activeCinemaRooms = new Map(); // voiceChannelId -> { ownerId, guildId }

// Register Slash Commands: /cinema
async function registerSlashCommands() {
  try {
    const commands = [
      new SlashCommandBuilder()
        .setName('cinema')
        .setDescription('🎬 NISHU VIP Private Cinema & Watch Party Hub')
        .addSubcommand(sub =>
          sub
            .setName('search')
            .setDescription('Search for movies & create a private Watch Party')
            .addStringOption(opt =>
              opt.setName('query')
                .setDescription('Movie title to search (e.g. Inception, Avatar, Marvel)')
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('panel')
            .setDescription('Open the VIP Cinema Control Panel')
        )
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    console.log('🔄 Registering VIP Cinema Slash Commands...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('✅ Successfully registered VIP Cinema slash commands!');
  } catch (err) {
    console.error('Error registering slash commands:', err);
  }
}

// Fetch Movie Search from OMDb
function searchMovieOMDb(query) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'www.omdbapi.com',
      path: `/?s=${encodeURIComponent(query)}&apikey=trilogy`,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.Search || []);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

// Fetch Full Movie Details
function getMovieDetails(imdbID) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'www.omdbapi.com',
      path: `/?i=${imdbID}&plot=full&apikey=trilogy`,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Helper: Check if user is VIP or Staff
function isUserVIP(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return member.roles.cache.has(VIP_ROLE_ID);
}

// Handle /cinema command
async function handleCinemaCommand(interaction) {
  const member = interaction.member;

  // VIP Role Gate
  if (!isUserVIP(member)) {
    const noVipEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('💎 VIP CINEMA // ACCESS RESTRICTED')
      .setDescription(
        `Hey ${interaction.user}, the **Private Cinema & Watch Party Hub** is an exclusive feature for **💎・VIP MEMBERS**!\n\n` +
        '🌟 **VIP Perks:**\n' +
        '• 🎬 Unlimited Movie & TV Series Streaming\n' +
        '• 🍿 Create Private Voice Channels for you & your friends\n' +
        '• ⚡ Ad-Free Instant HD Streaming Players\n\n' +
        '👉 Please open a ticket in <#1566968095422287912> to upgrade to VIP Access!'
      )
      .setFooter({ text: 'NISHU STORE • VIP Lounge' });

    return interaction.reply({ embeds: [noVipEmbed], flags: 64 });
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'panel') {
    const panelEmbed = new EmbedBuilder()
      .setColor(0x9333EA)
      .setTitle('🍿 NISHU STORE // VIP PRIVATE CINEMA')
      .setDescription(
        `Welcome to your private cinema lounge, ${interaction.user}!\n\n` +
        '🎬 **How it works:**\n' +
        '1. Click **"🔍 Search Movie"** below to find any movie or show.\n' +
        '2. Choose your movie from the interactive list.\n' +
        '3. Click **"🍿 Create Private Cinema VC"** to spawn a private cinema room for you & your friends!\n' +
        '4. Play movie in VC and invite your friends anytime.\n\n' +
        '⚡ *HD Quality • Ad-Free Streams • Auto-cleaning Rooms*'
      )
      .setFooter({ text: 'NISHU STORE • VIP Experience' })
      .setTimestamp();

    const panelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cinema_btn_open_search')
        .setLabel('🔍 Search Movie')
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.reply({ embeds: [panelEmbed], components: [panelRow], flags: 64 });
  }

  if (subcommand === 'search') {
    await interaction.deferReply({ flags: 64 });
    const query = interaction.options.getString('query');
    await displayMovieSearchResults(interaction, query);
  }
}

// Search and Display Movie Results
async function displayMovieSearchResults(interaction, query) {
  const results = await searchMovieOMDb(query);

  if (!results || results.length === 0) {
    return interaction.editReply({
      content: `❌ No movies found matching "**${query}**". Please check the spelling and try again!`
    });
  }

  const topResults = results.slice(0, 10);
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('cinema_select_movie')
    .setPlaceholder('🎬 Select a movie to view & create Watch Party...');

  topResults.forEach((m) => {
    selectMenu.addOptions({
      label: m.Title.slice(0, 70),
      description: `📅 ${m.Year} • Type: ${m.Type.toUpperCase()} • ID: ${m.imdbID}`,
      value: m.imdbID,
      emoji: '🍿'
    });
  });

  const searchEmbed = new EmbedBuilder()
    .setColor(0x38BDF8)
    .setTitle(`🔍 Movies Found for "${query}"`)
    .setDescription('Select your movie from the dropdown menu below to see details and start your **Private Cinema Watch Party**!')
    .setFooter({ text: 'Found ' + topResults.length + ' results • NISHU VIP Cinema' });

  const row = new ActionRowBuilder().addComponents(selectMenu);
  return interaction.editReply({ embeds: [searchEmbed], components: [row] });
}

// Handle Cinema Select Menu (Movie Selected)
async function handleCinemaSelect(interaction) {
  if (interaction.customId === 'cinema_select_movie') {
    await interaction.deferUpdate();
    const imdbID = interaction.values[0];
    const movie = await getMovieDetails(imdbID);

    if (!movie || movie.Response === 'False') {
      return interaction.followUp({ content: '❌ Could not retrieve movie details.', flags: 64 });
    }

    // Embed with Movie Info
    const movieEmbed = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle(`🎬 ${movie.Title} (${movie.Year})`)
      .setDescription(
        `⭐ **IMDb Rating:** \`${movie.imdbRating}/10\`  •  ⏱️ **Runtime:** \`${movie.Runtime}\`\n` +
        `🎭 **Genre:** \`${movie.Genre}\`  •  🌐 **Language:** \`${movie.Language}\`\n\n` +
        `📝 **Plot Synopsis:**\n${movie.Plot.slice(0, 500)}\n\n` +
        `👥 **Cast:** ${movie.Actors}\n` +
        `🎬 **Director:** ${movie.Director}`
      )
      .setFooter({ text: `IMDb ID: ${movie.imdbID} • NISHU VIP Cinema` });

    if (movie.Poster && movie.Poster !== 'N/A') {
      movieEmbed.setImage(movie.Poster);
    }

    // Clean player stream links (Multiple HD fallback sources)
    const streamSource1 = `https://vidsrc.to/embed/movie/${movie.imdbID}`;
    const streamSource2 = `https://autoembed.to/movie/imdb/${movie.imdbID}`;

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cinema_create_room_${movie.imdbID}_${movie.Title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`)
        .setLabel('🍿 Create Private Cinema VC')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setLabel('▶️ Watch Player (Source 1)')
        .setStyle(ButtonStyle.Link)
        .setURL(streamSource1),
      new ButtonBuilder()
        .setLabel('▶️ Player (Source 2)')
        .setStyle(ButtonStyle.Link)
        .setURL(streamSource2)
    );

    return interaction.editReply({ embeds: [movieEmbed], components: [buttonRow] });
  }
}

// Handle Cinema Buttons
async function handleCinemaButton(interaction) {
  // 1. Open Search Modal
  if (interaction.customId === 'cinema_btn_open_search') {
    const modal = new ModalBuilder()
      .setCustomId('modal_cinema_search')
      .setTitle('🔍 Search VIP Movie / Series');

    const searchInput = new TextInputBuilder()
      .setCustomId('cinema_search_input')
      .setLabel('Movie Title')
      .setPlaceholder('e.g. Spider-Man, Avengers, Interstellar')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(searchInput);
    modal.addComponents(row);
    return interaction.showModal(modal);
  }

  // 2. Create Private Cinema Voice Channel
  if (interaction.customId.startsWith('cinema_create_room_')) {
    await interaction.deferReply({ flags: 64 });
    const parts = interaction.customId.replace('cinema_create_room_', '').split('_');
    const imdbID = parts[0];
    const shortTitle = parts[1] || 'Movie';

    const guild = interaction.guild;
    const user = interaction.user;

    // Check if user already has an active room
    for (const [chId, data] of activeCinemaRooms.entries()) {
      if (data.ownerId === user.id) {
        const existing = guild.channels.cache.get(chId);
        if (existing) {
          return interaction.editReply({
            content: `⚠️ You already have an active Cinema Room: ${existing}!\nPlease join or leave that room before creating a new one.`
          });
        } else {
          activeCinemaRooms.delete(chId);
        }
      }
    }

    // VIP Category or fallback
    const parentCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('PREMIUM ACCESS'));

    // Create Temporary Private Voice Channel
    try {
      const cinemaRoom = await guild.channels.create({
        name: `🍿・${user.username}-cinema`,
        type: ChannelType.GuildVoice,
        parent: parentCategory ? parentCategory.id : undefined,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.Stream,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.ManageChannels
            ]
          },
          {
            id: VIP_ROLE_ID,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
          }
        ]
      });

      activeCinemaRooms.set(cinemaRoom.id, { ownerId: user.id, guildId: guild.id });

      const streamUrl1 = `https://vidsrc.to/embed/movie/${imdbID}`;
      const streamUrl2 = `https://autoembed.to/movie/imdb/${imdbID}`;

      const roomCreatedEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🍿 PRIVATE CINEMA ROOM CREATED!')
        .setDescription(
          `🎉 Your Private Watch Party Room is ready: ${cinemaRoom}!\n\n` +
          '**📺 How to Watch with Friends:**\n' +
          '1️⃣ **Join Your Room:** Click ' + cinemaRoom.toString() + ' to connect to voice.\n' +
          '2️⃣ **Open Movie Stream:** Click **"▶️ Watch Movie Stream (HD)"** below to open the movie.\n' +
          '3️⃣ **Stream to Friends:** In your voice channel, click **"Share Your Screen"** to stream it directly to everyone in your cinema room!\n' +
          '4️⃣ **Invite Friends:** Right-click the voice channel and invite any server friend to join your watch party.\n\n' +
          '🧹 *This room will automatically delete when everyone leaves.*'
        )
        .setFooter({ text: 'NISHU VIP Cinema • Private Watch Party' });

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('▶️ Watch Movie Stream (HD)')
          .setStyle(ButtonStyle.Link)
          .setURL(streamUrl1),
        new ButtonBuilder()
          .setLabel('▶️ Backup Stream Player')
          .setStyle(ButtonStyle.Link)
          .setURL(streamUrl2)
      );

      return interaction.editReply({ embeds: [roomCreatedEmbed], components: [buttonRow] });
    } catch (e) {
      console.error('Error creating cinema voice room:', e);
      return interaction.editReply({ content: '❌ Failed to create cinema room: ' + e.message });
    }
  }
}

// Handle Modal Submit
async function handleCinemaModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  const query = interaction.fields.getTextInputValue('cinema_search_input');
  await displayMovieSearchResults(interaction, query);
}

// Auto-Delete empty cinema voice rooms
client.on('voiceStateUpdate', async (oldState, newState) => {
  const channel = oldState.channel;
  if (!channel) return;

  if (activeCinemaRooms.has(channel.id)) {
    // If no members are left in the channel, delete it
    if (channel.members.size === 0) {
      activeCinemaRooms.delete(channel.id);
      setTimeout(async () => {
        try {
          const recheck = channel.guild.channels.cache.get(channel.id);
          if (recheck && recheck.members.size === 0) {
            await recheck.delete('Cinema room empty - auto cleaned up');
            console.log(`🧹 Auto-deleted empty cinema room: ${channel.name}`);
          }
        } catch (err) {}
      }, 5000);
    }
  }
});

// ==========================================
// --- 8. START BOT ---
// ==========================================
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ ERROR: DISCORD_TOKEN is missing in your .env file!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);

