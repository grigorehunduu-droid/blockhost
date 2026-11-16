# Security

## Reporting a problem
Please report security problems privately, not in a public issue. Use GitHub's
"Report a vulnerability" button on this repository (Security tab), and include
what you found, how to reproduce it, and which BlockHost version you used.

## What BlockHost protects
- The app only listens on 127.0.0.1. Its page is served only with a per-launch
  secret stored in the user's data folder, and every API call needs a separate
  per-launch token.
- Downloads are checked against published checksums where the source provides one.
- API keys are encrypted at rest with Windows DPAPI for the current user.
- Release builds refuse to package keys, saved settings or user data.

## Known limits
- Minecraft's RCON listens on every network adapter; BlockHost uses a random
  password, and users must never port-forward that port.
- Mods and plugins are third-party code that runs on the user's PC.
- Programs already running as the same Windows user can read the data folder.
