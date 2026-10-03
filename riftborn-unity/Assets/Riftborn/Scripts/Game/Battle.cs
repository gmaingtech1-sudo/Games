// Riftborn — Rift battles. Your team of up to three fights the creatures
// guarding an enemy Rift, one on one, in turns: Strike (reliable), the
// element's signature move (strong, element advantage counts, cools down)
// or Guard (blocks most of a hit and heals a little). Faster creatures act
// first; guarding always goes first.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Riftborn
{
    public class Battle : MonoBehaviour
    {
        class F
        {
            public Creature c; public Species sp; public int side;
            public int hp, max, atk, spd, cdBlast, cdGuard; public bool guard;
            public BeastInstance b; public Vector3 home; public float k, lunge, hurt, faint, shield, mouth;
            public GameObject shieldGo; public bool dying;
        }
        List<F> me, foe;
        int mi, fi;
        bool busy; bool? outcome; bool swapOpen;
        string log = "", intro, winText;
        Action<bool, bool> done;

        GameObject arena; Camera cam; Transform stage; Light sun;
        class Shot { public GameObject go; public Vector3 from, to; public float t; public bool fx; }
        readonly List<Shot> shots = new List<Shot>();
        class Num { public Vector3 p; public string text; public Color c; public float life; }
        readonly List<Num> nums = new List<Num>();
        bool fogWas; Color fogCol; float fogStart, fogEnd, shadowWas;

        F Cur(int side) => side == 0 ? me[mi] : foe[fi];

        static F Fighter(Creature c, int side)
        {
            int hp = Mathf.RoundToInt(c.Hp * (c.hpx > 1 ? c.hpx : 1));
            return new F { c = c, sp = c.Species, side = side, hp = hp, max = hp, atk = c.Atk, spd = c.Spd };
        }

        public void Begin(List<Creature> mine, List<Creature> theirs, string introText, string win, Action<bool, bool> onDone)
        {
            me = mine.Select((c) => Fighter(c, 0)).ToList();
            foe = theirs.Select((c) => Fighter(c, 1)).ToList();
            mi = fi = 0; busy = false; outcome = null; swapOpen = false;
            intro = introText; winText = win; done = onDone;
            log = intro ?? $"{foe[0].sp.name} guards the Rift!";
            BuildArena();
            fogWas = RenderSettings.fog; fogCol = RenderSettings.fogColor; fogStart = RenderSettings.fogStartDistance; fogEnd = RenderSettings.fogEndDistance; shadowWas = QualitySettings.shadowDistance;
            RenderSettings.fog = true; RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.05f, 0.03f, 0.09f); RenderSettings.fogStartDistance = 14; RenderSettings.fogEndDistance = 45;
            QualitySettings.shadowDistance = 40;
            arena.SetActive(true);
            stage = new GameObject("BattleStage").transform;
            Show(Cur(0)); Show(Cur(1));
            Frame(true);
            Cur(1).mouth = 1;
            Sfx.Play("roar");
        }

        void BuildArena()
        {
            if (arena != null) return;
            arena = new GameObject("Arena");
            DontDestroyOnLoad(arena);
            var camGo = new GameObject("BattleCamera");
            camGo.transform.SetParent(arena.transform, false);
            cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.05f, 0.03f, 0.09f);
            cam.fieldOfView = 45; cam.nearClipPlane = 0.1f; cam.farClipPlane = 120;
            cam.cullingMask = ~(1 << Preview.LAYER);
            sun = new GameObject("Light").AddComponent<Light>();
            sun.transform.SetParent(arena.transform, false);
            sun.type = LightType.Directional; sun.shadows = LightShadows.Soft; sun.intensity = 1.15f;
            sun.color = new Color(1, 0.93f, 0.85f);
            sun.transform.rotation = Quaternion.Euler(48, -25, 0);
            sun.cullingMask = ~(1 << Preview.LAYER);
            var rim = new GameObject("Rim").AddComponent<Light>();
            rim.transform.SetParent(arena.transform, false);
            rim.type = LightType.Directional; rim.intensity = 0.6f; rim.color = new Color(0.6f, 0.4f, 1f);
            rim.transform.rotation = Quaternion.Euler(20, 160, 0);
            rim.cullingMask = ~(1 << Preview.LAYER);
            // Cracked stone floor with a glowing rune circle.
            var stoneTex = Tex.Make(256, 256, (x, y) =>
            {
                float n = Tex.Fbm(x / 20f, y / 20f, 21, 13), c = Tex.Fbm(x / 6f, y / 6f, 22, 43);
                float v = 0.2f + n * 0.25f + c * 0.08f;
                return new Color(v * 0.95f, v * 0.92f, v * 1.05f);
            });
            var m = Mats.Solid(Color.white, 0.2f);
            m.mainTexture = stoneTex; m.mainTextureScale = new Vector2(8, 8);
            var floor = Props.Mesh("floor", Props.Quad, m, arena.transform, false);
            floor.GetComponent<Renderer>().receiveShadows = true;
            floor.transform.localRotation = Quaternion.Euler(90, 0, 0);
            floor.transform.localScale = Vector3.one * 80;
            var rune = Props.Ring(new Color(0.55f, 0.35f, 1f), 5.5f, arena.transform);
            rune.transform.localPosition = new Vector3(0, 0.02f, 0);
            for (int i = 0; i < 14; i++)
            {
                float a = i / 14f * Mathf.PI * 2;
                var rock = Props.Rock(i % 6, arena.transform);
                rock.transform.localPosition = new Vector3(Mathf.Cos(a) * 9, 0, Mathf.Sin(a) * 9 + 3);
                rock.transform.localScale = Vector3.one * (0.9f + (i * 37 % 10) / 8f);
                rock.transform.localRotation = Quaternion.Euler(0, i * 47, 0);
            }
            var tear = Props.Glow(new Color(0.6f, 0.3f, 1f), 9, arena.transform);
            tear.transform.localPosition = new Vector3(0, 4, 12);
            // An imported portal stands behind the fighters.
            var pp = AssetLinks.Portal("arena");
            if (pp != null)
            {
                var holder = new GameObject("portal").transform;
                holder.SetParent(arena.transform, false);
                holder.localPosition = new Vector3(0, 0, 12);
                holder.localRotation = Quaternion.Euler(0, 180, 0);
                if (Props.PortalModel(pp, holder, 9) != null) tear.transform.localScale = Vector3.one * 5;
            }
            arena.SetActive(false);
        }

        void Show(F f)
        {
            if (f.b != null) return;
            f.b = new BeastInstance(f.sp.id);
            f.b.root.transform.SetParent(stage, false);
            var bb = f.b.asset.bounds;
            float targetH = Mathf.Lerp(1.3f, 2.5f, Mathf.InverseLerp(0.5f, 6f, f.sp.size)) * (f.c.Boss ? 1.7f : 1);
            f.k = targetH / Mathf.Max(bb.size.y, bb.size.z * 0.55f);
            f.b.root.transform.localScale = Vector3.one * f.k;
            if (f.c.Boss)
            {
                var ring = Props.Ring(new Color(1, 0.23f, 0.36f), bb.size.z * 0.6f, f.b.root.transform);
                ring.transform.localPosition = new Vector3(0, 0.02f / f.k, 0);
                var aura = Props.Glow(new Color(1, 0.23f, 0.36f, 0.5f), bb.size.y * 2.2f, f.b.root.transform);
                aura.transform.localPosition = bb.center;
            }
            float half = bb.size.z * f.k * 0.5f;
            f.home = new Vector3(f.side == 0 ? -(0.9f + half) : 0.9f + half, 0, f.side == 0 ? -0.6f : 0.6f);
            f.b.root.transform.position = f.home;
            f.b.root.transform.rotation = Quaternion.Euler(0, f.side == 0 ? 90 : -90, 0) * Quaternion.Euler(0, f.side == 0 ? -12 : 12, 0);
            f.faint = 0;
        }

        void Hide(F f) { if (f.b != null) { f.b.Destroy(); f.b = null; } if (f.shieldGo) Destroy(f.shieldGo); }

        Vector3 ChestOf(F f) => f.b != null ? f.b.root.transform.position + Vector3.up * f.b.Height * 0.55f : Vector3.zero;

        /* ------------------ Turns ------------------ */

        string AiMove(F f, F target)
        {
            float adv = Species.Advantage(f.sp.el, target.sp.el);
            if (f.cdBlast == 0 && (adv >= 1 || UnityEngine.Random.value < 0.4f)) return "blast";
            if (f.cdGuard == 0 && f.hp < f.max * 0.45f && UnityEngine.Random.value < 0.5f) return "guard";
            return "strike";
        }

        public void Choose(string move)
        {
            if (busy || outcome != null) return;
            var m = Cur(0);
            if ((move == "blast" && m.cdBlast > 0) || (move == "guard" && m.cdGuard > 0)) return;
            StartCoroutine(Turn(move));
        }

        IEnumerator Turn(string move)
        {
            busy = true;
            F a = Cur(0), f = Cur(1);
            string theirs = AiMove(f, a);
            var order = new List<(F who, string mv, F target)> { (a, move, f), (f, theirs, a) };
            bool meFirst = move == "guard" || (theirs != "guard" && (a.spd > f.spd || (a.spd == f.spd && UnityEngine.Random.value < 0.5f)));
            if (!meFirst) order.Reverse();
            foreach (var (who, mv, target) in order)
            {
                if (who.hp <= 0 || target.hp <= 0) continue;
                yield return Act(who, mv, target);
            }
            EndTurn(a, f);
            yield return AfterFaints();
            if (outcome == null) busy = false;
        }

        void EndTurn(F a, F b)
        {
            foreach (var x in new[] { a, b }) { x.guard = false; x.cdBlast = Mathf.Max(0, x.cdBlast - 1); x.cdGuard = Mathf.Max(0, x.cdGuard - 1); }
        }

        IEnumerator Act(F who, string mv, F target)
        {
            var el = Species.Elements[who.sp.el];
            if (mv == "guard")
            {
                who.cdGuard = 3;
                who.guard = true;
                if (who.b != null) Fx.Play(AssetLinks.I?.guard, who.b.root.transform.position + Vector3.up * 0.05f, Mathf.Max(0.8f, who.b.Height * 0.8f), null, stage, 1.2f);
                who.shield = 1;
                int heal = Mathf.RoundToInt(who.max * 0.08f);
                who.hp = Mathf.Min(who.max, who.hp + heal);
                log = $"{who.sp.name} guards!";
                Sfx.Play("guard");
                yield return new WaitForSeconds(0.65f);
                yield break;
            }
            if (mv == "blast") who.cdBlast = 3;
            float adv = mv == "blast" ? Species.Advantage(who.sp.el, target.sp.el) : 1;
            bool crit = UnityEngine.Random.value < 0.1f;
            float dmg = who.atk * (mv == "blast" ? 1.75f : 1f) * adv * UnityEngine.Random.Range(0.9f, 1.1f) * (crit ? 1.5f : 1);
            if (target.guard) dmg *= 0.4f;
            int d = Mathf.Max(1, Mathf.RoundToInt(dmg));
            log = mv == "blast" ? $"{who.sp.name} used {el.move}!" : $"{who.sp.name} strikes!";
            who.lunge = 1; who.mouth = 1;
            who.b?.Act("attack");
            if (mv == "blast")
            {
                Sfx.Play("blast");
                // An imported projectile if there is one, else a glow.
                var proj = Fx.Play(Fx.ElementProjectile(who.sp.el), ChestOf(who), 1, Fx.HasOwnColour(who.sp.el) ? (Color?)null : el.color, stage, 0.6f);
                var go = proj ?? Props.Glow(el.color, 0.9f, stage);
                shots.Add(new Shot { go = go, from = ChestOf(who), to = ChestOf(target), fx = proj != null });
                yield return new WaitForSeconds(0.45f);
            }
            else
            {
                Sfx.Play("strike");
                yield return new WaitForSeconds(0.22f);
            }
            target.hp = Mathf.Max(0, target.hp - d);
            target.hurt = 1;
            var p = ChestOf(target);
            var L = AssetLinks.I;
            if (mv == "blast") Fx.Play(Fx.ElementHit(who.sp.el), p, target.b != null ? Mathf.Max(0.8f, target.b.Height * 0.7f) : 1, Fx.HasOwnColour(who.sp.el) ? (Color?)null : el.color, stage);
            else Fx.Play(L?.strikeHit, p, target.b != null ? Mathf.Max(0.6f, target.b.Height * 0.5f) : 1, null, stage);
            target.b?.Act("hit");
            nums.Add(new Num { p = p + Vector3.up * 0.6f, text = $"-{d}{(crit ? "!" : "")}", c = adv > 1 ? new Color(1, 0.88f, 0.3f) : Color.white, life = 1.1f });
            Sfx.Play("hit");
            if (adv > 1.3f) log = "Super effective!";
            else if (adv < 1) log = "Not very effective…";
            else if (target.guard) log = $"{target.sp.name} blocked most of it.";
            else if (crit) log = "Critical hit!";
            yield return new WaitForSeconds(0.65f);
        }

        IEnumerator AfterFaints()
        {
            if (Cur(1).hp <= 0)
            {
                var f = Cur(1);
                f.faint = 0.001f;
                f.dying = f.b != null && f.b.Act("die");
                log = $"{f.sp.name} fainted!";
                Sfx.Play("flee");
                yield return new WaitForSeconds(0.9f);
                int next = foe.FindIndex((x) => x.hp > 0);
                if (next < 0) { End(true); yield break; }
                Hide(f);
                fi = next; Show(Cur(1));
                log = $"{Cur(1).sp.name} steps up!";
                Cur(1).mouth = 1;
                Sfx.Play("roar");
                yield return new WaitForSeconds(0.5f);
            }
            if (Cur(0).hp <= 0)
            {
                var f = Cur(0);
                f.faint = 0.001f;
                f.dying = f.b != null && f.b.Act("die");
                log = $"{f.sp.name} fainted!";
                Sfx.Play("flee");
                yield return new WaitForSeconds(0.9f);
                int next = me.FindIndex((x) => x.hp > 0);
                if (next < 0) { End(false); yield break; }
                Hide(f);
                mi = next; Show(Cur(0));
                log = $"Go, {Cur(0).sp.name}!";
                yield return new WaitForSeconds(0.4f);
            }
        }

        IEnumerator Swap(int i)
        {
            busy = true;
            Hide(Cur(0));
            mi = i; Show(Cur(0));
            log = $"Go, {Cur(0).sp.name}!";
            yield return new WaitForSeconds(0.5f);
            var f = Cur(1);
            yield return Act(f, AiMove(f, Cur(0)), Cur(0));
            EndTurn(Cur(0), f);
            yield return AfterFaints();
            if (outcome == null) busy = false;
        }

        void End(bool win)
        {
            outcome = win;
            busy = true;
            Sfx.Play(win ? "win" : "flee");
            log = win ? (winText ?? "The guardians are down.") : "Your team was beaten. They'll be back to full strength next time.";
        }

        void Finish(bool won, bool fled = false)
        {
            StopAllCoroutines();
            foreach (var f in me.Concat(foe)) Hide(f);
            foreach (var s in shots) Destroy(s.go);
            shots.Clear(); nums.Clear();
            if (stage) Destroy(stage.gameObject);
            arena.SetActive(false);
            RenderSettings.fog = fogWas; RenderSettings.fogColor = fogCol; RenderSettings.fogStartDistance = fogStart; RenderSettings.fogEndDistance = fogEnd;
            QualitySettings.shadowDistance = shadowWas;
            done?.Invoke(won, fled);
        }

        /* ------------------ Frame ------------------ */

        void Frame(bool snap)
        {
            if (me == null) return;
            float span = Mathf.Abs(Cur(1).home.x - Cur(0).home.x);
            float h = Mathf.Max(Cur(0).b != null ? Cur(0).b.Height : 1, Cur(1).b != null ? Cur(1).b.Height : 1);
            float aspect = Mathf.Max(0.5f, cam.aspect);
            float dist = Mathf.Max(span * 1.25f / aspect + 2.5f, h * 2.4f, 5.5f);
            var look = new Vector3((Cur(0).home.x + Cur(1).home.x) / 2, h * 0.45f, 0);
            var want = look + new Vector3(0, dist * 0.3f, -dist);
            cam.transform.position = snap ? want : Vector3.Lerp(cam.transform.position, want, Time.deltaTime * 3);
            cam.transform.LookAt(look);
        }

        void Update()
        {
            if (stage == null || me == null) return;
            float dt = Time.deltaTime;
            foreach (var f in new[] { Cur(0), Cur(1) })
            {
                if (f.b == null) continue;
                var root = f.b.root.transform;
                float dir = f.side == 0 ? 1 : -1;
                f.lunge = Mathf.MoveTowards(f.lunge, 0, dt * 2.5f);
                f.hurt = Mathf.MoveTowards(f.hurt, 0, dt * 3);
                f.mouth = Mathf.MoveTowards(f.mouth, 0, dt * 1.2f);
                float off = Mathf.Sin(f.lunge * Mathf.PI) * 0.8f;
                var p = f.home + new Vector3(dir * off, 0, 0);
                if (f.faint > 0)
                {
                    f.faint = Mathf.Min(1, f.faint + dt * 1.5f);
                    // Models with a death animation play it; others sink away.
                    if (!f.dying)
                    {
                        p.y -= f.faint * f.b.Height * 0.5f;
                        root.localScale = Vector3.one * f.k * (1 - f.faint * 0.6f);
                    }
                }
                root.position = p;
                f.b.Update(dt, 0, Mathf.SmoothStep(0, 1, f.mouth), 0);
                f.b.SetTint(new Color(1, 0.25f, 0.2f), f.hurt);
                if (f.guard || f.shield > 0)
                {
                    if (f.shieldGo == null) f.shieldGo = Props.Glow(new Color(0.4f, 0.8f, 1f), 1, stage);
                    f.shieldGo.transform.position = ChestOf(f);
                    f.shieldGo.transform.localScale = Vector3.one * f.b.Height * 2.2f * (f.guard ? 1 : f.shield);
                    f.shield = Mathf.MoveTowards(f.shield, 0, dt);
                }
                else if (f.shieldGo) { Destroy(f.shieldGo); f.shieldGo = null; }
            }
            for (int i = shots.Count - 1; i >= 0; i--)
            {
                var s = shots[i];
                s.t += dt / 0.45f;
                s.go.transform.position = Vector3.Lerp(s.from, s.to, s.t) + Vector3.up * Mathf.Sin(s.t * Mathf.PI) * 0.8f;
                if (!s.fx) s.go.transform.localScale = Vector3.one * (0.6f + s.t * 1.4f);
                if (s.t >= 1) { Destroy(s.go); shots.RemoveAt(i); }
            }
            for (int i = nums.Count - 1; i >= 0; i--) { nums[i].life -= dt; nums[i].p += Vector3.up * dt * 0.6f; if (nums[i].life <= 0) nums.RemoveAt(i); }
            Frame(false);
        }

        /* ------------------ Interface ------------------ */

        void HpCard(Rect r, F f, bool showCount, List<F> side)
        {
            var el = Species.Elements[f.sp.el];
            UI.Panel(r, UI.Ink);
            UI.Label(new Rect(r.x + 12, r.y + 8, r.width - 24, 20), $"{(f.c.Boss ? UI.Col("APEX ", new Color(1, 0.23f, 0.36f)) : "")}{UI.Col(f.sp.name, Species.Rarities[f.sp.rar].color)}  <size={Mathf.RoundToInt(12 * UI.Scale)}>Lv {f.c.lvl} · {UI.Col(el.name, el.color)}</size>", UI.H2);
            float frac = f.hp / (float)f.max;
            UI.Bar(new Rect(r.x + 12, r.y + 34, r.width - 24, 8), frac, frac > 0.5f ? new Color(0.3f, 1, 0.5f) : frac > 0.2f ? new Color(1, 0.8f, 0.2f) : new Color(1, 0.3f, 0.3f));
            string dots = string.Join(" ", side.Select((x) => x.hp > 0 ? "●" : "○"));
            UI.Label(new Rect(r.x + 12, r.y + 46, r.width - 24, 16), $"{f.hp} / {f.max} HP   {dots}", UI.Small);
        }

        public void DrawGUI()
        {
            if (me == null) return;
            float W = UI.W, top = UI.Safe.y + 8, cw = Mathf.Min(260, W - 24);
            HpCard(new Rect(UI.Safe.xMax - 8 - cw, top, cw, 66), Cur(1), true, foe);
            float by = UI.Safe.yMax - 60;
            HpCard(new Rect(UI.Safe.x + 8, by - 196, cw, 66), Cur(0), true, me);

            foreach (var n in nums)
            {
                var s = cam.WorldToScreenPoint(n.p);
                if (s.z < 0) continue;
                var at = new Vector2(s.x / UI.Scale, (Screen.height - s.y) / UI.Scale);
                UI.Label(new Rect(at.x - 60, at.y - 16, 120, 32), UI.Col($"<b>{n.text}</b>", n.c), new GUIStyle(UI.Big) { alignment = TextAnchor.MiddleCenter });
            }

            float lw = Mathf.Min(W - 24, 380);
            var lr = new Rect((W - lw) / 2, by - 122, lw, 30);
            UI.Panel(lr, new Color(0, 0, 0, 0.55f));
            UI.Label(lr, log, UI.Mid);

            if (outcome != null)
            {
                var r = new Rect((W - lw) / 2, by - 80, lw, 132);
                UI.Panel(r, UI.Ink);
                UI.Label(new Rect(r.x + 16, r.y + 12, lw - 32, 30), outcome.Value ? "Victory!" : "Defeated", UI.Big);
                if (UI.Button(new Rect(r.x + 16, r.y + 64, lw - 32, 52), "Continue")) Finish(outcome.Value);
                return;
            }

            var m = Cur(0);
            var el = Species.Elements[m.sp.el];
            float gw = Mathf.Min(W - 16, 440), bw = (gw - 12) / 3, bx = (W - gw) / 2;
            bool ok = !busy;
            if (UI.Button(new Rect(bx, by - 82, bw, 62), "Strike\n<size=" + Mathf.RoundToInt(11 * UI.Scale) + ">reliable hit</size>", new Color(0.35f, 0.3f, 0.45f), ok)) Choose("strike");
            string adv = Species.Advantage(m.sp.el, Cur(1).sp.el) > 1.3f ? "super effective" : Species.Advantage(m.sp.el, Cur(1).sp.el) < 1 ? "weak vs this" : "strong";
            if (UI.Button(new Rect(bx + bw + 6, by - 82, bw, 62), $"{el.move}\n<size={Mathf.RoundToInt(11 * UI.Scale)}>{(m.cdBlast > 0 ? $"ready in {m.cdBlast}" : adv)}</size>", el.color * 0.7f, ok && m.cdBlast == 0)) Choose("blast");
            if (UI.Button(new Rect(bx + (bw + 6) * 2, by - 82, bw, 62), $"Guard\n<size={Mathf.RoundToInt(11 * UI.Scale)}>{(m.cdGuard > 0 ? $"ready in {m.cdGuard}" : "block + heal")}</size>", new Color(0.2f, 0.45f, 0.7f), ok && m.cdGuard == 0)) Choose("guard");
            bool canSwap = ok && me.Count(x => x.hp > 0) > 1;
            if (UI.Button(new Rect(bx, by - 12, (gw - 6) / 2, 48), "Swap", UI.Ink, canSwap)) swapOpen = true;
            if (UI.Button(new Rect(bx + (gw + 6) / 2, by - 12, (gw - 6) / 2, 48), "Run", UI.Ink, ok)) { outcome = false; Finish(false, true); return; }

            if (swapOpen)
            {
                float h = 60 + me.Count * 56 + 56;
                var r = new Rect((W - lw) / 2, (UI.H - h) / 2, lw, h);
                UI.Panel(r, UI.Ink);
                UI.Label(new Rect(r.x + 16, r.y + 14, lw - 32, 26), "Swap in (uses your turn)", UI.H2);
                float y = r.y + 50;
                for (int i = 0; i < me.Count; i++)
                {
                    var f = me[i];
                    if (UI.Button(new Rect(r.x + 16, y, lw - 32, 48), $"{f.sp.name}  Lv {f.c.lvl}  ·  {f.hp}/{f.max} HP", new Color(1, 1, 1, 0.1f), f.hp > 0 && i != mi))
                    { swapOpen = false; StartCoroutine(Swap(i)); }
                    y += 56;
                }
                if (UI.Button(new Rect(r.x + 16, y, lw - 32, 44), "Cancel", new Color(1, 1, 1, 0.14f))) swapOpen = false;
            }
        }
    }
}
