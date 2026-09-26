/* Riftborn — build settings.

   googleMapsKey: a Google Maps Platform API key with the Map Tiles API
   turned on. Leave it empty in the repository. Players can also paste a
   key in Menu → Google Maps, which is stored on their phone only. The
   Android build fills these in from the GOOGLE_MAPS_KEY, FIREBASE_API_KEY
   and FIREBASE_PROJECT_ID environment variables (see
   ../riftborn-android/build.sh). */
window.RB_CONFIG = {
  googleMapsKey: '',
  // Online accounts (sign up / log in with email, cloud saves, a shared
  // leaderboard): your Firebase project's Web API key and project ID. Leave
  // empty to keep accounts on the phone. See README.md → Accounts.
  firebase: { apiKey: '', projectId: '' },
};
