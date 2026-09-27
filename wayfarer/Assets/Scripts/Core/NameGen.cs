using System.Text;

namespace Wayfarer
{
    /// <summary>Procedural names for systems, planets, species and plants.</summary>
    public static class NameGen
    {
        static readonly string[] Onsets = {
            "", "b", "br", "c", "ch", "cr", "d", "dr", "f", "fr", "g", "gl", "h", "j", "k", "kh", "kr", "l",
            "m", "n", "p", "ph", "pr", "qu", "r", "s", "sh", "sk", "sp", "st", "t", "th", "tr", "v", "vr",
            "w", "x", "y", "z", "zh" };

        static readonly string[] Vowels = {
            "a", "e", "i", "o", "u", "a", "e", "o", "ae", "ai", "au", "ea", "ei", "eo", "ia", "io", "oa", "ou", "y" };

        static readonly string[] Codas = {
            "", "", "", "", "n", "r", "s", "l", "th", "x", "m", "nd", "rn", "st", "k", "sh", "v", "z", "ll", "rth" };

        static readonly string[] SystemSuffix = { "", "", "", "", " Prime", " Major", " Minor", " Reach", " Expanse", " Drift", " Nexus" };
        static readonly string[] Roman = { "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X" };

        static string Syllable(Rng r, bool last)
        {
            var sb = new StringBuilder();
            sb.Append(r.Pick(Onsets));
            sb.Append(r.Pick(Vowels));
            if (last || r.Chance(0.35)) sb.Append(r.Pick(Codas));
            return sb.ToString();
        }

        public static string Word(Rng r, int minSyl = 2, int maxSyl = 3)
        {
            int n = r.Int(minSyl, maxSyl);
            var sb = new StringBuilder();
            for (int i = 0; i < n; i++) sb.Append(Syllable(r, i == n - 1));
            string s = sb.ToString();
            if (s.Length < 3) s += r.Pick(Vowels) + r.Pick(Codas);
            if (s.Length > 11) s = s.Substring(0, 11);
            return char.ToUpperInvariant(s[0]) + s.Substring(1);
        }

        public static string System(ulong seed)
        {
            var r = new Rng(Hash.Mix(seed, 0x5157));
            string name = Word(r, 2, 3);
            if (r.Chance(0.25)) name += "-" + r.Int(1, 99);
            return name + r.Pick(SystemSuffix);
        }

        public static string Planet(ulong seed, string systemName, int index)
        {
            var r = new Rng(Hash.Mix(seed, 0x9A7E));
            if (r.Chance(0.35))
            {
                string baseName = systemName.Split(' ')[0].Split('-')[0];
                return baseName + " " + Roman[index % Roman.Length];
            }
            string n = Word(r, 2, 3);
            if (r.Chance(0.15)) n += " " + r.Pick(new[] { "Alpha", "Beta", "Gamma", "Delta", "Tau", "Sigma" });
            return n;
        }

        public static string Species(ulong seed)
        {
            var r = new Rng(Hash.Mix(seed, 0x5BEC));
            string genus = Word(r, 2, 3);
            string sp = Word(r, 2, 3).ToLowerInvariant();
            if (!sp.EndsWith("a") && !sp.EndsWith("us") && !sp.EndsWith("is"))
                sp += r.Pick(new[] { "us", "ia", "is", "um", "ae", "or", "ax" });
            return genus + " " + sp;
        }

        public static string Station(ulong seed)
        {
            var r = new Rng(Hash.Mix(seed, 0x57A7));
            string[] kinds = { "Station", "Outpost", "Waypoint", "Terminus", "Haven", "Exchange", "Spire", "Anchorage" };
            return Word(r, 2, 2) + " " + r.Pick(kinds);
        }

        public static string Outpost(ulong seed)
        {
            var r = new Rng(Hash.Mix(seed, 0x0B57));
            string[] kinds = { "Outpost", "Relay", "Depot", "Camp", "Observatory", "Refinery", "Beacon" };
            return Word(r, 2, 2) + " " + r.Pick(kinds);
        }
    }
}
