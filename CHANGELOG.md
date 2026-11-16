# Changelog

## 2.2.0
- **Liquid Glass look**: the sidebar, selected-tab pill, buttons, popups, sheets and toasts are glass that bends what is behind it at the edges. Content cards are frosted, soft colours drift behind, pages slide in, and the tab pill stretches as it moves. Light and dark mode; turns solid when Windows transparency effects are off; still respects "reduce motion".
- **Problems list** on Home: known trouble from the log (a plugin that failed to load, a port already in use, out of memory, lag, outdated server software, plugin errors) in plain words with how to fix it.
- **World tab**: test a seed on a hidden throwaway world and see what is near spawn, make a new world (the old one is kept), and pre-generate land with Chunky with a progress bar.
- **Events tab**: run commands at a time and on days you pick, with ready-made drop party, snowball fight and movie night events.
- **Phone alerts** through the free ntfy app (no account): crashes, failed backups, players joining, server start and stop.
- **Ranks tab**: LuckPerms ranks and permissions with switches instead of commands.
- **Voice chat setup**: one button gives Simple Voice Chat its own playit.gg tunnel so friends anywhere can talk.
- **Tray icon**: closing the window while a server runs hides BlockHost by the clock instead; click the icon to bring it back.
- Fixed: a server dropping the control (RCON) connection no longer leaves a command waiting; it reconnects and retries once.

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
