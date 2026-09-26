/* Riftborn — build settings.

   googleMapsKey: a Google Maps Platform API key with the Map Tiles API
   turned on. Leave it empty in the repository. Players can also paste a
   key in Menu → Google Maps, which is stored on their phone only. The
   Android build fills this in from the GOOGLE_MAPS_KEY environment
   variable (see ../riftborn-android/build.sh). */
window.RB_CONFIG = {
  googleMapsKey: '',
};
