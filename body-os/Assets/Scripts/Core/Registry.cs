using System.Collections.Generic;

namespace BodyOS
{
    /// <summary>
    /// Lightweight static registry. Components add themselves in OnEnable and remove themselves in
    /// OnDisable, so systems can iterate them without FindObjectsOfType or per-frame allocations.
    /// </summary>
    public static class Registry<T> where T : class
    {
        public static readonly List<T> Items = new List<T>(64);

        public static void Add(T item) { if (item != null && !Items.Contains(item)) Items.Add(item); }
        public static void Remove(T item) { Items.Remove(item); }
    }
}
