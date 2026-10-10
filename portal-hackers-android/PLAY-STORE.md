# Publishing Portal Hackers: Nexus on Google Play

Everything you need for the Play Console and for YouTube is in this folder:

| File | What it's for |
| --- | --- |
| `dist/portal-hackers.aab` | The **App Bundle** you upload to Play Console |
| `dist/portal-hackers.apk` | The same app as an APK, for installing by hand |
| `store/icon-512.png` | App icon (512 × 512, 32-bit PNG) |
| `store/feature-graphic-1024x500.png` | Feature graphic |
| `store/shot-*.png` | 8 phone screenshots (1080 × 1920) |
| `store/portal-hackers-trailer.mp4` | The trailer (65 s, 1920 × 1080, H.264 + AAC) for YouTube |
| `store/youtube-thumbnail-1280x720.png` | YouTube thumbnail |

## App facts

| | |
| --- | --- |
| Package name | `app.portalhackers.game` |
| Version | 1.4.3 (version code 8) |
| Target SDK | 36 (Android 16), as Google Play requires for new apps from 31 August 2026 |
| Min SDK | 24 (Android 7.0) |
| Upload key SHA-256 | `BB:5B:70:14:C4:13:64:DD:69:A4:77:E1:D2:CF:05:38:5F:88:E3:A7:AA:72:05:53:52:39:07:B8:93:C7:D5:98` |
| Privacy policy | <https://github.com/gmaingtech1-sudo/Games/blob/HEAD/portal-hackers/PRIVACY.md> (works once this branch is merged into the default branch) |

## 1. Android developer verification (the "Add key" screen)

1. The package name you register must be exactly **`app.portalhackers.game`**. If you registered a different one, either register this one or ask for the app's package name to be changed to yours.
2. On **Add key**, paste the upload key's SHA-256 fingerprint:

   ```
   BB:5B:70:14:C4:13:64:DD:69:A4:77:E1:D2:CF:05:38:5F:88:E3:A7:AA:72:05:53:52:39:07:B8:93:C7:D5:98
   ```

3. After you set up Play App Signing (step 2), Google signs the Play version with its own key. If developer verification asks for it, add that one too: Play Console → your app → **Test and release → Setup → App signing** shows the **App signing key certificate** SHA-256.

The private key itself (`portal-hackers-upload.jks`) and its password were given to you separately. **They are not in this repository, on purpose: the repository is public.** Keep the file and password somewhere safe (a password manager, plus a backup). You need them for every update. If you lose them, Play Console lets you request an upload key reset, but it takes days.

## 2. Play Console

1. **Create app**: name *Portal Hackers: Nexus*, default language English, **Game**, **Free**.
2. **Test and release → Testing → Internal testing → Create new release.** Accept **Play App Signing** when asked (Google manages the app signing key; your key is the upload key). Upload `dist/portal-hackers.aab`.
3. **Grow users → Store presence → Main store listing**: paste the text below and upload the icon, feature graphic and screenshots from `store/`. Add the YouTube trailer link as the **video**.
4. **Monitor and improve → Policy and programs → App content**: fill in the forms using the suggested answers below.
5. New personal developer accounts must run a **closed test with at least 12 testers for 14 days** before they can apply for production access. Start that early.

## 3. Store listing

**App name** (30 max)

```
Portal Hackers: Nexus
```

**Short description** (80 max)

```
Hack real-world portals, knock out rival teams and rise to Nexus Master.
```

**Full description**

```
Portals are opening on your streets. Pick a team, grab your 3D Sci-Fi Compass and go hack them.

PORTAL HACKERS: NEXUS is a location game for three teams: NOVA, PULSAR and ECLIPSE. Walk your real neighbourhood (or play at home by tapping to walk), discover portals, and fight for every one.

◆ EXPLORE WITH A 3D SCI-FI COMPASS
Portals stand at their real direction and distance as spinning crystals on beams of light. Collect Tech Cubes, hunt rare Nexus signals, and switch to the territory map to see who holds the city.

◆ HACK
Crack each portal's code in a fast memory puzzle at Basic, Advanced or Expert difficulty. Successful hacks drop gear: Uplinks, Pulse Bombs, Firewalls and Portal Keys. Hack an enemy portal and you sabotage it, too.

◆ ATTACK AND CAPTURE
Knock out enemy Uplinks with Pulse Bombs until the portal goes neutral, then deploy your own Uplink to take it. Build portals up to Level 8 and install Firewalls so they hold.

◆ LINK AND RAISE CONTROL FIELDS
Link your team's portals with keys. Close a triangle and raise a control field.

◆ LEVEL UP
50 levels and 5 ranks, from Scout to Hacker, Operative, Nexus Agent and Nexus Master, with a reward at every level and a major unlock every 5. Then Prestige and do it again.

◆ TEAM UP
Live team chat with everyone on your team who's online. Squad missions, team events every two hours, weekly team objectives and team levels.

◆ MAKE IT YOURS
Upgrade your compass, and customise your profile with avatars, name colours, banners, titles and compass skins from the in-game shop. Everything is bought with Tech Cores you earn by playing: there are no real-money purchases and no ads.

Play safe: stay aware of your surroundings, don't trespass, and never play while driving or cycling.
```

**Category:** Game → Adventure (or Strategy). **Tags:** Adventure, Strategy, Location-based.

## 4. App content: suggested answers

Check every answer against Google's current wording before you submit. You're responsible for what you declare.

- **Privacy policy:** the URL above.
- **Ads:** No ads.
- **App access:** *Is any part of your app restricted?* **Yes** (you need an account to play). Add sign-in details: name `Review account`, username `PlayReview`, password `Review2026`. This account is built in: it logs in on any phone, because Google's reviewers can't sign up. Paste the instructions from the [App access](#app-access-instructions) section below.
- **Content rating (IARC questionnaire):** Game. Violence: none (abstract "attacks" on glowing portals, no characters hurt). **Users can interact or exchange content: Yes** (team chat). **Shares user location with other users: No.** No purchases of digital goods with real money. Expect a Teen-type rating because of the open chat.
- **Target audience:** 13 and over (the open chat makes it unsuitable for children). Not designed for children.
- **Data safety:**
  - Location (precise): used **on the device only**, never sent off it, so it is not "collected" in Google's sense.
  - Account username and password: stored only on the device; the password is hashed.
  - **Messages (in-app messages)** and **user IDs (username)** with avatar, title and level: sent to other players in team chat (directly between phones). Answer these as collected for **app functionality**, not shared with third parties for other purposes, and not optional if the player uses chat. Data is encrypted in transit (WebRTC). Players can delete their data in the app (☰ → Delete account).
  - No other data is collected. The PeerJS connection service sees IP addresses only to connect phones; Google Fonts sees IP addresses when fonts load.
- **User-generated content:** players can **block** others (tap their name in chat) and **report** them (opens a report on the project's GitHub issues page with their recent messages).
- **Government app / financial features / health:** No.

## App access instructions

For **Any other information required to access your app** (under 500 characters):

```
On the first screen tap "Log in" (not Sign up) and enter the username and password above. This review account works on any device. Then pick any team and avatar, and on the next screen tap "Play at home (tap the compass to walk)" to play without GPS: tap anywhere on the compass to walk there. Everything is free; there are no purchases or subscriptions. Team chat shows messages when another player on the same team is online.
```

## 5. YouTube

**Title**

```
Portal Hackers: Nexus | Official Trailer
```

**Description**

```
Portals are opening on your streets. Pick your team, NOVA, PULSAR or ECLIPSE, and hack the city.

🔭 Explore with a 3D Sci-Fi Compass
💻 Crack portal codes and steal their gear
💥 Knock out enemy Uplinks with Pulse Bombs
🔺 Link portals and raise control fields
⚡ 50 levels, 5 ranks, then Prestige
💬 Live team chat with your faction
🎨 Make your profile your own

Free on Android. No ads, no real-money purchases.

#PortalHackers #MobileGame #IndieGame #AndroidGame #LocationBasedGame
```

**Tags:** portal hackers, portal hackers nexus, mobile game, android game, location based game, ingress like game, indie game, sci-fi game, trailer.

**Music:** the soundtrack is original, generated for this trailer, so it shouldn't trigger YouTube copyright claims.
