using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;

namespace Wayfarer
{
    /// <summary>Work that runs on a background thread, then finishes on the main thread.</summary>
    public abstract class BackgroundJob
    {
        public double Priority;          // lower runs first
        public volatile bool Cancelled;

        /// <summary>Runs on a worker thread. Must not touch Unity objects.</summary>
        public abstract void Execute();

        /// <summary>Runs on the main thread after Execute.</summary>
        public abstract void Complete();

        /// <summary>Checked on the main thread before dispatch; return false to drop the job.</summary>
        public virtual bool StillWanted() => !Cancelled;

        public Exception Error;
    }

    /// <summary>A small pool of worker threads that build terrain chunks and
    /// scatter plants in the background so the frame rate never hitches.</summary>
    public static class TerrainJobs
    {
        static readonly List<BackgroundJob> pending = new List<BackgroundJob>();
        static readonly ConcurrentQueue<BackgroundJob> work = new ConcurrentQueue<BackgroundJob>();
        static readonly ConcurrentQueue<BackgroundJob> done = new ConcurrentQueue<BackgroundJob>();
        static SemaphoreSlim signal;
        static Thread[] threads;
        static volatile bool running;
        static int inFlight;
        static int threadCount;

        public static int Pending => pending.Count + inFlight;

        public static void Start()
        {
            if (running) return;
            running = true;
            threadCount = Math.Max(1, Math.Min(6, Environment.ProcessorCount - 2));
            signal = new SemaphoreSlim(0);
            threads = new Thread[threadCount];
            for (int i = 0; i < threadCount; i++)
            {
                threads[i] = new Thread(Worker) { IsBackground = true, Name = "Wayfarer terrain " + i, Priority = ThreadPriority.BelowNormal };
                threads[i].Start();
            }
        }

        public static void Stop()
        {
            if (!running) return;
            running = false;
            for (int i = 0; i < threadCount; i++) signal.Release();
            pending.Clear();
            while (work.TryDequeue(out _)) { }
            while (done.TryDequeue(out _)) { }
            inFlight = 0;
        }

        static void Worker()
        {
            while (running)
            {
                signal.Wait();
                if (!running) break;
                if (!work.TryDequeue(out var job)) continue;
                if (!job.Cancelled)
                {
                    try { job.Execute(); }
                    catch (Exception e) { job.Error = e; }
                }
                done.Enqueue(job);
            }
        }

        public static void Submit(BackgroundJob job)
        {
            pending.Add(job);
        }

        /// <summary>Call once per frame on the main thread: hand the most urgent jobs
        /// to the workers and finish completed ones within a time budget.</summary>
        public static void Pump(double budgetMs)
        {
            if (!running) Start();
            var sw = Stopwatch.StartNew();
            while (done.TryDequeue(out var job))
            {
                Interlocked.Decrement(ref inFlight);
                if (job.Error != null)
                {
                    UnityEngine.Debug.LogException(job.Error);
                }
                else if (!job.Cancelled)
                {
                    try { job.Complete(); }
                    catch (Exception e) { UnityEngine.Debug.LogException(e); }
                }
                if (sw.Elapsed.TotalMilliseconds > budgetMs) break;
            }

            int capacity = threadCount * 2 - inFlight;
            if (capacity <= 0 || pending.Count == 0) return;
            pending.RemoveAll(j => !j.StillWanted());
            if (pending.Count == 0) return;
            pending.Sort((a, b) => a.Priority.CompareTo(b.Priority));
            int n = Math.Min(capacity, pending.Count);
            for (int i = 0; i < n; i++)
            {
                Interlocked.Increment(ref inFlight);
                work.Enqueue(pending[i]);
                signal.Release();
            }
            pending.RemoveRange(0, n);
        }

        public static void CancelWhere(Predicate<BackgroundJob> match)
        {
            foreach (var j in pending) if (match(j)) j.Cancelled = true;
            pending.RemoveAll(match);
        }
    }
}
