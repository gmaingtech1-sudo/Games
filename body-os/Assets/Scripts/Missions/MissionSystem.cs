using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Runs flag-driven linear missions. Objectives complete when their flag is set; flags persist, so
    /// objectives that were already satisfied out of order complete immediately when they become active.
    /// </summary>
    public sealed class MissionSystem
    {
        readonly Game game;
        float objectiveTime;
        bool hintShown;

        public MissionSystem(Game game) { this.game = game; }

        StoryData S => game.Data.story;

        public MissionDefinition Active => string.IsNullOrEmpty(S.activeMission) ? null : game.Content.Mission(S.activeMission);
        public MissionState ActiveState => State(S.activeMission);

        public MissionState State(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            var st = S.missions.Find(m => m.id == id);
            if (st == null) { st = new MissionState { id = id }; S.missions.Add(st); }
            return st;
        }

        public bool IsComplete(string id) { var st = S.missions.Find(m => m.id == id); return st != null && st.completed; }

        public ObjectiveDefinition CurrentObjective
        {
            get
            {
                var m = Active; var st = ActiveState;
                if (m == null || st == null || st.completed || st.objective >= m.objectives.Length) return null;
                return m.objectives[st.objective];
            }
        }

        public bool ShowHint => hintShown;

        /// <summary>Called when a location loads: start the first available mission and catch up on flags.</summary>
        public void Begin()
        {
            if (Active == null || IsComplete(S.activeMission)) StartNextAvailable();
            CatchUp();
            GameEvents.RaiseMission();
        }

        void StartNextAvailable()
        {
            foreach (var m in game.Content.Missions)
            {
                if (IsComplete(m.id)) continue;
                if (!string.IsNullOrEmpty(m.startFlag) && !game.HasFlag(m.startFlag)) continue;
                bool isNew = S.activeMission != m.id;
                S.activeMission = m.id;
                State(m.id);
                objectiveTime = 0f; hintShown = false;
                if (isNew)
                {
                    GameEvents.Notify("NEW MISSION: " + m.title, NoticeType.Story);
                    game.Log("Mission started: " + m.title + ".");
                }
                return;
            }
            S.activeMission = "";
        }

        public void OnFlag(string flag)
        {
            var obj = CurrentObjective;
            if (obj != null && obj.flag == flag) { CompleteObjective(); return; }
            // A completed flag may also make a new mission available.
            if (Active == null) { StartNextAvailable(); CatchUp(); GameEvents.RaiseMission(); }
        }

        void CatchUp()
        {
            int guard = 32;
            while (guard-- > 0)
            {
                var obj = CurrentObjective;
                if (obj == null || !game.HasFlag(obj.flag)) break;
                CompleteObjective();
            }
        }

        void CompleteObjective()
        {
            var m = Active; var st = ActiveState;
            if (m == null || st == null) return;
            var obj = m.objectives[st.objective];
            st.objective++;
            objectiveTime = 0f; hintShown = false;
            AudioManager.I?.Play(Sfx.Objective);
            GameEvents.Notify("OBJECTIVE COMPLETE: " + obj.text, NoticeType.Success);
            game.Progression.AddXp(obj.xp, "objective");
            if (obj.pointReward > 0) { game.Progression.AddPoints(obj.pointReward); GameEvents.Notify("+" + obj.pointReward + " upgrade point", NoticeType.Reward); }

            if (st.objective >= m.objectives.Length) CompleteMission(m, st);
            else
            {
                GameEvents.RaiseMission();
                game.SaveGame(false);
                CatchUp();
            }
        }

        void CompleteMission(MissionDefinition m, MissionState st)
        {
            st.completed = true;
            AudioManager.I?.Play(Sfx.MissionComplete);
            Game.Vibrate();
            GameEvents.Notify("MISSION COMPLETE: " + m.title, NoticeType.Success);
            game.Log("Mission complete: " + m.title + ".");
            game.Progression.AddXp(m.rewardXp, "mission");
            if (m.rewardPoints > 0) game.Progression.AddPoints(m.rewardPoints);
            if (m.rewardNanites > 0) game.Inventory.Add("nanites", m.rewardNanites);
            UIRoot.I?.ShowMissionComplete(m);
            S.activeMission = "";
            if (!string.IsNullOrEmpty(m.completeFlag)) game.SetFlag(m.completeFlag);
            if (Active == null) StartNextAvailable();
            CatchUp();
            GameEvents.RaiseMission();
            game.SaveGame(false);
        }

        public void Tick(float dt)
        {
            if (CurrentObjective == null || hintShown) return;
            objectiveTime += dt;
            if (objectiveTime > 75f)
            {
                hintShown = true;
                var obj = CurrentObjective;
                if (!string.IsNullOrEmpty(obj.hint)) GameEvents.Notify("HINT: " + obj.hint, NoticeType.Info);
                GameEvents.RaiseMission();
            }
        }
    }
}
