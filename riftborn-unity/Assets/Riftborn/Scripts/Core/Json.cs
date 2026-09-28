// Riftborn — a small JSON reader and writer. Unity's JsonUtility can't do
// dictionaries or nulls, and the save has to be exactly the web game's
// format (so one online account works in both), so this maps JSON to plain
// C# classes with public fields: numbers, strings, bools, arrays, List<T>,
// Dictionary<string, T> and nested classes. A class with a
// Dictionary<string, object> field named "_extra" keeps keys it doesn't
// know about and writes them back out.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Text;

namespace Riftborn
{
    public static class Json
    {
        /* ------------------ Text → tree ------------------ */

        // Objects become Dictionary<string, object>, arrays List<object>,
        // numbers double, plus string, bool and null.
        public static object Parse(string s)
        {
            int i = 0;
            var v = Value(s, ref i);
            Ws(s, ref i);
            if (i != s.Length) throw new FormatException("Trailing characters in JSON");
            return v;
        }

        public static Dictionary<string, object> Obj(string s) => Parse(s) as Dictionary<string, object>;

        static void Ws(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

        static object Value(string s, ref int i)
        {
            Ws(s, ref i);
            if (i >= s.Length) throw new FormatException("Unexpected end of JSON");
            char c = s[i];
            if (c == '{')
            {
                var d = new Dictionary<string, object>();
                i++; Ws(s, ref i);
                if (s[i] == '}') { i++; return d; }
                while (true)
                {
                    Ws(s, ref i);
                    string k = Str(s, ref i);
                    Ws(s, ref i);
                    if (s[i] != ':') throw new FormatException("Expected : in JSON");
                    i++;
                    d[k] = Value(s, ref i);
                    Ws(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == '}') { i++; return d; }
                    throw new FormatException("Expected , or } in JSON");
                }
            }
            if (c == '[')
            {
                var l = new List<object>();
                i++; Ws(s, ref i);
                if (s[i] == ']') { i++; return l; }
                while (true)
                {
                    l.Add(Value(s, ref i));
                    Ws(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == ']') { i++; return l; }
                    throw new FormatException("Expected , or ] in JSON");
                }
            }
            if (c == '"') return Str(s, ref i);
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
            if (s.Length - i >= 5 && string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
            int st = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            if (st == i) throw new FormatException($"Unexpected '{c}' in JSON");
            return double.Parse(s.Substring(st, i - st), NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        static string Str(string s, ref int i)
        {
            if (s[i] != '"') throw new FormatException("Expected a string in JSON");
            i++;
            var sb = new StringBuilder();
            while (true)
            {
                char c = s[i++];
                if (c == '"') return sb.ToString();
                if (c != '\\') { sb.Append(c); continue; }
                char e = s[i++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'u': sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                    default: sb.Append(e); break;
                }
            }
        }

        /* ------------------ Tree → text ------------------ */

        public static string Write(object v)
        {
            var sb = new StringBuilder();
            Emit(sb, v);
            return sb.ToString();
        }

        static void Emit(StringBuilder sb, object v)
        {
            switch (v)
            {
                case null: sb.Append("null"); return;
                case string s: Quote(sb, s); return;
                case bool b: sb.Append(b ? "true" : "false"); return;
                case double d: Num(sb, d); return;
                case float f: Num(sb, f); return;
                case int n: sb.Append(n.ToString(CultureInfo.InvariantCulture)); return;
                case long n: sb.Append(n.ToString(CultureInfo.InvariantCulture)); return;
                case IDictionary dict:
                    {
                        sb.Append('{');
                        bool first = true;
                        foreach (DictionaryEntry kv in dict)
                        {
                            if (!first) sb.Append(',');
                            first = false;
                            Quote(sb, (string)kv.Key);
                            sb.Append(':');
                            Emit(sb, kv.Value);
                        }
                        sb.Append('}');
                        return;
                    }
                case IEnumerable list:
                    {
                        sb.Append('[');
                        bool first = true;
                        foreach (var x in list) { if (!first) sb.Append(','); first = false; Emit(sb, x); }
                        sb.Append(']');
                        return;
                    }
                default: Emit(sb, From(v)); return;
            }
        }

        static void Num(StringBuilder sb, double d)
        {
            if (double.IsNaN(d) || double.IsInfinity(d)) { sb.Append("null"); return; }
            if (Math.Abs(d) < 1e15 && d == Math.Floor(d)) sb.Append(((long)d).ToString(CultureInfo.InvariantCulture));
            else sb.Append(d.ToString("R", CultureInfo.InvariantCulture));
        }

        static void Quote(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        /* ------------------ Classes ↔ tree ------------------ */

        const BindingFlags F = BindingFlags.Public | BindingFlags.Instance;

        static IEnumerable<FieldInfo> Fields(Type t)
        {
            foreach (var f in t.GetFields(F))
                if (!f.IsNotSerialized && f.Name != "_extra") yield return f;
        }

        // A class instance (or list, dictionary, number…) as a JSON tree.
        public static object From(object v)
        {
            if (v == null || v is string || v is bool || v is double || v is float || v is int || v is long) return v;
            var t = v.GetType();
            if (t.IsEnum) return v.ToString();
            if (v is IDictionary dict)
            {
                var d = new Dictionary<string, object>();
                foreach (DictionaryEntry kv in dict) d[(string)kv.Key] = From(kv.Value);
                return d;
            }
            if (v is IEnumerable list)
            {
                var l = new List<object>();
                foreach (var x in list) l.Add(From(x));
                return l;
            }
            var o = new Dictionary<string, object>();
            var extra = t.GetField("_extra", F);
            if (extra != null && extra.GetValue(v) is Dictionary<string, object> ex)
                foreach (var kv in ex) o[kv.Key] = kv.Value;
            // Null fields are left out, as the web game would read them anyway.
            foreach (var f in Fields(t)) { var fv = f.GetValue(v); if (fv != null) o[f.Name] = From(fv); }
            return o;
        }

        public static T To<T>(object tree) => (T)To(tree, typeof(T));

        public static object To(object tree, Type t)
        {
            var under = Nullable.GetUnderlyingType(t);
            if (under != null) return tree == null ? null : To(tree, under);
            if (tree == null) return t.IsValueType ? Activator.CreateInstance(t) : null;
            if (t == typeof(object)) return tree;
            if (t == typeof(string)) return tree is string s ? s : Convert.ToString(tree, CultureInfo.InvariantCulture);
            if (t == typeof(bool)) return tree is bool b ? b : tree is double d0 && d0 != 0;
            if (t == typeof(int)) return tree is double d1 ? (int)Math.Round(d1) : tree is bool b1 ? (b1 ? 1 : 0) : 0;
            if (t == typeof(long)) return tree is double d2 ? (long)Math.Round(d2) : 0L;
            if (t == typeof(double)) return tree is double d3 ? d3 : 0.0;
            if (t == typeof(float)) return tree is double d4 ? (float)d4 : 0f;
            if (t.IsEnum) return tree is string es && Enum.IsDefined(t, es) ? Enum.Parse(t, es) : Activator.CreateInstance(t);
            if (t.IsArray)
            {
                var et = t.GetElementType();
                var src = tree as List<object> ?? new List<object>();
                var arr = Array.CreateInstance(et, src.Count);
                for (int i = 0; i < src.Count; i++) arr.SetValue(To(src[i], et), i);
                return arr;
            }
            if (t.IsGenericType && t.GetGenericTypeDefinition() == typeof(List<>))
            {
                var et = t.GetGenericArguments()[0];
                var list = (IList)Activator.CreateInstance(t);
                if (tree is List<object> src) foreach (var x in src) list.Add(To(x, et));
                return list;
            }
            if (t.IsGenericType && t.GetGenericTypeDefinition() == typeof(Dictionary<,>))
            {
                var vt = t.GetGenericArguments()[1];
                var dict = (IDictionary)Activator.CreateInstance(t);
                if (tree is Dictionary<string, object> src) foreach (var kv in src) dict[kv.Key] = To(kv.Value, vt);
                return dict;
            }
            if (!(tree is Dictionary<string, object> obj)) return Activator.CreateInstance(t);
            var o = Activator.CreateInstance(t);
            var known = new HashSet<string>();
            foreach (var f in Fields(t))
            {
                known.Add(f.Name);
                // Missing keys keep the class's defaults.
                if (obj.TryGetValue(f.Name, out var val)) f.SetValue(o, To(val, f.FieldType));
            }
            var extra = t.GetField("_extra", F);
            if (extra != null)
            {
                var ex = new Dictionary<string, object>();
                foreach (var kv in obj) if (!known.Contains(kv.Key)) ex[kv.Key] = kv.Value;
                extra.SetValue(o, ex);
            }
            return o;
        }

        // Shortcuts for reading loose trees (server replies).
        public static object Get(object tree, params string[] path)
        {
            foreach (var p in path)
            {
                if (!(tree is Dictionary<string, object> d) || !d.TryGetValue(p, out tree)) return null;
            }
            return tree;
        }
        public static string Str(object tree, params string[] path) => Get(tree, path) as string;
    }
}
