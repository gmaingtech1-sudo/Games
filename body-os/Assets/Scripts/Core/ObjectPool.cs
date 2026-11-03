using System;
using System.Collections.Generic;

namespace BodyOS
{
    /// <summary>Simple generic pool used for notifications, scan markers and effect spheres.</summary>
    public sealed class ObjectPool<T> where T : class
    {
        readonly Stack<T> free = new Stack<T>();
        readonly Func<T> create;
        readonly Action<T> onGet;
        readonly Action<T> onRelease;

        public ObjectPool(Func<T> create, Action<T> onGet = null, Action<T> onRelease = null, int prewarm = 0)
        {
            this.create = create; this.onGet = onGet; this.onRelease = onRelease;
            for (int i = 0; i < prewarm; i++) { var item = create(); onRelease?.Invoke(item); free.Push(item); }
        }

        public T Get()
        {
            T item = free.Count > 0 ? free.Pop() : create();
            onGet?.Invoke(item);
            return item;
        }

        public void Release(T item)
        {
            if (item == null) return;
            onRelease?.Invoke(item);
            free.Push(item);
        }
    }
}
