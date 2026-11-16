# Changelog

## 2.1.0
- **Safer downloads**: Java, Vanilla, Purpur, Forge, NeoForge, Modrinth and CurseForge files are checked against their published checksums before they are kept. (Fabric publishes none for its generated launcher.)
- **Locked-down window**: the app page is only served with a secret that changes on every launch and is kept in the user's own data folder. A strict Content-Security-Policy and security headers were added.
- **New original icon**, Mojang's required disclaimer, an About screen with Privacy and Licenses, and an MIT license.
- **Uninstaller** and an entry in Windows "Apps & features". You choose whether to keep your servers and worlds.
- **Setup installs the Microsoft WebView2 runtime** when a PC is missing it.
- **Map** now draws worlds from Minecraft 1.13 to 1.17 as well.
- **Home screen** warns never to forward the private control port, and says when live info is unavailable.
- **Plain-language errors** for no internet, full disks and broken backups. Backups are self-checked after they are made.
- **Restored** after the 2.0 redesign: renaming a server, the performance-mode (Java flags) choice, Force stop, and the BlueMap 3D view.
- **Internet sharing through playit.gg** (play with friends anywhere, no router setup).
- Offline-mode accounts keep working; the setting is now worded "Allow non-premium accounts".
- Keyboard focus is visible everywhere, switches have accessible names, and animations respect "reduce motion".
- Logs rotate at 1 MB. Automated tests run on every build and on GitHub.

## 2.0.0
- Native app window, Apple-style redesign, animated tutorial, AI usage bar, "build a server from an idea", CurseForge source, encrypted API keys.

## 1.0.0
- First version: servers of every type, console, chat, players, map, inventories, mods, backups, settings, files, AI helper.
