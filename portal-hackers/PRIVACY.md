# Portal Hackers: Nexus — Privacy Policy

_Last updated: 10 October 2026_

This policy covers the Portal Hackers: Nexus game, both the Android app (package `app.portalhackers.game`) and the web version. In short: the game has no servers of its own, no ads, no analytics and no purchases. Almost everything stays on your phone.

## What stays on your phone

- **Your location.** If you choose **Use my location**, the game reads your phone's GPS to place you on the map and work out which portals are near you. Your location is used only on your phone. It is never sent to us or to anyone else. You can play without it (**Play at home**), and you can turn location access off at any time in your phone's settings.
- **Your account.** Your username and password are stored only on your phone. The password is never stored as you typed it: it's salted and hashed (PBKDF2-SHA256). Accounts don't exist anywhere else, so we can't see them, recover them or reset them.
- **Your progress.** Your level, items, portals, settings, profile and a copy of your recent team chat messages are saved on your phone.

## What other players see: team chat

When you're logged in, the game joins your team's chat room. Team chat works directly between players' phones (WebRTC), not through a server of ours.

- Teammates in the room see: your **username**, **avatar**, **name colour**, **title**, **level**, **Prestige**, and the **messages** you send. If **Share my captures in team chat** is on, they also see short updates such as "captured (portal name)" or "reached Level 10". You can turn that off in the menu.
- Anyone who picks the same team can join that team's room. Please don't share personal information (your real name, address, school, phone number and so on) in chat.
- Messages are kept only on the phones of players who were in the room. Nobody stores them on a server.
- To connect phones to each other, the game uses the free public **PeerJS** server (`0.peerjs.com`). It sees your phone's IP address and a random connection ID while you're connected. It doesn't see your messages, location or account. See [peerjs.com](https://peerjs.com/) for its privacy terms.

## Fonts

The game loads its fonts from **Google Fonts**, which means Google receives your IP address when the fonts load. See [Google's privacy policy](https://policies.google.com/privacy). Without an internet connection, the game uses your phone's own fonts.

## Blocking and reporting

In team chat, tap a player's name to **block** them (you won't see their messages any more). After blocking, you can also **report** them: this opens a report form on the project's public issue tracker on GitHub, with their recent messages filled in. Reports are public on GitHub, so you can edit the form before you send it. You need a GitHub account to send a report.

## Children

Portal Hackers: Nexus is not directed at children under 13. Because team chat is open to any player on the same team, younger players should only play with a parent's or guardian's permission.

## Deleting your data

- **☰ → Delete account** removes your account and all your progress from the phone.
- Uninstalling the app (or clearing the site's data in your browser) removes everything the game stored.
- Messages you sent may still be on teammates' phones until they delete their accounts or the game.

## Changes

If this policy changes, the new version will be posted here with a new date.

## Contact

For questions about this policy, or to report a problem, open an issue at <https://github.com/gmaingtech1-sudo/Games/issues>.
