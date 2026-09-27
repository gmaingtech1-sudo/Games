namespace Wayfarer
{
    /// <summary>Fragments of an older story, found at ruins and wrecks.</summary>
    public static class Lore
    {
        static readonly string[] Openings =
        {
            "The stone is warm to the touch. Light moves beneath its surface, and words surface in your mind:",
            "The glyphs rearrange themselves as you watch, settling into something you can almost read:",
            "A low hum rises from the monolith. Your translator catches a fragment of a much longer message:",
            "Dust falls from the carvings as they begin to glow. The meaning arrives all at once:",
        };

        static readonly string[] Monoliths =
        {
            "\"We mapped a thousand suns and named none of them. Names are for things you intend to keep.\"",
            "\"The core calls to every traveller. Few ask what it is calling them toward.\"",
            "\"Here the Keth-Varun waited for the last ship home. It did not come. We built this so the waiting would not be forgotten.\"",
            "\"Every world remembers the ones who walked it. The rocks keep count, even when the stars do not.\"",
            "\"We were gardeners once. We seeded these valleys and watched them grow wild and strange. We are proud of what they became.\"",
            "\"The drones were ours. We made them to protect what we loved. We forgot to tell them when to stop.\"",
            "\"Distance is only a problem for those in a hurry.\"",
            "\"Beyond the last jump there is another. There is always another.\"",
            "\"If you are reading this, you have come further than we did. Keep going.\"",
            "\"The sky you see is the sky we saw. It has not changed. We have.\"",
        };

        static readonly string[] Wrecks =
        {
            "The flight recorder is cracked but readable. The last entry: \"Engines cold. Beautiful view, though. Tell them the view was worth it.\"",
            "A pilot's journal flickers on a broken screen: \"Day 12. Found water, found food, lost the radio. I think I'll stay a while.\"",
            "The cargo manifest lists forty crates of seeds, destination unknown. The crates are empty. Something is growing nearby.",
            "Scorched into the hull, in a hurried hand: \"Sentinels don't like it when you take too much. Learned that the hard way.\"",
            "The nav computer still holds a course plotted toward the galactic core, 'one jump at a time'.",
            "A child's drawing is taped above the pilot's seat: a small ship, a big star, and the word HOME.",
        };

        public static string Monolith(ulong seed)
        {
            var r = new Rng(seed);
            return r.Pick(Openings) + "\n\n" + r.Pick(Monoliths);
        }

        public static string Wreck(ulong seed)
        {
            var r = new Rng(seed ^ 0xABCDEF);
            return r.Pick(Wrecks) + "\n\nYou salvage what you can.";
        }
    }
}
