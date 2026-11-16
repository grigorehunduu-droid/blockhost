BLOCKHOST
=================

Run your own Minecraft Java server on this PC and manage it from a simple window.

NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
Privacy: see PRIVACY.txt (also in the app under About > Privacy). Licenses: NOTICES.txt.

INSTALL AND START
-----------------
Run BlockHost-Setup.exe (installs to %LocalAppData%\BlockHost and adds a Desktop and Start
menu shortcut), then open BlockHost from the shortcut. Windows may warn that the publisher
is unknown (the file is not code-signed): click "More info", then "Run anyway".
Or unzip BlockHost-portable.zip anywhere short (e.g. C:\BlockHost) and run BlockHost.exe.
To update, run the newer Setup again; your servers (data\ folder) are kept.
To uninstall, use Windows Settings > Apps > BlockHost (or run Uninstall.exe in its folder).
It asks whether to keep your servers and worlds; the default is to keep them.
Node.js is bundled. Java is downloaded the first time you create a server (needs internet).
Click "+ New server", pick the software and version, tick the Minecraft EULA box, create.
When the install finishes (watch the Console tab) press Start.

Closing the window does NOT stop your Minecraft servers. The app quietly closes itself
about a minute after the last window is closed and no server is running. Use the "Quit"
button (top right) to stop every server and close the app.

Everything lives in this folder (data\ has your servers, worlds, backups and settings),
so you can move or copy the whole folder.

WHICH SOFTWARE?
---------------
 Vanilla   official, no mods          Paper / Purpur  fast, plugins (best for friends)
 Fabric    light mods                 Forge / NeoForge  big modpacks

Mods/Plugins tab: search and click Install (needed libraries such as Fabric API come
along), or drag a .jar file onto the box. Source "Modrinth" works with no setup. Source
"CurseForge" needs a free API key (sign in at console.curseforge.com, API keys) pasted
once into the box that appears; some CurseForge files can't be downloaded by apps - the
authors disabled it - and you'll get a message to download those by hand. The tab is
empty for Vanilla (it has no mods or plugins).

PLAYERS WITHOUT A PAID ACCOUNT
------------------------------
Settings > "Allow non-premium accounts" lets people join without a paid Minecraft account
(offline mode). It is less safe: anyone can join as any name, including an admin, and players
get different identities than on a verified server. Use it together with "Only players I
approve" (Players tab) and, on Plugins servers, a login-password plugin (the Settings page
has a shortcut to find one). Restart the server after changing it.

MORE SERVERS / OTHER VERSIONS
-----------------------------
"+ New server" (top) makes another server with its own folder and port; pick one in the
drop-down at the top. On a server's Dashboard, "Minecraft version & software" switches
to another version or software (a backup is made first; going to an OLDER version can
break a world - restore the backup if so).

HOW FRIENDS CONNECT
-------------------
1. Same Wi-Fi / home network: give them your PC's local IP (open Command Prompt, type
   "ipconfig", look for "IPv4 Address", e.g. 192.168.1.20). In Minecraft they add
   192.168.1.20:25565 (use the port shown on the Dashboard if it is not 25565).
2. Anywhere, easiest: on the Home screen press "Set up internet sharing", sign in to
   playit.gg (free) with the link it shows, and approve BlockHost. Press "Get an address"
   and send that address to your friends. No router setup, and it works with any internet
   provider. BlockHost runs playit's small official helper only while sharing is on;
   "Turn off sharing" stops it, and "Unlink playit.gg" forgets the link on this PC.
3. Over the internet without playit: forward TCP port 25565 (or your server's port) on your router to
   this PC, then friends use your public IP (search "what is my IP"). Only forward the
   Minecraft port. Do NOT forward the app's own port or the RCON port.
4. If your internet provider uses CGNAT (port forwarding does not work, or your router's
   WAN IP differs from the "what is my IP" result), use option 2, or Tailscale (friends
   install it and join your network).

WINDOWS FIREWALL
----------------
The first time a server starts, Windows asks whether to let "Java(TM) Platform SE binary"
through the firewall. Click Allow on Private networks (and Public only if you want people
outside your home to connect). If friends cannot connect, check this first.

BACKUPS
-------
Backups tab: "Back up now", or set an automatic schedule. Restore needs the server stopped;
the world you replace is kept next to it as world_before_restore_<time>.
Automatic backups keep only the last N; manual ones are never deleted automatically.
Switching server software makes a backup first.

AI HELPER
---------
Paste an API key from Claude (console.anthropic.com), OpenAI (platform.openai.com) or
Gemini (aistudio.google.com, has a free tier). A ChatGPT Plus / Claude Pro subscription
is a different thing and cannot be linked. The key is stored in data\settings.json on this
PC only. The assistant can suggest console commands, but nothing runs until you press Run.

SAFETY NOTES
------------
- The app only listens on 127.0.0.1 (this PC), and every request needs a per-launch token.
- Each server has RCON enabled with a random password (the app needs it). Minecraft
  listens for RCON on all network adapters, so never port-forward the RCON port.
- Map colours and item icons are read from your own Minecraft client files when found
  (or downloaded from Mojang if you click the button on the Map tab).

PROBLEMS?
---------
data\logs\node.err and data\logs\app.log hold the app's errors; each server's own logs are
in data\servers\<id>\logs.

KEEP THE FOLDER PATH SHORT
--------------------------
Windows (and Java) break on paths over ~260 characters, which Forge servers hit easily.
Put this folder somewhere short such as C:\MCServerManager or Documents\MCServerManager.

FOR DEVELOPERS
--------------
Tests:   node --test "tests/*.test.js"
Build:   powershell -ExecutionPolicy Bypass -File tools\build.ps1
         (stops if a test fails or if a key, settings file or data folder would be packaged)
Before a public release, set "homepage" in app\version.json to your project page
(e.g. https://github.com/you/blockhost). It goes into the User-Agent that services
like Modrinth ask for, and turns on the "new version available" check.
