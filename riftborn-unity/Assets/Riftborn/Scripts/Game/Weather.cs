// Riftborn — the real weather where you are, like Pokémon GO's weather
// boost. Every 20 minutes (or after you've travelled a few km) it asks
// Open-Meteo (free, no key) for the current weather at your position,
// rounded to about 1 km. Each kind of weather draws out one element: more
// of those creatures appear, they come stronger and give extra XP, and the
// map shows the rain, snow or fog. Offline there's simply no boost.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;

namespace Riftborn
{
    public class WeatherKind { public string name, nightName; public El el; public WeatherKind(string n, El e, string night = null) { name = n; el = e; nightName = night; } }

    public class WeatherNow { public string kind; public int temp, wind; public bool day; public long at; public double lat, lng; }

    public static class Weather
    {
        public static readonly Dictionary<string, WeatherKind> Kinds = new Dictionary<string, WeatherKind>
        {
            { "clear", new WeatherKind("Sunny", El.Ember, "Clear night") },
            { "partly", new WeatherKind("Partly cloudy", El.Gale) },
            { "cloudy", new WeatherKind("Cloudy", El.Stone) },
            { "fog", new WeatherKind("Fog", El.Void) },
            { "rain", new WeatherKind("Rain", El.Tide) },
            { "snow", new WeatherKind("Snow", El.Tide) },
            { "storm", new WeatherKind("Thunderstorm", El.Volt) },
            { "windy", new WeatherKind("Windy", El.Gale) },
        };

        // WMO weather codes (what Open-Meteo reports) → our kinds.
        public static string KindOf(int code, double wind)
        {
            if (code >= 95) return "storm";
            if (wind >= 32 && code < 51) return "windy";
            if ((code >= 71 && code <= 77) || code == 85 || code == 86) return "snow";
            if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
            if (code == 45 || code == 48) return "fog";
            if (code == 3) return "cloudy";
            if (code == 2) return "partly";
            return "clear";
        }

        const long EVERY = 20 * 60000;
        public static WeatherNow Now;
        public static event Action<WeatherNow> OnChange;
        static bool busy;
        static long failedAt;

        // The element the weather draws out right now, or null.
        public static El? Boost => Now != null ? Kinds[Now.kind].el : (El?)null;

        public static string Name(WeatherNow w) { var k = Kinds[w.kind]; return !w.day && k.nightName != null ? k.nightName : k.name; }

        // Call with your position whenever it changes; it only asks when needed.
        public static async void Update(double lat, double lng, bool force = false)
        {
            long now = Rng.NowMs();
            bool far = Now == null || World.Dist(lat, lng, Now.lat, Now.lng) > 3000;
            if (busy || (!force && Now != null && now - Now.at < EVERY && !far)) return;
            if (!force && now - failedAt < 5 * 60000) return;
            busy = true;
            try
            {
                string url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat.ToString("0.00", CultureInfo.InvariantCulture) +
                    "&longitude=" + lng.ToString("0.00", CultureInfo.InvariantCulture) + "&current=weather_code,temperature_2m,wind_speed_10m,is_day&timezone=auto";
                var res = await Net.Request("GET", url);
                if (res.status != 200) throw new Exception("weather " + res.status);
                var c = Json.Get(Json.Parse(res.text), "current");
                if (!(Json.Get(c, "weather_code") is double code)) throw new Exception("no weather");
                double wind = Json.Get(c, "wind_speed_10m") is double w ? w : 0;
                string before = Now?.kind;
                Now = new WeatherNow
                {
                    kind = KindOf((int)code, wind),
                    temp = (int)Math.Round(Json.Get(c, "temperature_2m") is double t ? t : 0),
                    wind = (int)Math.Round(wind),
                    day = !(Json.Get(c, "is_day") is double d) || d != 0,
                    at = Rng.NowMs(), lat = lat, lng = lng,
                };
                if (Now.kind != before) OnChange?.Invoke(Now);
            }
            catch (Exception)
            {
                failedAt = Rng.NowMs();   // try again in a few minutes
            }
            finally { busy = false; }
        }
    }
}
