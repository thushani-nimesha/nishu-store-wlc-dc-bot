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
  StringSelectMenuBuilder
} = require('discord.js');
const express = require('express');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const GIFEncoder = require('gif-encoder-2');
const path = require('path');
const fs = require('fs');

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
  ],
});

client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  client.user.setActivity('NISHU STORE 🚀', { type: ActivityType.Watching });

  setupRolesChannelPanel();
});

client.once('ready', () => {
  console.log(`✅ Connected and ready as ${client.user.tag}!`);
});

// Setup Main Role & Security Panel in #choose-your-roles
async function setupRolesChannelPanel() {
  try {
    const rolesChannelId = process.env.ROLES_CHANNEL_ID || '1566958208512163961';
    const channel = client.channels.cache.get(rolesChannelId);
    if (!channel) return;

    const messages = await channel.messages.fetch({ limit: 10 });
    const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('VERIFY & GET ROLES'));
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
  } catch (err) {
    console.error('Interaction error:', err);
  }
});

// --- 7. START BOT ---
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ ERROR: DISCORD_TOKEN is missing in your .env file!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
