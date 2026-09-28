// Riftborn — agent accounts: sign up, log in, log out, and keeping your
// progress with your account. A port of the web game's js/auth.js.
//
// Two back ends:
// - Online (when there's a Firebase project, filled in in Config.cs or
//   pasted in the game under "Set up online accounts"): email and password
//   accounts through Firebase Authentication, your save in Firestore so it
//   follows you to any phone, and a shared leaderboard. It uses the same
//   Firebase REST APIs and save format as the web game, so one account
//   plays in both.
// - On this device (no Firebase project): accounts live on the phone,
//   with passwords hashed (PBKDF2). Several agents can share one phone.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using UnityEngine;

namespace Riftborn
{
    public class FriendlyError : Exception { public FriendlyError(string m) : base(m) { } }

    public class User { public string uid, name, email, mode; }   // mode: "local" or "cloud"
    public class Board { public string uid, name, faction; public int level; public long xp; }
    public class SetupStep { public bool ok; public string text; }

    public static class Auth
    {
        const string SESSION = "riftborn-session", ACCOUNTS = "riftborn-accounts", LEGACY_TAKEN = "riftborn-legacy-taken";
        const string ONLINE_SETUP = "riftborn-firebase", LAST_LOCAL = "riftborn-last-local", LEGACY_SAVE = "riftborn-save";
        const string IDT = "https://identitytoolkit.googleapis.com/v1/accounts";

        public static User user;
        static Dictionary<string, object> session;
        static string saveKey;

        /* ------------------ Storage ------------------ */

        static string Get(string k) => PlayerPrefs.HasKey(k) ? PlayerPrefs.GetString(k) : null;
        static void Set(string k, string v) { PlayerPrefs.SetString(k, v); PlayerPrefs.Save(); }
        static void Remove(string k) { PlayerPrefs.DeleteKey(k); PlayerPrefs.Save(); }
        static Dictionary<string, object> ReadObj(string k) { try { return Json.Obj(Get(k) ?? "") ; } catch (Exception) { return null; } }

        public static string LoadSave() => saveKey != null ? Get(saveKey) : null;
        public static void WriteSave(string json) { if (saveKey != null) Set(saveKey, json); }
        public static void ClearSave() { if (saveKey != null) Remove(saveKey); }

        /* ------------------ Which Firebase project ------------------ */

        static bool BuiltIn => !string.IsNullOrEmpty(Config.FirebaseApiKey) && !string.IsNullOrEmpty(Config.FirebaseProjectId);
        public static bool IsBuiltIn => BuiltIn;
        public static (string apiKey, string projectId) Fb
        {
            get
            {
                if (BuiltIn) return (Config.FirebaseApiKey, Config.FirebaseProjectId);
                var s = ReadObj(ONLINE_SETUP);
                return (Json.Str(s, "apiKey") ?? "", Json.Str(s, "projectId") ?? "");
            }
        }
        public static bool Online => Fb.apiKey != "" && Fb.projectId != "";
        public static string ProjectId => Fb.projectId;
        public static (string apiKey, string projectId)? Setup { get { if (BuiltIn) return null; var s = ReadObj(ONLINE_SETUP); return s == null ? null : ((string, string)?)(Json.Str(s, "apiKey") ?? "", Json.Str(s, "projectId") ?? ""); } }
        static string Docs => $"https://firestore.googleapis.com/v1/projects/{Fb.projectId}/databases/(default)/documents";

        static void Fail(string text) => throw new FriendlyError(text);

        static void Validate(string name, string email, string password, bool signup)
        {
            if (signup)
            {
                string n = (name ?? "").Trim();
                if (n.Length < 2 || n.Length > 16) Fail("Pick a codename of 2 to 16 characters.");
                if (!Regex.IsMatch(n, @"^[\p{L}\p{N} _.-]+$")) Fail("Codenames can use letters, numbers, spaces, dots, dashes and underscores.");
            }
            if (!Regex.IsMatch((email ?? "").Trim(), @"^[^\s@]+@[^\s@]+\.[^\s@]+$") && (signup || Online)) Fail("Enter a valid email address.");
            if (string.IsNullOrEmpty(password) || password.Length < (signup ? 8 : 1)) Fail(signup ? "Use a password of at least 8 characters." : "Enter your password.");
        }

        static User Start(User u, Dictionary<string, object> extra = null)
        {
            user = u;
            session = new Dictionary<string, object> { { "uid", u.uid }, { "name", u.name }, { "email", u.email }, { "mode", u.mode } };
            if (extra != null) foreach (var kv in extra) session[kv.Key] = kv.Value;
            if (u.mode == "cloud") session["projectId"] = Fb.projectId;
            Set(SESSION, Json.Write(session));
            saveKey = "riftborn-save-" + u.uid;
            AdoptLegacySave();
            if (u.mode == "local") Set(LAST_LOCAL, u.uid);
            return user;
        }

        // Signing up online on a phone that already has an agent on a phone
        // account: bring that agent along instead of starting over.
        static bool moved, adopted;
        static void MoveLocalAgent()
        {
            if (LoadSave() != null) return;
            string from = Get(LAST_LOCAL);
            var db = LocalAccounts();
            var acct = from != null ? Json.Get(db, "users", from) as Dictionary<string, object> : null;
            string json = from != null ? Get("riftborn-save-" + from) : null;
            if (acct == null || json == null || acct.ContainsKey("movedTo")) return;
            WriteSave(json);
            acct["movedTo"] = user.uid;
            Set(ACCOUNTS, Json.Write(db));
            moved = true;
        }

        // The first account on a phone takes over the agent from before
        // accounts (the first Unity version kept one save without accounts).
        static void AdoptLegacySave()
        {
            if (Get(LEGACY_TAKEN) != null || LoadSave() != null) return;
            string old = Get(LEGACY_SAVE);
            if (old == null) return;
            WriteSave(old);
            Set(LEGACY_TAKEN, user.uid);
            adopted = true;
        }

        public static bool TakeMoved() { bool m = moved; moved = false; return m; }
        public static bool TakeAdopted() { bool a = adopted; adopted = false; return a; }

        /* ------------------ On this device ------------------ */

        static string Hash(string password, string salt)
        {
            using (var kdf = new Rfc2898DeriveBytes(Encoding.UTF8.GetBytes(password), Encoding.UTF8.GetBytes(salt), 150000, HashAlgorithmName.SHA256))
                return string.Concat(kdf.GetBytes(32).Select((b) => b.ToString("x2")));
        }

        static Dictionary<string, object> LocalAccounts()
        {
            var db = ReadObj(ACCOUNTS) ?? new Dictionary<string, object>();
            if (!(db.TryGetValue("users", out var u) && u is Dictionary<string, object>)) db["users"] = new Dictionary<string, object>();
            return db;
        }
        static Dictionary<string, object> Users(Dictionary<string, object> db) => (Dictionary<string, object>)db["users"];

        static async Task<User> LocalSignUp(string name, string email, string password)
        {
            var db = LocalAccounts();
            string em = (email ?? "").Trim().ToLowerInvariant(), nm = name.Trim();
            foreach (var u in Users(db).Values.OfType<Dictionary<string, object>>())
            {
                if (Json.Str(u, "email") is string e && e != "" && e == em) Fail("There is already an account with that email on this phone. Log in instead.");
                if ((Json.Str(u, "name") ?? "").ToLowerInvariant() == nm.ToLowerInvariant()) Fail("That codename is taken on this phone.");
            }
            string uid = "L" + Rng.Base36(Rng.NowMs()) + Rng.Base36((long)(Rng.Next() * 2176782336)).PadLeft(6, '0');
            var salt = new byte[16];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(salt);
            string saltHex = string.Concat(salt.Select((b) => b.ToString("x2")));
            // Hashing takes a moment, so it runs off the main thread.
            string hash = await Task.Run(() => Hash(password, saltHex));
            db = LocalAccounts();
            Users(db)[uid] = new Dictionary<string, object> { { "name", nm }, { "email", em }, { "salt", saltHex }, { "hash", hash }, { "created", (double)Rng.NowMs() } };
            Set(ACCOUNTS, Json.Write(db));
            return Start(new User { uid = uid, name = nm, email = em, mode = "local" });
        }

        static async Task<User> LocalLogIn(string email, string password)
        {
            var db = LocalAccounts();
            string id = (email ?? "").Trim().ToLowerInvariant();
            var entry = Users(db).FirstOrDefault((kv) => kv.Value is Dictionary<string, object> u && (Json.Str(u, "email") == id || (Json.Str(u, "name") ?? "").ToLowerInvariant() == id));
            if (entry.Key == null) Fail("No account with that email or codename on this phone.");
            var acct = (Dictionary<string, object>)entry.Value;
            string salt = Json.Str(acct, "salt"), want = Json.Str(acct, "hash");
            string got = await Task.Run(() => Hash(password, salt));
            if (got != want) Fail("Wrong password.");
            return Start(new User { uid = entry.Key, name = Json.Str(acct, "name"), email = Json.Str(acct, "email"), mode = "local" });
        }

        /* ------------------ Online (Firebase) ------------------ */

        static readonly Dictionary<string, string> MESSAGES = new Dictionary<string, string>
        {
            { "EMAIL_EXISTS", "There is already an account with that email. Log in instead." },
            { "INVALID_LOGIN_CREDENTIALS", "Wrong email or password." },
            { "EMAIL_NOT_FOUND", "No account with that email." },
            { "INVALID_PASSWORD", "Wrong password." },
            { "INVALID_EMAIL", "Enter a valid email address." },
            { "USER_DISABLED", "This account has been turned off." },
            { "TOO_MANY_ATTEMPTS_TRY_LATER", "Too many tries. Wait a few minutes and try again." },
            { "OPERATION_NOT_ALLOWED", "Email sign-in is turned off for this game's Firebase project." },
        };

        static async Task<object> Post(string url, Dictionary<string, object> body)
        {
            var res = await Net.Request("POST", url, Json.Write(body));
            if (res.offline || res.status == 0) Fail("Can't reach the server. Check your internet connection.");
            object data = null;
            try { data = Json.Parse(res.text); } catch (Exception) { }
            if (res.status < 200 || res.status >= 300)
            {
                string msg = Json.Str(data, "error", "message") ?? "";
                string code = msg.Split(' ')[0].Split(':')[0];
                Fail(MESSAGES.TryGetValue(code, out var m) ? m : code.StartsWith("WEAK_PASSWORD") ? "Use a stronger password (at least 8 characters)." : $"Sign-in problem: {(msg != "" ? msg : res.status.ToString())}");
            }
            return data;
        }

        static Dictionary<string, object> Tokens(object d)
        {
            string exp = Json.Get(d, "expiresIn") as string ?? Json.Get(d, "expires_in") as string ?? "3600";
            double.TryParse(exp, out double e);
            return new Dictionary<string, object>
            {
                { "idToken", Json.Str(d, "idToken") ?? Json.Str(d, "id_token") },
                { "refreshToken", Json.Str(d, "refreshToken") ?? Json.Str(d, "refresh_token") },
                { "expires", (double)(Rng.NowMs() + (long)((e > 0 ? e : 3600) - 60) * 1000) },
            };
        }

        static async Task<User> CloudSignUp(string name, string email, string password)
        {
            var d = await Post($"{IDT}:signUp?key={Fb.apiKey}", new Dictionary<string, object> { { "email", email.Trim() }, { "password", password }, { "returnSecureToken", true } });
            await Post($"{IDT}:update?key={Fb.apiKey}", new Dictionary<string, object> { { "idToken", Json.Str(d, "idToken") }, { "displayName", name.Trim() }, { "returnSecureToken", false } });
            Start(new User { uid = Json.Str(d, "localId"), name = name.Trim(), email = Json.Str(d, "email"), mode = "cloud" }, Tokens(d));
            MoveLocalAgent();
            return user;
        }

        static async Task<User> CloudLogIn(string email, string password)
        {
            var d = await Post($"{IDT}:signInWithPassword?key={Fb.apiKey}", new Dictionary<string, object> { { "email", email.Trim() }, { "password", password }, { "returnSecureToken", true } });
            string dn = Json.Str(d, "displayName");
            return Start(new User { uid = Json.Str(d, "localId"), name = !string.IsNullOrEmpty(dn) ? dn : email.Split('@')[0], email = Json.Str(d, "email"), mode = "cloud" }, Tokens(d));
        }

        public class HttpError : Exception { public long status; public HttpError(string m, long s) : base(m) { status = s; } }

        // A fresh ID token (they last an hour).
        static async Task<string> IdToken()
        {
            if (session == null || Json.Str(session, "mode") != "cloud") return null;
            if (Json.Str(session, "idToken") is string tok && Json.Get(session, "expires") is double exp && exp > Rng.NowMs()) return tok;
            var res = await Net.Request("POST", $"https://securetoken.googleapis.com/v1/token?key={Fb.apiKey}",
                "grant_type=refresh_token&refresh_token=" + Uri.EscapeDataString(Json.Str(session, "refreshToken") ?? ""), "application/x-www-form-urlencoded");
            if (res.status < 200 || res.status >= 300) throw new HttpError("refresh failed", res.status < 500 ? 401 : res.status);
            foreach (var kv in Tokens(Json.Parse(res.text))) session[kv.Key] = kv.Value;
            Set(SESSION, Json.Write(session));
            return Json.Str(session, "idToken");
        }

        static async Task<object> Firestore(string method, string path, Dictionary<string, object> body = null)
        {
            string tok = await IdToken();
            var res = await Net.Request(method, Docs + path, body != null ? Json.Write(body) : null, "application/json", tok);
            if (res.status < 200 || res.status >= 300)
            {
                object b = null;
                try { b = Json.Parse(res.text); } catch (Exception) { }
                string msg = Json.Str(b, "error", "message") ?? "";
                // A missing document is fine; a missing database isn't.
                if (res.status == 404 && method == "GET" && !Regex.IsMatch(msg, "does not exist", RegexOptions.IgnoreCase)) return null;
                throw new HttpError(msg != "" ? msg : $"Firestore {res.status}", res.status);
            }
            return Json.Parse(res.text);
        }

        // What to tell you when the cloud refuses a save.
        static string SyncProblem(Exception e)
        {
            long st = e is HttpError h ? h.status : 0;
            if (Regex.IsMatch(e.Message, "has not been used|is disabled", RegexOptions.IgnoreCase)) return "Firestore isn't turned on for your Firebase project yet. Open Firestore Database in Firebase and tap Create database.";
            if (Regex.IsMatch(e.Message, "does not exist", RegexOptions.IgnoreCase)) return "Your Firebase project has no Firestore database yet. Open Firestore Database in Firebase and tap Create database.";
            if (st == 403) return "Your Firestore rules are blocking saves. Paste the Riftborn rules in Firebase → Firestore Database → Rules and tap Publish.";
            if (st == 401) return "Your online login has run out. Log out and log in again.";
            return "Couldn't reach your online save. It will try again.";
        }
        public static string SyncError = "";
        public static bool SyncNeedsFix;
        public static long LastSync;
        static void SyncFailed(Exception e)
        {
            SyncError = SyncProblem(e);
            long st = e is HttpError h ? h.status : 0;
            SyncNeedsFix = st == 401 || st == 403 || st == 404;
        }

        /* ------------------ Cloud save & leaderboard ------------------ */

        static string pending;
        static float pushIn = -1;

        // Online: send the save up (at most every 20 seconds).
        public static void QueueSave(string json)
        {
            if (user == null || user.mode != "cloud") return;
            pending = json;
            if (pushIn < 0) pushIn = 20;
        }

        // Call every frame.
        public static void Tick(float dt)
        {
            if (pushIn < 0) return;
            pushIn -= dt;
            if (pushIn <= 0) { pushIn = -1; _ = Flush(); }
        }

        public static async Task Flush()
        {
            pushIn = -1;
            if (pending == null || user == null || user.mode != "cloud") return;
            string json = pending;
            pending = null;
            try
            {
                await Firestore("PATCH", $"/saves/{user.uid}", new Dictionary<string, object> { { "fields", new Dictionary<string, object> {
                    { "data", new Dictionary<string, object> { { "stringValue", json } } },
                    { "updated", new Dictionary<string, object> { { "integerValue", Rng.NowMs().ToString() } } } } } });
                LastSync = Rng.NowMs();
                SyncError = "";
                SyncNeedsFix = false;
            }
            catch (Exception e)
            {
                pending ??= json;   // try again next time
                SyncFailed(e);
            }
        }

        // Online: the save stored with your account, if it's newer than this
        // phone's copy.
        public static async Task<string> PullSave(long localUpdated)
        {
            if (user == null || user.mode != "cloud") return null;
            try
            {
                var d = await Firestore("GET", $"/saves/{user.uid}");
                if (d == null || Json.Get(d, "fields") == null) return null;
                long.TryParse(Json.Str(d, "fields", "updated", "integerValue") ?? "0", out long updated);
                LastSync = Rng.NowMs();
                return updated > localUpdated ? Json.Str(d, "fields", "data", "stringValue") : null;
            }
            catch (Exception e)
            {
                SyncFailed(e);
                return null;
            }
        }

        // Your public line on the leaderboard.
        public static async void Publish(string name, string faction, int level, long xp)
        {
            if (user == null) return;
            if (user.mode == "local")
            {
                var db = LocalAccounts();
                if (Json.Get(db, "users", user.uid) is Dictionary<string, object> u)
                {
                    u["profile"] = new Dictionary<string, object> { { "name", name }, { "faction", faction }, { "level", (double)level }, { "xp", (double)xp } };
                    Set(ACCOUNTS, Json.Write(db));
                }
                return;
            }
            try
            {
                await Firestore("PATCH", $"/agents/{user.uid}", new Dictionary<string, object> { { "fields", new Dictionary<string, object> {
                    { "name", new Dictionary<string, object> { { "stringValue", name } } },
                    { "faction", new Dictionary<string, object> { { "stringValue", faction } } },
                    { "level", new Dictionary<string, object> { { "integerValue", level.ToString() } } },
                    { "xp", new Dictionary<string, object> { { "integerValue", xp.ToString() } } },
                    { "updated", new Dictionary<string, object> { { "integerValue", Rng.NowMs().ToString() } } } } } });
            }
            catch (Exception) { /* next time */ }
        }

        public static async Task<List<Board>> Leaderboard()
        {
            if (user == null) return new List<Board>();
            if (user.mode == "local")
            {
                return Users(LocalAccounts()).Where((kv) => Json.Get(kv.Value, "profile") != null).Select((kv) =>
                {
                    var p = Json.Get(kv.Value, "profile");
                    return new Board { uid = kv.Key, name = Json.Str(p, "name"), faction = Json.Str(p, "faction"), level = (int)(Json.Get(p, "level") as double? ?? 1), xp = (long)(Json.Get(p, "xp") as double? ?? 0) };
                }).OrderByDescending((b) => b.xp).Take(25).ToList();
            }
            string tok = await IdToken();
            var body = new Dictionary<string, object> { { "structuredQuery", new Dictionary<string, object> {
                { "from", new List<object> { new Dictionary<string, object> { { "collectionId", "agents" } } } },
                { "orderBy", new List<object> { new Dictionary<string, object> { { "field", new Dictionary<string, object> { { "fieldPath", "xp" } } }, { "direction", "DESCENDING" } } } },
                { "limit", 25.0 } } } };
            var res = await Net.Request("POST", Docs + ":runQuery", Json.Write(body), "application/json", tok);
            if (res.status < 200 || res.status >= 300) throw new HttpError("Leaderboard " + res.status, res.status);
            var rows = Json.Parse(res.text) as List<object> ?? new List<object>();
            var outp = new List<Board>();
            foreach (var r in rows)
            {
                var doc = Json.Get(r, "document");
                if (doc == null) continue;
                var f = Json.Get(doc, "fields");
                long.TryParse(Json.Str(f, "level", "integerValue") ?? "1", out long lv);
                long.TryParse(Json.Str(f, "xp", "integerValue") ?? "0", out long xp);
                outp.Add(new Board { uid = (Json.Str(doc, "name") ?? "").Split('/').Last(), name = Json.Str(f, "name", "stringValue"), faction = Json.Str(f, "faction", "stringValue"), level = (int)lv, xp = xp });
            }
            return outp;
        }

        /* ------------------ Online setup in the game ------------------ */

        // Pull the Project ID and Web API key out of what was pasted: the two
        // values on their own, or Firebase's whole firebaseConfig snippet.
        public static (string apiKey, string projectId) ParseSetup(string projectText, string keyText)
        {
            var boxes = new[] { (projectText ?? "").Trim(), (keyText ?? "").Trim() };
            string all = string.Join("\n", boxes);
            string apiKey = Regex.Match(all, "AIza[0-9A-Za-z_-]{35}").Value;
            if (apiKey == "") Fail("That doesn't look like a Web API key. It starts with AIza and is 39 characters long.");
            var m = Regex.Match(all, "projectId[\"']?\\s*[:=]\\s*[\"']([a-z0-9-]+)[\"']");
            string projectId = (m.Success ? m.Groups[1].Value : boxes.FirstOrDefault((t) => t != "" && !t.Contains("AIza")) ?? "").ToLowerInvariant();
            return (apiKey, projectId);
        }

        static readonly Regex PROJECT_ID = new Regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$");

        // Try the project out and say what's missing.
        public static async Task<(bool ok, List<SetupStep> steps, string apiKey, string projectId)> CheckSetup(string apiKey, string projectId)
        {
            var steps = new List<SetupStep>();
            void Say(bool ok, string text) => steps.Add(new SetupStep { ok = ok, text = text });
            async Task<(long status, string msg, object body)> Call(string url, string method = "GET", string body = null)
            {
                var r = await Net.Request(method, url, body);
                object b = null;
                try { b = Json.Parse(r.text); } catch (Exception) { }
                if (r.offline) throw new Exception("offline");
                return (r.status, Json.Str(b, "error", "message") ?? "", b);
            }
            projectId ??= "";
            // 1. The key, and email sign-in (with an account that doesn't exist).
            (long status, string msg, object body) a;
            try
            {
                a = await Call($"{IDT}:signInWithPassword?key={apiKey}", "POST", "{\"email\":\"setup-check@example.com\",\"password\":\"setup-check-only\",\"returnSecureToken\":true}");
            }
            catch (Exception)
            {
                return (false, new List<SetupStep> { new SetupStep { ok = false, text = "Can't reach Firebase. Check your internet connection and try again." } }, apiKey, projectId);
            }
            string m = a.msg;
            if (Regex.IsMatch(m, "API key not valid|API_KEY_INVALID", RegexOptions.IgnoreCase)) Say(false, "The Web API key isn't right. Copy it again from Project settings → General.");
            else if (Regex.IsMatch(m, "CONFIGURATION_NOT_FOUND|has not been used|is disabled", RegexOptions.IgnoreCase)) Say(false, "Authentication isn't set up yet. Open Authentication in Firebase and tap Get started.");
            else if (Regex.IsMatch(m, "OPERATION_NOT_ALLOWED|PASSWORD_LOGIN_DISABLED")) Say(false, "Email sign-in is off. In Authentication → Sign-in method, turn on Email/Password and save.");
            else if (Regex.IsMatch(m, "INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD|TOO_MANY_ATTEMPTS")) Say(true, "Email sign-in works.");
            else if (Regex.IsMatch(m, "referer|referrer|blocked", RegexOptions.IgnoreCase)) Say(false, "Your API key has restrictions that block Riftborn. Remove them in Google Cloud → APIs & Services → Credentials.");
            else Say(false, $"The sign-in check failed: {(m != "" ? m : "error " + a.status)}");

            // 2. Which project the key belongs to (its sign-in domains).
            try
            {
                var p = await Call($"https://identitytoolkit.googleapis.com/v1/projects?key={apiKey}");
                var ids = (Json.Get(p.body, "authorizedDomains") as List<object> ?? new List<object>()).OfType<string>()
                    .Select((d) => Regex.Match(d, @"^([a-z0-9-]+)\.(firebaseapp\.com|web\.app)$")).Where((x) => x.Success).Select((x) => x.Groups[1].Value).Distinct().ToList();
                if (ids.Count == 1 && ids[0] != projectId)
                {
                    if (projectId != "") Say(true, $"Your key belongs to the project {ids[0]}, so Riftborn will use that.");
                    projectId = ids[0];
                }
            }
            catch (Exception) { /* go with what was typed */ }
            if (!PROJECT_ID.IsMatch(projectId))
            {
                Say(false, projectId != "" ? "That doesn't look like a Project ID. Copy it from Project settings → General. It looks like riftborn-1a2b3."
                    : "Enter the Project ID too. It's in Project settings → General and looks like riftborn-1a2b3.");
                return (false, steps, apiKey, projectId);
            }

            // 3. The database and its rules. The Riftborn rules let anyone look
            // up setup/rules-v1 (nothing is stored there) and lock the rest.
            string bse = $"https://firestore.googleapis.com/v1/projects/{projectId}/databases/(default)/documents";
            try
            {
                var mark = await Call($"{bse}/setup/rules-v1");
                if (Regex.IsMatch(mark.msg, "has not been used|is disabled", RegexOptions.IgnoreCase)) Say(false, "Firestore isn't turned on. Open Firestore Database in Firebase and tap Create database.");
                else if (Regex.IsMatch(mark.msg, "does not exist", RegexOptions.IgnoreCase)) Say(false, "There's no Firestore database yet. Open Firestore Database in Firebase and tap Create database.");
                else if (mark.status == 403 && Regex.IsMatch(mark.msg, "insufficient permissions", RegexOptions.IgnoreCase)) Say(false, "The Riftborn rules aren't published yet. Tap Copy rules, paste them over everything in Firestore Database → Rules and tap Publish. Then wait a minute and check again.");
                else if (mark.status == 404 && Regex.IsMatch(mark.msg, "not found", RegexOptions.IgnoreCase))
                {
                    var probe = await Call($"{bse}/agents/setup-check");
                    if (probe.status == 403) Say(true, "The Firestore database is ready and locked with the Riftborn rules.");
                    else Say(false, "Your database is open to anyone (test mode). Paste the Riftborn rules over everything in Firestore Database → Rules and tap Publish.");
                }
                else Say(false, $"Couldn't find the project \"{projectId}\". Check the Project ID.");
            }
            catch (Exception)
            {
                Say(false, "Can't reach Firestore. Check your internet connection and try again.");
            }
            return (steps.All((x) => x.ok), steps, apiKey, projectId);
        }

        public const string Rules = @"// Firestore security rules for Riftborn's online accounts.
// Paste into Firebase console → Firestore Database → Rules, then Publish.
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Your save: only you can read or write it.
    match /saves/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    // Your leaderboard entry: any signed-in agent can read it, only you can write it.
    match /agents/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid
        && request.resource.data.name is string && request.resource.data.name.size() <= 16
        && request.resource.data.level is int && request.resource.data.xp is int;
    }
    // Nothing is stored here. The game's setup check reads it to see that
    // these rules are published.
    match /setup/rules-v1 {
      allow get: if true;
    }
  }
}
";

        // The phone agent that an online sign-up here would bring along.
        public static string Movable()
        {
            if (!Online) return null;
            string from = Get(LAST_LOCAL);
            var acct = from != null ? Json.Get(LocalAccounts(), "users", from) as Dictionary<string, object> : null;
            if (acct == null || acct.ContainsKey("movedTo")) return null;
            try { return Json.Str(Json.Parse(Get("riftborn-save-" + from) ?? ""), "agent", "name"); } catch (Exception) { return null; }
        }

        public static void SaveSetup(string apiKey, string projectId) => Set(ONLINE_SETUP, Json.Write(new Dictionary<string, object> { { "apiKey", apiKey }, { "projectId", projectId } }));
        public static void ClearSetup() => Remove(ONLINE_SETUP);

        /* ------------------ Public ------------------ */

        // The remembered login, if any.
        public static User Restore()
        {
            var s = ReadObj(SESSION);
            if (s == null || Json.Str(s, "uid") == null) return null;
            string mode = Json.Str(s, "mode");
            // Online accounts were turned off, or now use another Firebase project.
            if (mode == "cloud" && (!Online || (Json.Str(s, "projectId") is string pid && pid != Fb.projectId))) return null;
            session = s;
            user = new User { uid = Json.Str(s, "uid"), name = Json.Str(s, "name"), email = Json.Str(s, "email"), mode = mode };
            saveKey = "riftborn-save-" + user.uid;
            return user;
        }

        public static Task<User> SignUp(string name, string email, string password)
        {
            Validate(name, email, password, true);
            return Online ? CloudSignUp(name, email, password) : LocalSignUp(name, email, password);
        }

        public static Task<User> LogIn(string email, string password)
        {
            Validate(null, email, password, false);
            return Online ? CloudLogIn(email, password) : LocalLogIn(email, password);
        }

        public static async Task LogOut()
        {
            await Flush();
            Remove(SESSION);
            user = null;
            session = null;
            saveKey = null;
        }

        // Online: forget the cloud copy (when starting an agent over).
        public static async Task DropSave()
        {
            pending = null;
            if (user == null || user.mode != "cloud") return;
            try { await Firestore("DELETE", $"/saves/{user.uid}"); } catch (Exception) { /* ignore */ }
        }

        public static async Task ResetPassword(string email)
        {
            if (!Online) Fail("Accounts on this phone can't reset passwords. Make a new account instead.");
            if (!Regex.IsMatch((email ?? "").Trim(), @"^[^\s@]+@[^\s@]+\.[^\s@]+$")) Fail("Enter your email address first.");
            await Post($"{IDT}:sendOobCode?key={Fb.apiKey}", new Dictionary<string, object> { { "requestType", "PASSWORD_RESET" }, { "email", email.Trim() } });
        }
    }
}
