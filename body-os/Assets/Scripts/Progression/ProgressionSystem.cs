using UnityEngine;

namespace BodyOS
{
    /// <summary>Experience, levels, upgrade points, location discovery and memory fragments.</summary>
    public sealed class ProgressionSystem
    {
        public const int MaxLevel = 30;
        readonly Game game;
        ProgressData P => game.Data.progress;

        public ProgressionSystem(Game game) { this.game = game; }

        public int Level => P.level;
        public int Xp => P.xp;
        public int Points => P.upgradePoints;
        public int XpToNext => XpForLevel(P.level);

        /// <summary>XP needed to advance from <paramref name="level"/> to the next level.</summary>
        public static int XpForLevel(int level) { return 100 + 50 * (level - 1); }

        public void AddXp(int amount, string reason)
        {
            if (amount <= 0) return;
            P.xp += amount;
            GameEvents.Notify("+" + amount + " XP  " + reason, NoticeType.Reward);
            while (P.level < MaxLevel && P.xp >= XpForLevel(P.level))
            {
                P.xp -= XpForLevel(P.level);
                P.level++;
                P.upgradePoints++;
                AudioManager.I?.Play(Sfx.LevelUp);
                GameEvents.Notify("LEVEL " + P.level + " REACHED  +1 upgrade point", NoticeType.Success);
                game.Log("Reached level " + P.level + ".");
            }
            if (P.level >= MaxLevel) P.xp = Mathf.Min(P.xp, XpForLevel(MaxLevel) - 1);
            GameEvents.RaiseProgression();
        }

        public void AddPoints(int amount)
        {
            if (amount == 0) return;
            P.upgradePoints = Mathf.Max(0, P.upgradePoints + amount);
            GameEvents.RaiseProgression();
        }

        public bool SpendPoints(int amount)
        {
            if (amount > P.upgradePoints) return false;
            P.upgradePoints -= amount;
            GameEvents.RaiseProgression();
            return true;
        }

        public bool IsDiscovered(string locationId) => P.discoveredLocations.Contains(locationId);

        public void Discover(string locationId)
        {
            if (string.IsNullOrEmpty(locationId) || IsDiscovered(locationId)) return;
            var loc = game.Content.Location(locationId);
            if (loc == null) return;
            P.discoveredLocations.Add(locationId);
            AudioManager.I?.Play(Sfx.Discovery);
            GameEvents.Notify("LOCATION DISCOVERED: " + loc.displayName, NoticeType.Info);
            game.Log("Discovered " + loc.displayName + ".");
            game.SetFlag("location." + locationId);
            AddXp(loc.discoveryXp, "exploration");
            RevealFragments();
        }

        /// <summary>Recovers memory fragments for discovered locations that the current Memory attribute can reach.
        /// Called when locations are discovered and whenever Memory changes, rewarding experimentation.</summary>
        public void RevealFragments()
        {
            if (game.Body == null) return;
            int memory = game.Body.Get(StatId.Memory);
            int recovered = 0;
            foreach (var id in P.discoveredLocations)
            {
                var loc = game.Content.Location(id);
                if (loc == null || loc.fragments == null) continue;
                foreach (var f in loc.fragments)
                {
                    if (f == null || P.revealedFragments.Contains(f.id) || memory < f.memoryRequired) continue;
                    P.revealedFragments.Add(f.id);
                    recovered++;
                    GameEvents.Notify("MEMORY RECOVERED (" + loc.displayName + "): " + f.text, NoticeType.Story);
                }
            }
            if (recovered > 0)
            {
                AudioManager.I?.Play(Sfx.Memory);
                AddXp(15 * recovered, "memory recovered");
            }
        }

        public bool IsFragmentRevealed(string id) => P.revealedFragments.Contains(id);
    }
}
