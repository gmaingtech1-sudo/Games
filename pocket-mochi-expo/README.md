# Pocket Mochi for Expo Go

The Pocket Mochi virtual pet as an Expo app you can open in **Expo Go** on iPhone or Android. It's the same game as the web version in [`../pocket-mochi`](../pocket-mochi), running full screen inside the app, with native extras:

- **Haptics** through `expo-haptics`: taps, chomps, purrs, hatching and bumps in Star Catch. This includes iPhones, where the web version can't vibrate.
- **Saves stored in the app** with AsyncStorage, so your pet survives restarts.
- **Pauses with the app.** It saves when you switch away and catches up on your pet's needs when you come back.
- **Android back button** closes the shop, snack tray, washing or the mini-game before it leaves the app.

It targets **Expo SDK 57** and uses only modules that ship inside Expo Go, so no custom build is needed.

## Run it on your phone

You need a computer with [Node.js](https://nodejs.org) (the LTS version) to run the dev server. Your phone connects to it.

1. Install **Expo Go** from the App Store or Google Play. If it's already installed, update it: it has to support SDK 57.
2. On the computer, get this repository and start the app:

   ```sh
   cd pocket-mochi-expo
   npm install
   npx expo start
   ```

3. Scan the QR code that appears in the terminal:
   - **iPhone:** use the Camera app, then tap the Expo Go banner.
   - **Android:** open Expo Go and tap **Scan QR code**.

The phone and computer need to be on the same Wi-Fi. If they aren't, or the phone can't connect, run `npx expo start --tunnel` instead.

## Good to know

- **Sound** plays after your first tap. On iPhone it follows the silent switch, like most games.
- **Fonts** load from Google Fonts when the phone is online. Offline, the game falls back to the phone's rounded system font.
- **Saves** are kept separately from the browser version, so a pet adopted in Safari or Chrome won't show up in the app.

## Changing the game

The game code lives in `../pocket-mochi` and is shared with the web version. `game/gameHtml.js` is a generated copy of it, inlined into one HTML string for the app's WebView. After changing anything in `../pocket-mochi`, regenerate it:

```sh
npm run bundle-game   # rebuild game/gameHtml.js
npm run check-game    # fails if game/gameHtml.js is out of date
```

| File | What it does |
| --- | --- |
| `App.js` | Native shell: the WebView, saving, haptics, app pause/resume, Android back button |
| `game/gameHtml.js` | Generated. The whole web game as one HTML string |
| `scripts/bundle-game.js` | Builds `game/gameHtml.js` from `../pocket-mochi` |
| `../pocket-mochi/js/host.js` | The game's side of the bridge: uses the app when it's there, the browser otherwise |

To install it as a standalone app instead of opening it through Expo Go, build it with EAS: `npx eas-cli@latest build`.
