// Riftborn — build settings. Leave these empty in the repository.
//
// FirebaseApiKey / FirebaseProjectId: your Firebase project's Web API key and
// project ID, for online accounts (log in on any phone, cloud saves and a
// shared leaderboard). Players can also set this up in the game (on the
// title screen, or Menu → Account → Online accounts), where it's kept on
// the phone. Use the same project as the web game and one account works in
// both.
//
// GoogleMapsKey: a Google Maps Platform key with the Map Tiles API turned
// on, to draw the map with Google Maps. Players can also add one in
// Menu → Google Maps. Without one the game uses free Esri or OpenStreetMap
// tiles.
namespace Riftborn
{
    public static class Config
    {
        public const string FirebaseApiKey = "";
        public const string FirebaseProjectId = "";
        public const string GoogleMapsKey = "";
    }
}
