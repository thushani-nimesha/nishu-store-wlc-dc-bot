# 🤖 24/7 Discord Welcome Bot

A modern Discord Welcome Bot built with **Discord.js v14** and an embedded **Express keep-alive web server** to easily run 24/7 on free cloud hosting platforms like **Render**, **Railway**, or **Koyeb**.

---

## ✨ Features

- 🎨 **Rich Welcome Embeds**: Greets new members with their avatar, username, and real-time server member count.
- 📜 **Server Rules Link**: Prompts newcomers to check your server's rules channel.
- ✉️ **DM Welcome Card**: Automatically sends a friendly introductory Direct Message (DM) to new members upon joining.
- 🌐 **24/7 Keep-Alive HTTP Server**: Built-in `/` endpoint ready to be pinged with free uptime monitoring tools (e.g. UptimeRobot) so the bot stays online 24/7.

---

## 🛠️ Step 1: Create Your Bot on Discord Developer Portal

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, give it a name (e.g., `WelcomeBot`), and accept the Terms.
3. In the left sidebar, click on **Bot**:
   - Click **Reset Token** and copy the token. Save it for your `.env` file (`DISCORD_TOKEN`).
   - Scroll down to **Privileged Gateway Intents** and enable:
     - ✅ **SERVER MEMBERS INTENT** (*CRITICAL: required to detect when members join!*)
     - ✅ **MESSAGE CONTENT INTENT**
   - Click **Save Changes**.

4. In the left sidebar, click on **OAuth2** -> **URL Generator**:
   - Under **SCOPES**, check: `bot`.
   - Under **BOT PERMISSIONS**, check:
     - `Send Messages`
     - `Embed Links`
     - `Attach Files`
     - `Read Message History` / `View Channels`
   - Copy the generated URL at the bottom and open it in a browser tab to **invite the bot to your Discord server**.

---

## ⚙️ Step 2: Configure Your Environment

In this project directory, create a `.env` file (copy from `.env.example`):

```env
DISCORD_TOKEN=your_bot_token_here
WELCOME_CHANNEL_ID=your_welcome_channel_id_here
RULES_CHANNEL_ID=your_rules_channel_id_here
PORT=3000
```

> **How to get Channel IDs:**
> In Discord, go to **User Settings** -> **Advanced** -> turn on **Developer Mode**.
> Then right-click your welcome channel and click **Copy Channel ID**. Do the same for your rules channel.

---

## 💻 Step 3: Run Locally (Testing)

In your terminal / PowerShell:

```bash
# Start the bot
node index.js
```

You should see:
```
🌐 Web server listening on port 3000 (Keep-alive ready)
✅ Logged in as WelcomeBot#1234!
```

---

## ☁️ Step 4: Host 24/7 For Free

To make the bot run 24/7 without keeping your computer turned on, you can host it for free on **Render.com**:

1. Push your project to **GitHub** (the `.gitignore` file already prevents uploading your private `.env`).
2. Go to [Render.com](https://render.com/) and sign up / log in.
3. Click **New +** -> **Web Service**.
4. Connect your GitHub repository.
5. In the settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Instance Type**: `Free`
6. Scroll down to **Environment Variables** and add:
   - `DISCORD_TOKEN` = `your_bot_token`
   - `WELCOME_CHANNEL_ID` = `your_channel_id`
   - `RULES_CHANNEL_ID` = `your_rules_channel_id`
7. Click **Create Web Service**.
8. Once deployed, copy your Render web service URL (e.g. `https://your-bot-name.onrender.com`).
9. Go to [UptimeRobot.com](https://uptimerobot.com/) (free):
   - Add a new **HTTP(s) Monitor**.
   - Paste your Render URL.
   - Set the check interval to **every 5 or 10 minutes**.
   - This keeps your bot awake 24/7 and prevents the free server from sleeping!
