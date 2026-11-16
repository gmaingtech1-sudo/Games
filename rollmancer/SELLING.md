# Selling Rollmancer

Everything you need to put Rollmancer on sale: the files, the store text, and a checklist for Google Play and itch.io. Rollmancer is built as a **premium game** (pay once, own it). It has no ads, no tracking and no in-app purchases, which keeps the store paperwork short and makes the privacy answers "no data collected".

## What's ready

| File | Use it for |
| --- | --- |
| [`../rollmancer-android/dist/rollmancer.aab`](../rollmancer-android/dist/rollmancer.aab) | Google Play upload (App Bundle) |
| [`../rollmancer-android/dist/rollmancer.apk`](../rollmancer-android/dist/rollmancer.apk) | Testing on your own phone, or selling the APK directly |
| [`dist/rollmancer-web.zip`](dist/rollmancer-web.zip) | itch.io (or any HTML5 game site) |
| [`store/screens/`](store/screens) | 8 captioned phone screenshots, 1080 × 1920 |
| [`store/raw/`](store/raw) | The same screenshots without captions |
| [`store/feature.png`](store/feature.png) | Play Store feature graphic, 1024 × 500 |
| [`store/icon-512.png`](store/icon-512.png) | Store icon, 512 × 512 |
| [`privacy.html`](privacy.html) | Privacy policy. **Replace `CONTACT_EMAIL` with your support email** before you publish it |

## Store listing text

**Title** (30 max): `Rollmancer: Dice Roguelite`

**Short description** (80 max):
`Roll, hold and cast dice combos. Bend the rules with charms. Beat the Pipwyrm.`

**Full description:**

```
Roll your dice. Cast your spells.

Rollmancer is a dice roguelite where every combo is a spell. Roll five dice, hold the ones you like, reroll the rest, and cast: a Pair, a Full House or a Large Straight blasts the monster for Pips × Mult damage. Fight down through eight Depths of monsters and bosses, build a different engine every run, and defeat the Pipwyrm.

BREAK THE RULES WITH 56 CHARMS
Snake Eyes turns 1s into a Mult machine. Chameleon makes them wild. Ouroboros lets straights loop from 6 back to 1. The Metronome grows stronger every fight you win. Find the combinations that make the numbers explode.

ETCH YOUR DICE
Carve glyphs onto the faces of your dice: Flame for Pips, Storm for Mult, Prism to multiply, Echo to score twice, Wild to be any number you need, Loaded to land face up twice as often.

12 BOSSES, EACH WITH A TWIST
The Hydra heals after every cast. The Siren punishes repeating yourself. The Frost Lich freezes your dice. Read the boss coming up, shop for it, and outsmart it.

STRANGE ENCOUNTERS
Bet your gold with a Gambling Imp, feed a heart to a Cursed Altar, open a chest that might bite back, or dig up a twitching die in the Dice Graveyard. Every choice is a risk worth weighing.

ENDLESS REPLAY
• 9 dice sets and 16 secret charms to unlock
• 9 Heat levels for when you think you've mastered it
• A Daily Run: the same dice, monsters and shops for everyone, with results you can share
• Seeds you can replay or send to a friend
• Endless mode after you win
• 24 feats and a codex to fill in

MADE FOR PHONES
One-handed portrait play, quick runs you can pause any time (it saves after every move), and no internet needed. No ads. No tracking. No in-app purchases. Pay once and it's yours.
```

**Category:** Games → Card (or Board / Strategy). **Tags:** roguelike, dice, deckbuilder, strategy, offline.

**Price:** $2.99–$4.99 is the usual range for a premium indie roguelite on mobile. A launch price of $2.99 (or a launch discount from $3.99) lowers the barrier while you collect reviews; you can raise it later.

## Google Play checklist

1. **Developer account:** sign up at play.google.com/console (one-time $25 fee). To charge money, also set up a **payments profile** (Play Console → Setup → Payments profile).
2. **Your own upload key.** The builds in `dist/` are signed with the development key committed in `rollmancer-android/signing.keystore`; anyone with this repository has it. Make a private one, keep it backed up (password manager + a copy offline), and rebuild:
   ```sh
   cd rollmancer-android
   keytool -genkeypair -keystore ~/rollmancer-upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
   KEYSTORE=~/rollmancer-upload.keystore KS_ALIAS=upload KS_PASS='your password' ./build.sh
   KEYSTORE=~/rollmancer-upload.keystore KS_ALIAS=upload KS_PASS='your password' BUNDLETOOL=/path/to/bundletool-all.jar ./build-aab.sh
   ```
   Accept **Play App Signing** when Play Console offers it: Google holds the key that signs what players install, and yours is only the upload key (it can be reset through Play support if lost).
3. **Create the app:** name *Rollmancer*, type *Game*, *Paid*. (A paid app can't be switched to free later and back, so decide first.)
4. **App content** (Play Console → Policy → App content):
   - Privacy policy: host `privacy.html` (GitHub Pages: `https://<you>.github.io/<repo>/rollmancer/privacy.html`) after filling in your email.
   - Ads: **No ads**.
   - Data safety: **No data collected, no data shared.** The app has no internet permission.
   - Content rating questionnaire: cartoon fantasy monsters are hit with magic, no blood, no gambling with real money, no user interaction or chat. This usually rates **Everyone / PEGI 7** (mild fantasy violence).
   - Target audience: choosing **13+** keeps you out of the Families programme paperwork; including younger ages is possible too, since the game collects nothing.
5. **Store listing:** paste the text above; upload `store/icon-512.png`, `store/feature.png` and 4–8 images from `store/screens/`.
6. **Testing before production.** New personal developer accounts must run a **closed test with at least 12 testers for 14 days** before Google lets them publish to production. Upload `rollmancer.aab` to a closed testing track, invite friends by email (or a Google Group), and ask them to keep it installed and play a few runs. Use the time to collect feedback.
7. **Production:** promote the build, set the price and countries, and submit for review (usually a few days).

For updates: bump `versionCode` (and `versionName`) in `rollmancer-android/AndroidManifest.xml`, rebuild both files, and upload the new `.aab`.

## itch.io checklist

1. Create a project at itch.io/game/new. **Kind of project:** HTML.
2. Upload `dist/rollmancer-web.zip` and tick **This file will be played in the browser**.
3. **Embed options:** viewport 390 × 844, tick **Mobile friendly** (orientation: portrait), **Fullscreen button** and **Automatically start on page load** off (the title screen needs a tap for sound anyway).
4. **Pricing:** set a price (e.g. $3.99) or **pay what you want with a minimum**. You can also upload `rollmancer.apk` as a downloadable file for Android players.
5. Use `store/feature.png` as the cover image (itch.io crops covers to 630 × 500) and the raw screenshots in the gallery.

Rebuild the zip after changing the game with `tools/make-web-zip.sh`.

## Getting it noticed

- The **Daily Run** and its shareable result (a row of 🟩/🟥 squares) is built for social posts: post yours every day when you launch.
- Short vertical clips of a huge cast (the numbers climbing, then the hit) are the best trailer material. Record on a phone with the animation speed at 1×.
- Places roguelite and dice-game players hang out: r/roguelites, r/roguelikes (Sharing Saturday), r/AndroidGaming, r/incremental_games, r/itchio, and the Balatro-likes and dice-game communities on Discord and TikTok.
- Ask your 12 closed testers to leave a review on day one of production; early ratings matter more than anything else on the Play Store.

## Other stores

- **iOS App Store:** needs a Mac with Xcode and the Apple Developer Program ($99/year). The game would go in a small WKWebView app, the same idea as the Android shell; it isn't included here.
- **Steam / desktop:** the game plays fine with a mouse and keyboard in a portrait column. For Steam you would wrap it with Electron or Tauri and pay the $100 Steam Direct fee per game.
