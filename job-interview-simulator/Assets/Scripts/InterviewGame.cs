using System.Collections.Generic;
using UnityEngine;

// JOB INTERVIEW SIMULATOR
// The room, Mr. Pemberton, the sounds and the UI are all built from code, so the
// game starts by itself in any scene: open the project and press Play.
public class InterviewGame : MonoBehaviour
{
    public enum Weapon { Fist, Pistol, Stapler, Coffee }
    enum State { Title, Playing, Ending }
    enum Phase { Asking, Choosing, Responding, Knocked, KO }

    static readonly string[] WeaponNames = { "FIST", "PISTOL", "STAPLER", "COFFEE" };
    static readonly Vector3 CamPos = new Vector3(0f, 1.3f, -0.25f);
    static readonly Vector3 CamLook = new Vector3(0f, 1.2f, 2.6f);
    static readonly Vector3 BossHome = new Vector3(0f, 0f, 2.55f);

    static readonly Color Wood = new Color(0.45f, 0.28f, 0.15f);
    static readonly Color White = new Color(0.95f, 0.95f, 0.95f);
    static readonly Color CoffeeBrown = new Color(0.36f, 0.2f, 0.1f);
    static readonly Color Metal = new Color(0.15f, 0.15f, 0.17f);
    static readonly Color SleeveGrey = new Color(0.3f, 0.3f, 0.34f);
    static readonly Color Panel = new Color(0.06f, 0.07f, 0.12f, 0.85f);
    static readonly Color Gold = new Color(1f, 0.82f, 0.2f);
    static readonly Color Good = new Color(0.35f, 0.95f, 0.45f);
    static readonly Color Bad = new Color(1f, 0.35f, 0.3f);

    static InterviewGame instance;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Boot()
    {
        if (instance != null) return;
        instance = new GameObject("Job Interview Simulator").AddComponent<InterviewGame>();
    }

    public Sfx Sfx { get; private set; }

    // World.
    Transform world, viewModel, clockHour, clockMinute;
    Camera cam;
    Interviewer boss;
    readonly Dictionary<Weapon, GameObject> models = new Dictionary<Weapon, GameObject>();
    Light muzzleLight;
    GameObject muzzleFlash;
    float muzzleTimer;
    readonly List<Rigidbody> props = new List<Rigidbody>();
    readonly List<Vector3> propStart = new List<Vector3>();
    readonly Queue<GameObject> holes = new Queue<GameObject>();

    // Game.
    State state = State.Title;
    Phase phase;
    Weapon weapon = Weapon.Fist;
    int qIndex;
    bool answered;
    int hire, composure, combo;
    float hireShown, composureShown;
    int punches, shots, staplers, coffees, headshots, violentAnswers, talkAnswers;
    string pendingReaction;
    float koTimer, afterLine;
    string endTitle, endText;
    Color endColor;
    int officeDamage;

    // Speech.
    string line;
    float shown;

    // Feel.
    float cooldown, lungeT = 99f, recoil, shake, hideModel;
    bool punchPending;
    float punchTimer;
    Vector3 punchDir, punchPoint;
    Rigidbody punchBody;
    Collider punchCollider;
    Vector2 mouse; // screen pixels, origin bottom-left

    // UI.
    class Popup { public string text; public Vector3 world; public bool inWorld; public Vector2 gui; public float t; public Color color; public bool big; }
    readonly List<Popup> popups = new List<Popup>();
    bool stylesReady;
    GUIStyle sTitle, sH2, sHud, sBody, sStats, sSmall, sSmallCenter, sBubble, sName, sButton, sBigButton, sPop, sTag, sSlot;
    float uiScale = 1f, W = 1920f;
    const float H = 1080f;

    int QuestionCount { get { return InterviewScript.Questions.Length; } }
    bool LineDone { get { return line == null || shown >= line.Length; } }

    void Awake()
    {
        Sfx = gameObject.AddComponent<Sfx>();
    }

    void Start()
    {
        foreach (var c in Camera.allCameras)
            if (c.gameObject != gameObject) Destroy(c.gameObject);
        BuildWorld();
        ResetStats();
    }

    // ------------------------------------------------------------------ world

    void BuildWorld()
    {
        world = new GameObject("World").transform;
        props.Clear();
        propStart.Clear();
        holes.Clear();
        popups.Clear();
        models.Clear();

        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.5f, 0.5f, 0.55f);

        // Camera (you, sat in the candidate's chair).
        var camGo = new GameObject("Camera");
        camGo.transform.SetParent(world, false);
        cam = camGo.AddComponent<Camera>();
        cam.fieldOfView = 62f;
        cam.nearClipPlane = 0.03f;
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = Color.black;
        camGo.AddComponent<AudioListener>();
        cam.transform.SetPositionAndRotation(CamPos, Quaternion.LookRotation(CamLook - CamPos));

        // Lights.
        var sun = new GameObject("Fill Light").AddComponent<Light>();
        sun.transform.SetParent(world, false);
        sun.type = LightType.Directional;
        sun.intensity = 0.55f;
        sun.shadows = LightShadows.None;
        sun.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

        var lamp = new GameObject("Ceiling Light").AddComponent<Light>();
        lamp.transform.SetParent(world, false);
        lamp.transform.position = new Vector3(0f, 2.75f, 1.0f);
        lamp.type = LightType.Point;
        lamp.range = 10f;
        lamp.intensity = 1.5f;
        lamp.color = new Color(1f, 0.96f, 0.88f);
        lamp.shadows = LightShadows.Soft;

        BuildRoom();
        BuildDesk();

        boss = Interviewer.Create(world, BossHome, Sfx);
        boss.Recovered = OnBossRecovered;

        BuildViewModels();
    }

    void BuildRoom()
    {
        var carpet = new Color(0.33f, 0.37f, 0.45f);
        var wall = new Color(0.86f, 0.82f, 0.72f);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(0f, -0.1f, 1f), new Vector3(9f, 0.2f, 9f), carpet);
        var ceiling = Shapes.Make(PrimitiveType.Cube, world, new Vector3(0f, 3.1f, 1f), new Vector3(9f, 0.2f, 9f), new Color(0.93f, 0.93f, 0.9f));
        ceiling.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(0f, 1.5f, 4.5f), new Vector3(9f, 3.2f, 0.2f), wall);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(0f, 1.5f, -2.6f), new Vector3(9f, 3.2f, 0.2f), wall);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(-3.6f, 1.5f, 1f), new Vector3(0.2f, 3.2f, 9f), wall);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(3.6f, 1.5f, 1f), new Vector3(0.2f, 3.2f, 9f), wall);
        // Skirting board.
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(0f, 0.06f, 4.39f), new Vector3(7.2f, 0.12f, 0.03f), White, false);

        // Ceiling light panel.
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(0f, 2.99f, 1.0f), new Vector3(1.2f, 0.03f, 0.6f), Color.white, false);

        // Window with a view of the sky.
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(-1.9f, 1.75f, 4.385f), new Vector3(2.0f, 1.3f, 0.03f), White, false);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(-1.9f, 1.75f, 4.37f), new Vector3(1.8f, 1.1f, 0.03f), new Color(0.55f, 0.78f, 0.97f), false);
        Shapes.Make(PrimitiveType.Sphere, world, new Vector3(-2.35f, 1.95f, 4.36f), new Vector3(0.4f, 0.18f, 0.01f), Color.white, false);
        Shapes.Make(PrimitiveType.Sphere, world, new Vector3(-2.15f, 2.0f, 4.358f), new Vector3(0.3f, 0.2f, 0.01f), Color.white, false);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(-1.9f, 1.75f, 4.35f), new Vector3(0.05f, 1.1f, 0.02f), White, false);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(-1.9f, 1.75f, 4.35f), new Vector3(1.8f, 0.05f, 0.02f), White, false);

        // Motivational poster (a mountain at sunset, obviously).
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(1.9f, 1.75f, 4.385f), new Vector3(0.9f, 1.15f, 0.03f), new Color(0.1f, 0.1f, 0.1f), false);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(1.9f, 1.82f, 4.37f), new Vector3(0.8f, 0.85f, 0.02f), new Color(1f, 0.55f, 0.25f), false);
        Shapes.Make(PrimitiveType.Sphere, world, new Vector3(1.9f, 1.95f, 4.36f), new Vector3(0.25f, 0.25f, 0.01f), new Color(1f, 0.9f, 0.4f), false);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(1.9f, 1.55f, 4.355f), new Vector3(0.45f, 0.45f, 0.01f), new Color(0.3f, 0.22f, 0.35f), false).Rot(0f, 0f, 45f);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(1.9f, 1.3f, 4.37f), new Vector3(0.8f, 0.2f, 0.021f), new Color(0.1f, 0.1f, 0.1f), false);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(1.9f, 1.3f, 4.355f), new Vector3(0.6f, 0.04f, 0.01f), Color.white, false);

        // A working wall clock.
        Shapes.Make(PrimitiveType.Cylinder, world, new Vector3(0f, 2.55f, 4.39f), new Vector3(0.46f, 0.01f, 0.46f), new Color(0.1f, 0.1f, 0.1f), false).Rot(90f, 0f, 0f);
        Shapes.Make(PrimitiveType.Cylinder, world, new Vector3(0f, 2.55f, 4.38f), new Vector3(0.42f, 0.01f, 0.42f), Color.white, false).Rot(90f, 0f, 0f);
        clockHour = Shapes.Empty("Hour Hand", world, new Vector3(0f, 2.55f, 4.365f));
        Shapes.Make(PrimitiveType.Cube, clockHour, new Vector3(0f, 0.05f, 0f), new Vector3(0.025f, 0.11f, 0.005f), Color.black, false);
        clockMinute = Shapes.Empty("Minute Hand", world, new Vector3(0f, 2.55f, 4.36f));
        Shapes.Make(PrimitiveType.Cube, clockMinute, new Vector3(0f, 0.08f, 0f), new Vector3(0.016f, 0.17f, 0.005f), Color.black, false);

        // Filing cabinet with an "employee of the month" trophy on it.
        var cabinetGrey = new Color(0.55f, 0.57f, 0.6f);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(2.9f, 0.65f, 3.9f), new Vector3(0.6f, 1.3f, 0.6f), cabinetGrey);
        for (int i = 0; i < 3; i++)
            Shapes.Make(PrimitiveType.Cube, world, new Vector3(2.9f, 0.25f + i * 0.4f, 3.595f), new Vector3(0.18f, 0.04f, 0.02f), Metal, false);
        var trophy = Shapes.Empty("Trophy", world, new Vector3(2.9f, 1.3f, 3.9f));
        Shapes.Make(PrimitiveType.Cube, trophy, new Vector3(0f, 0.04f, 0f), new Vector3(0.16f, 0.08f, 0.16f), Metal);
        Shapes.Make(PrimitiveType.Cylinder, trophy, new Vector3(0f, 0.16f, 0f), new Vector3(0.04f, 0.06f, 0.04f), Gold);
        Shapes.Make(PrimitiveType.Sphere, trophy, new Vector3(0f, 0.28f, 0f), new Vector3(0.14f, 0.12f, 0.14f), Gold);
        AddProp(trophy.gameObject, 1f);

        // Pot plant.
        var plant = Shapes.Empty("Plant", world, new Vector3(-2.9f, 0f, 3.9f));
        Shapes.Make(PrimitiveType.Cylinder, plant, new Vector3(0f, 0.22f, 0f), new Vector3(0.4f, 0.22f, 0.4f), new Color(0.7f, 0.35f, 0.2f));
        var leaf = new Color(0.2f, 0.6f, 0.25f);
        Shapes.Make(PrimitiveType.Sphere, plant, new Vector3(0f, 0.7f, 0f), new Vector3(0.6f, 0.6f, 0.6f), leaf);
        Shapes.Make(PrimitiveType.Sphere, plant, new Vector3(0.12f, 1.0f, 0.05f), new Vector3(0.45f, 0.45f, 0.45f), leaf, false);
        Shapes.Make(PrimitiveType.Sphere, plant, new Vector3(-0.1f, 1.15f, -0.05f), new Vector3(0.35f, 0.35f, 0.35f), leaf, false);
        AddProp(plant.gameObject, 5f);

        // Bin.
        var bin = Shapes.Make(PrimitiveType.Cylinder, world, new Vector3(1.5f, 0.2f, 2.3f), new Vector3(0.3f, 0.2f, 0.3f), new Color(0.4f, 0.42f, 0.45f));
        AddProp(bin, 1.5f);
    }

    void BuildDesk()
    {
        // The desk itself is solid; everything on it can be knocked about.
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(0f, 0.78f, 1.6f), new Vector3(2.4f, 0.08f, 1.0f), Wood);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(0f, 0.38f, 1.12f), new Vector3(2.4f, 0.72f, 0.05f), new Color(0.38f, 0.23f, 0.12f));
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(-1.17f, 0.37f, 1.6f), new Vector3(0.06f, 0.74f, 0.95f), Wood);
        Shapes.Make(PrimitiveType.Cube, world, new Vector3(1.17f, 0.37f, 1.6f), new Vector3(0.06f, 0.74f, 0.95f), Wood);
        const float top = 0.82f;

        // Monitor, facing him.
        var monitor = Shapes.Empty("Monitor", world, new Vector3(0.65f, top, 1.85f));
        Shapes.Make(PrimitiveType.Cube, monitor, new Vector3(0f, 0.01f, 0f), new Vector3(0.25f, 0.02f, 0.18f), Metal);
        Shapes.Make(PrimitiveType.Cube, monitor, new Vector3(0f, 0.14f, 0.03f), new Vector3(0.05f, 0.25f, 0.04f), Metal, false);
        Shapes.Make(PrimitiveType.Cube, monitor, new Vector3(0f, 0.4f, 0f), new Vector3(0.55f, 0.34f, 0.04f), new Color(0.2f, 0.2f, 0.22f));
        Shapes.Make(PrimitiveType.Cube, monitor, new Vector3(0f, 0.4f, 0.021f), new Vector3(0.5f, 0.29f, 0.005f), new Color(0.3f, 0.55f, 0.95f), false);
        AddProp(monitor.gameObject, 4f);

        AddProp(Shapes.Make(PrimitiveType.Cube, world, new Vector3(0.5f, top + 0.013f, 2.0f), new Vector3(0.45f, 0.025f, 0.14f), new Color(0.25f, 0.25f, 0.27f)), 1f);
        AddProp(Shapes.Make(PrimitiveType.Cube, world, new Vector3(-0.45f, top + 0.03f, 1.65f), new Vector3(0.32f, 0.06f, 0.42f), Color.white).Rot(0f, 12f, 0f), 1f);
        // Your CV.
        AddProp(Shapes.Make(PrimitiveType.Cube, world, new Vector3(-0.3f, top + 0.004f, 1.28f), new Vector3(0.21f, 0.008f, 0.3f), Color.white).Rot(0f, -8f, 0f), 0.1f);

        // His coffee mug.
        var mug = Shapes.Make(PrimitiveType.Cylinder, world, new Vector3(-0.85f, top + 0.05f, 1.75f), new Vector3(0.08f, 0.05f, 0.08f), new Color(0.9f, 0.3f, 0.3f));
        Shapes.Make(PrimitiveType.Cylinder, mug.transform, new Vector3(0f, 0.96f, 0f), new Vector3(0.85f, 0.05f, 0.85f), CoffeeBrown, false);
        AddProp(mug, 0.3f);

        // Pen pot.
        var pens = Shapes.Make(PrimitiveType.Cylinder, world, new Vector3(-0.7f, top + 0.06f, 1.97f), new Vector3(0.07f, 0.06f, 0.07f), Metal);
        Shapes.Make(PrimitiveType.Cube, pens.transform, new Vector3(0.15f, 1.2f, 0f), new Vector3(0.1f, 1.6f, 0.1f), new Color(0.2f, 0.3f, 0.9f), false).Rot(0f, 0f, 10f);
        Shapes.Make(PrimitiveType.Cube, pens.transform, new Vector3(-0.15f, 1.2f, 0.1f), new Vector3(0.1f, 1.6f, 0.1f), new Color(0.9f, 0.2f, 0.2f), false).Rot(0f, 0f, -12f);
        AddProp(pens, 0.3f);

        // Name plate.
        var plate = Shapes.Make(PrimitiveType.Cube, world, new Vector3(0.05f, top + 0.045f, 1.3f), new Vector3(0.5f, 0.09f, 0.06f), new Color(0.25f, 0.15f, 0.08f));
        Shapes.Make(PrimitiveType.Cube, plate.transform, new Vector3(0f, 0f, -0.52f), new Vector3(0.9f, 0.6f, 0.05f), Gold, false);
        AddProp(plate, 0.5f);

        // A rubber duck, for morale.
        var duck = Shapes.Empty("Rubber Duck", world, new Vector3(0.95f, top + 0.045f, 1.4f));
        var yellow = new Color(1f, 0.85f, 0.1f);
        Shapes.Make(PrimitiveType.Sphere, duck, Vector3.zero, new Vector3(0.11f, 0.09f, 0.13f), yellow);
        Shapes.Make(PrimitiveType.Sphere, duck, new Vector3(0f, 0.07f, -0.04f), Vector3.one * 0.075f, yellow);
        Shapes.Make(PrimitiveType.Cube, duck, new Vector3(0f, 0.065f, -0.085f), new Vector3(0.04f, 0.015f, 0.03f), new Color(1f, 0.5f, 0.1f), false);
        Shapes.Make(PrimitiveType.Sphere, duck, new Vector3(0.02f, 0.085f, -0.07f), Vector3.one * 0.012f, Color.black, false);
        Shapes.Make(PrimitiveType.Sphere, duck, new Vector3(-0.02f, 0.085f, -0.07f), Vector3.one * 0.012f, Color.black, false);
        AddProp(duck.gameObject, 0.2f);
    }

    void AddProp(GameObject g, float mass)
    {
        var rb = g.AddComponent<Rigidbody>();
        rb.mass = mass;
        rb.interpolation = RigidbodyInterpolation.Interpolate;
        props.Add(rb);
        propStart.Add(g.transform.position);
    }

    void BuildViewModels()
    {
        viewModel = Shapes.Empty("Held Item", cam.transform, new Vector3(0.3f, -0.27f, 0.55f));
        var skin = Interviewer.Skin;

        var fist = Shapes.Empty("Fist", viewModel, Vector3.zero);
        Shapes.Make(PrimitiveType.Cube, fist, new Vector3(0f, 0f, 0.03f), new Vector3(0.09f, 0.09f, 0.1f), skin, false);
        Shapes.Make(PrimitiveType.Cube, fist, new Vector3(-0.045f, 0.02f, 0.04f), new Vector3(0.03f, 0.03f, 0.06f), skin, false);
        Shapes.Make(PrimitiveType.Cube, fist, new Vector3(0f, -0.01f, -0.17f), new Vector3(0.1f, 0.1f, 0.3f), SleeveGrey, false);
        models[Weapon.Fist] = fist.gameObject;

        var gun = Shapes.Empty("Pistol", viewModel, Vector3.zero);
        Shapes.Make(PrimitiveType.Cube, gun, new Vector3(0f, 0.03f, 0.06f), new Vector3(0.045f, 0.05f, 0.2f), Metal, false);
        Shapes.Make(PrimitiveType.Cube, gun, new Vector3(0f, 0f, 0.04f), new Vector3(0.04f, 0.025f, 0.16f), new Color(0.1f, 0.1f, 0.11f), false);
        Shapes.Make(PrimitiveType.Cube, gun, new Vector3(0f, -0.05f, -0.02f), new Vector3(0.04f, 0.11f, 0.055f), new Color(0.25f, 0.17f, 0.1f), false).Rot(15f, 0f, 0f);
        Shapes.Make(PrimitiveType.Cube, gun, new Vector3(0f, -0.06f, -0.04f), new Vector3(0.07f, 0.08f, 0.09f), skin, false);
        Shapes.Make(PrimitiveType.Cube, gun, new Vector3(0f, -0.08f, -0.18f), new Vector3(0.09f, 0.09f, 0.25f), SleeveGrey, false);
        muzzleFlash = Shapes.Make(PrimitiveType.Cube, gun, new Vector3(0f, 0.03f, 0.19f), new Vector3(0.09f, 0.09f, 0.02f), new Color(1f, 0.85f, 0.3f), false);
        muzzleFlash.SetActive(false);
        muzzleLight = new GameObject("Muzzle Light").AddComponent<Light>();
        muzzleLight.transform.SetParent(gun, false);
        muzzleLight.transform.localPosition = new Vector3(0f, 0.03f, 0.25f);
        muzzleLight.type = LightType.Point;
        muzzleLight.range = 5f;
        muzzleLight.intensity = 3f;
        muzzleLight.color = new Color(1f, 0.8f, 0.4f);
        muzzleLight.enabled = false;
        models[Weapon.Pistol] = gun.gameObject;

        var stapler = Shapes.Empty("Stapler", viewModel, Vector3.zero);
        Shapes.Make(PrimitiveType.Cube, stapler, new Vector3(0f, -0.02f, 0.05f), new Vector3(0.05f, 0.02f, 0.17f), new Color(0.1f, 0.1f, 0.1f), false);
        Shapes.Make(PrimitiveType.Cube, stapler, new Vector3(0f, 0.005f, 0.05f), new Vector3(0.045f, 0.025f, 0.16f), new Color(0.8f, 0.15f, 0.15f), false).Rot(-4f, 0f, 0f);
        Shapes.Make(PrimitiveType.Cube, stapler, new Vector3(0f, -0.055f, -0.01f), new Vector3(0.07f, 0.06f, 0.08f), skin, false);
        Shapes.Make(PrimitiveType.Cube, stapler, new Vector3(0f, -0.07f, -0.16f), new Vector3(0.09f, 0.09f, 0.25f), SleeveGrey, false);
        models[Weapon.Stapler] = stapler.gameObject;

        var cup = Shapes.Empty("Coffee", viewModel, Vector3.zero);
        Shapes.Make(PrimitiveType.Cylinder, cup, new Vector3(0f, 0f, 0.06f), new Vector3(0.08f, 0.045f, 0.08f), White, false);
        Shapes.Make(PrimitiveType.Cylinder, cup, new Vector3(0f, 0.045f, 0.06f), new Vector3(0.068f, 0.002f, 0.068f), CoffeeBrown, false);
        Shapes.Make(PrimitiveType.Cube, cup, new Vector3(0.05f, 0f, 0.06f), new Vector3(0.02f, 0.05f, 0.015f), White, false);
        Shapes.Make(PrimitiveType.Cube, cup, new Vector3(0.08f, -0.01f, 0.04f), new Vector3(0.06f, 0.07f, 0.07f), skin, false);
        Shapes.Make(PrimitiveType.Cube, cup, new Vector3(0.08f, -0.03f, -0.1f), new Vector3(0.09f, 0.09f, 0.25f), SleeveGrey, false);
        models[Weapon.Coffee] = cup.gameObject;

        Shapes.NoShadows(viewModel.gameObject);
        foreach (var m in models.Values) m.SetActive(false);
    }

    // ------------------------------------------------------------------ flow

    void ResetStats()
    {
        hire = 50; composure = 100;
        hireShown = hire; composureShown = composure;
        punches = shots = staplers = coffees = headshots = violentAnswers = talkAnswers = 0;
        combo = 0;
        weapon = Weapon.Fist;
        line = null;
    }

    void StartGame()
    {
        state = State.Playing;
        ResetStats();
        qIndex = -1;
        answered = true; // hitting him during the hello doesn't count as an answer
        Speak(InterviewScript.Intro);
        phase = Phase.Responding;
        Sfx.Play("click");
    }

    void Restart()
    {
        world.gameObject.SetActive(false);
        Destroy(world.gameObject);
        BuildWorld();
        StartGame();
    }

    void Speak(string text)
    {
        line = text;
        shown = 0f;
        afterLine = 0f;
    }

    void Advance()
    {
        qIndex++;
        afterLine = 0f;
        if (qIndex > QuestionCount) { EndGame(false); return; }
        if (qIndex == QuestionCount)
        {
            answered = true;
            Speak(violentAnswers > 0 ? InterviewScript.OutroScared : InterviewScript.OutroCalm);
            phase = Phase.Responding;
            return;
        }
        answered = false;
        var q = InterviewScript.Questions[qIndex];
        Speak(violentAnswers >= 2 && q.scared != null ? q.scared : q.text);
        phase = Phase.Asking;
    }

    void ChooseAnswer(Answer a)
    {
        if (phase != Phase.Choosing) return;
        answered = true;
        talkAnswers++;
        if (a.delta != 0) ChangeHire(a.delta, (a.delta > 0 ? "+" : "") + a.delta + " HIREABILITY");
        Sfx.Play("click", 0.5f);
        Speak(a.reply);
        phase = Phase.Responding;
    }

    void OnBossRecovered()
    {
        if (state != State.Playing) return;
        combo = 0;
        composure = Mathf.Min(100, composure + 6); // he pulls himself together. A bit.
        Speak(pendingReaction);
        phase = Phase.Responding;
    }

    void ChangeHire(int delta, string label)
    {
        hire = Mathf.Clamp(hire + delta, 0, 100);
        popups.Add(new Popup
        {
            text = label,
            gui = new Vector2(W - 280f, 215f + Random.Range(0f, 40f)),
            color = delta >= 0 ? Good : Bad,
        });
        Sfx.Play(delta >= 0 ? "ding" : "buzz", 0.35f);
    }

    void Pop(string text, Vector3 at, Color color)
    {
        popups.Add(new Popup { text = text, world = at, inWorld = true, color = color, big = true });
    }

    void EndGame(bool knockedOut)
    {
        state = State.Ending;
        line = null;
        boss.Talking = false;

        officeDamage = 0;
        for (int i = 0; i < props.Count; i++)
            if (props[i] == null || (props[i].position - propStart[i]).magnitude > 0.3f) officeDamage++;

        if (knockedOut)
        {
            endTitle = "PROMOTED!"; endColor = Gold;
            endText = "Mr. Pemberton is having a little lie down. You found the offer letter in his drawer, filled it in yourself and gave yourself his job. Welcome to management.";
        }
        else if (violentAnswers == 0)
        {
            if (hire >= 60) { endTitle = "HIRED!"; endColor = Good; endText = "Polite. Professional. Completely forgettable. You start on Monday. Bring a lanyard."; }
            else { endTitle = "WE'LL KEEP YOUR CV ON FILE"; endColor = Bad; endText = "...in the shredder. Thanks so much for coming in!"; }
        }
        else if (violentAnswers >= 5)
        {
            endTitle = "HIRED: HEAD OF SECURITY"; endColor = Gold;
            endText = "Nobody at SynergyCorp is brave enough to tell you no. Your new desk is next to the fire exit. Please stop bringing the pistol.";
        }
        else if (hire >= 55)
        {
            endTitle = "HIRED (ON PROBATION)"; endColor = Good;
            endText = "HR has put a note on your file. The note just says \"please don't\".";
        }
        else
        {
            endTitle = "REJECTED"; endColor = Bad;
            endText = "Mr. Pemberton asked us to tell you that he has never felt more alive. It's still a no, though.";
        }
        Sfx.Play("bell", 0.8f);
    }

    // ------------------------------------------------------------------ combat

    void Select(Weapon w)
    {
        if (w == weapon) return;
        weapon = w;
        Sfx.Play("click", 0.5f);
    }

    void Fire()
    {
        if (cooldown > 0f || phase == Phase.KO) return;
        Ray ray = cam.ScreenPointToRay(mouse);
        RaycastHit hit;
        switch (weapon)
        {
            case Weapon.Fist:
                cooldown = 0.45f;
                lungeT = 0f;
                punches++;
                Sfx.Play("whoosh", 0.5f, 1.3f);
                punchPending = true;
                punchTimer = 0.09f;
                punchDir = ray.direction;
                punchBody = null;
                // Very long arms. It's a cartoon.
                if (Physics.Raycast(ray, out hit, 6f))
                {
                    punchBody = hit.rigidbody;
                    punchCollider = hit.collider;
                    punchPoint = hit.point;
                }
                break;

            case Weapon.Pistol:
                cooldown = 0.28f;
                recoil = 1f;
                shake = Mathf.Max(shake, 0.12f);
                shots++;
                muzzleTimer = 0.05f;
                muzzleLight.enabled = true;
                muzzleFlash.SetActive(true);
                muzzleFlash.transform.localRotation = Quaternion.Euler(0f, 0f, Random.Range(0f, 90f));
                Sfx.Play("bang", 0.8f, Random.Range(0.95f, 1.08f));
                if (Physics.Raycast(ray, out hit, 50f))
                {
                    Interviewer who = hit.rigidbody != null ? hit.rigidbody.GetComponent<Interviewer>() : null;
                    if (who != null) HitBoss(Weapon.Pistol, ray.direction, hit.point, hit.collider == who.HeadCollider);
                    else
                    {
                        if (hit.rigidbody != null) hit.rigidbody.AddForceAtPosition(ray.direction * 5f, hit.point, ForceMode.VelocityChange);
                        BulletHole(hit);
                        Sfx.Play("clank", 0.25f, Random.Range(1.4f, 1.8f));
                    }
                }
                break;

            case Weapon.Stapler:
            case Weapon.Coffee:
                cooldown = 0.5f;
                hideModel = 0.4f;
                if (weapon == Weapon.Stapler) staplers++; else coffees++;
                Throw(weapon, ray.direction);
                break;
        }
    }

    void LandPunch()
    {
        if (punchBody == null) return;
        var who = punchBody.GetComponent<Interviewer>();
        if (who != null) { HitBoss(Weapon.Fist, punchDir, punchPoint, punchCollider == who.HeadCollider); return; }
        punchBody.AddForceAtPosition(punchDir * 4f, punchPoint, ForceMode.VelocityChange);
        Sfx.Play("punch", 0.5f, 1.2f);
    }

    void Throw(Weapon w, Vector3 dir)
    {
        GameObject g;
        if (w == Weapon.Stapler)
        {
            g = Shapes.Make(PrimitiveType.Cube, world, Vector3.zero, new Vector3(0.07f, 0.05f, 0.2f), new Color(0.1f, 0.1f, 0.1f));
            Shapes.Make(PrimitiveType.Cube, g.transform, new Vector3(0f, 0.55f, 0.02f), new Vector3(0.9f, 0.5f, 0.95f), new Color(0.8f, 0.15f, 0.15f), false);
        }
        else
        {
            g = Shapes.Make(PrimitiveType.Cylinder, world, Vector3.zero, new Vector3(0.09f, 0.055f, 0.09f), White);
            Shapes.Make(PrimitiveType.Cylinder, g.transform, new Vector3(0f, 0.95f, 0f), new Vector3(0.85f, 0.08f, 0.85f), CoffeeBrown, false);
        }
        var t = cam.transform;
        g.transform.position = t.position + dir * 0.5f + t.right * 0.15f - t.up * 0.1f;
        g.transform.rotation = Quaternion.LookRotation(dir);

        var rb = g.AddComponent<Rigidbody>();
        rb.mass = 0.5f;
        rb.maxAngularVelocity = 30f;
        rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
        rb.interpolation = RigidbodyInterpolation.Interpolate;
        rb.AddForce(dir * 13f + Vector3.up * 1.5f, ForceMode.VelocityChange);
        rb.AddTorque(new Vector3(Random.Range(8f, 14f), Random.Range(-4f, 4f), Random.Range(-4f, 4f)), ForceMode.VelocityChange);

        var p = g.AddComponent<Projectile>();
        p.game = this;
        p.weapon = w;
        p.dir = dir;
        Sfx.Play("whoosh", 0.6f, Random.Range(0.9f, 1.1f));
        Destroy(g, w == Weapon.Stapler ? 12f : 6f);
    }

    public void CoffeeSplash(Vector3 at, Interviewer who)
    {
        Sfx.Play("smash", 0.7f);
        Sfx.Play("splat", 0.8f);
        for (int i = 0; i < 14; i++)
        {
            var d = Shapes.Make(PrimitiveType.Cube, world, Vector3.zero, Vector3.one * Random.Range(0.025f, 0.055f), i < 9 ? CoffeeBrown : White);
            d.transform.position = at + Random.insideUnitSphere * 0.05f;
            var rb = d.AddComponent<Rigidbody>();
            rb.mass = 0.05f;
            rb.AddForce(Random.insideUnitSphere * 2.5f + Vector3.up * 2f, ForceMode.VelocityChange);
            Destroy(d, 2.5f);
        }
        if (who != null) who.AddStain();
    }

    void BulletHole(RaycastHit hit)
    {
        var h = Shapes.Make(PrimitiveType.Cube, null, Vector3.zero, new Vector3(0.045f, 0.045f, 0.01f), new Color(0.08f, 0.08f, 0.08f), false);
        h.transform.position = hit.point + hit.normal * 0.004f;
        h.transform.rotation = Quaternion.LookRotation(-hit.normal) * Quaternion.Euler(0f, 0f, Random.Range(0f, 90f));
        h.transform.SetParent(hit.rigidbody != null ? hit.rigidbody.transform : world, true);
        holes.Enqueue(h);
        if (holes.Count > 60)
        {
            var old = holes.Dequeue();
            if (old != null) Destroy(old);
        }
    }

    public void HitBoss(Weapon w, Vector3 dir, Vector3 point, bool head)
    {
        if (state != State.Playing || boss.KnockedOut) return;
        bool wasDown = boss.IsDown;

        Vector3 flat = new Vector3(dir.x, 0f, dir.z);
        if (flat.sqrMagnitude < 0.01f) flat = Vector3.forward;
        flat.Normalize();

        float speed, up, damage;
        string word;
        string[] lines;
        switch (w)
        {
            case Weapon.Fist: speed = 6f; up = 3f; damage = 16f; word = "POW!"; lines = InterviewScript.PunchLines; Sfx.Play("punch", 1f, Random.Range(0.9f, 1.1f)); break;
            case Weapon.Pistol: speed = 8f; up = 3.5f; damage = 22f; word = "BANG!"; lines = InterviewScript.ShootLines; Sfx.Play("punch", 0.6f, 1.4f); break;
            case Weapon.Stapler: speed = 4.5f; up = 2.5f; damage = 13f; word = "THWACK!"; lines = InterviewScript.StaplerLines; Sfx.Play("punch", 0.8f, 1.3f); break;
            default: speed = 3.5f; up = 2f; damage = 11f; word = "SPLOSH!"; lines = InterviewScript.CoffeeLines; break;
        }
        if (head) { speed *= 1.25f; damage *= 1.6f; headshots++; }

        boss.Hit(flat * speed + Vector3.up * up, head);
        composure -= Mathf.RoundToInt(damage);
        shake = Mathf.Max(shake, 0.25f);

        Pop(word, point, Color.white);
        if (head) Pop("HEADSHOT!", point + Vector3.up * 0.3f, Gold);
        if (wasDown)
        {
            combo++;
            Pop("COMBO x" + (combo + 1) + "!", point + Vector3.up * 0.6f, new Color(1f, 0.55f, 0.15f));
        }

        var tag = Pick(InterviewScript.HitTags);
        ChangeHire(tag.delta, tag.text);

        if (!answered) { answered = true; violentAnswers++; }
        pendingReaction = wasDown ? Pick(InterviewScript.ComboLines) : Pick(lines);
        line = null;

        if (composure <= 0)
        {
            composure = 0;
            boss.KnockOut();
            phase = Phase.KO;
            koTimer = 0f;
            Pop("K.O.!", point + Vector3.up * 0.9f, Bad);
            Sfx.Play("bell", 1f);
        }
        else phase = Phase.Knocked;
    }

    static T Pick<T>(T[] items) { return items[Random.Range(0, items.Length)]; }

    // ------------------------------------------------------------------ update

    void Update()
    {
        float dt = Time.deltaTime;
        Cursor.visible = state != State.Playing;

        cooldown -= dt;
        hideModel -= dt;
        lungeT += dt;
        recoil = Mathf.MoveTowards(recoil, 0f, dt * 6f);
        shake = Mathf.MoveTowards(shake, 0f, dt * 1.5f);
        if (muzzleTimer > 0f)
        {
            muzzleTimer -= dt;
            if (muzzleTimer <= 0f) { muzzleLight.enabled = false; muzzleFlash.SetActive(false); }
        }

        UpdateCamera();
        UpdateSpeech(dt);

        if (punchPending)
        {
            punchTimer -= dt;
            if (punchTimer <= 0f) { punchPending = false; LandPunch(); }
        }

        if (state == State.Playing) UpdatePhase(dt);

        for (int i = popups.Count - 1; i >= 0; i--)
        {
            popups[i].t += dt;
            if (popups[i].t > 1.4f) popups.RemoveAt(i);
        }

        hireShown = Mathf.Lerp(hireShown, hire, dt * 6f);
        composureShown = Mathf.Lerp(composureShown, composure, dt * 6f);

        var now = System.DateTime.Now;
        clockMinute.localRotation = Quaternion.Euler(0f, 0f, -(now.Minute + now.Second / 60f) * 6f);
        clockHour.localRotation = Quaternion.Euler(0f, 0f, -(now.Hour % 12 + now.Minute / 60f) * 30f);
    }

    void UpdateCamera()
    {
        Vector2 n;
        if (state == State.Playing)
            n = new Vector2(Mathf.Clamp(mouse.x / Mathf.Max(1, Screen.width) * 2f - 1f, -1f, 1f), Mathf.Clamp(mouse.y / Mathf.Max(1, Screen.height) * 2f - 1f, -1f, 1f));
        else
            n = new Vector2(Mathf.Sin(Time.time * 0.3f) * 0.4f, Mathf.Sin(Time.time * 0.21f) * 0.2f);

        Quaternion rot = Quaternion.LookRotation(CamLook - CamPos) * Quaternion.Euler(-n.y * 4f, n.x * 7f, 0f);
        float lunge = lungeT < 0.09f ? lungeT / 0.09f : Mathf.Max(0f, 1f - (lungeT - 0.09f) / 0.25f);
        Vector3 pos = CamPos + rot * Vector3.forward * lunge * 1.4f + Random.insideUnitSphere * shake * 0.08f;
        cam.transform.SetPositionAndRotation(pos, rot);

        bool show = state == State.Playing && hideModel <= 0f;
        foreach (var kv in models) kv.Value.SetActive(show && kv.Key == weapon);

        viewModel.localPosition = new Vector3(0.3f, -0.27f + Mathf.Sin(Time.time * 2f) * 0.005f, 0.55f)
                                  + Vector3.back * recoil * 0.08f + Vector3.forward * lunge * 0.25f;
        Vector3 target = cam.ScreenPointToRay(mouse).GetPoint(4f);
        Vector3 local = cam.transform.InverseTransformDirection((target - viewModel.position).normalized);
        viewModel.localRotation = Quaternion.LookRotation(local) * Quaternion.Euler(-recoil * 25f, 0f, 0f);
    }

    void UpdateSpeech(float dt)
    {
        if (line != null && shown < line.Length)
        {
            int before = (int)shown;
            shown = Mathf.Min(line.Length, shown + dt * 42f);
            int after = (int)shown;
            for (int i = before; i < after; i++)
            {
                if (i % 2 == 0 && char.IsLetter(line[i]))
                {
                    Sfx.Play("blip", 0.18f, Random.Range(0.85f, 1.25f));
                    break;
                }
            }
        }
        boss.Talking = state == State.Playing && line != null && shown < line.Length;
    }

    void UpdatePhase(float dt)
    {
        switch (phase)
        {
            case Phase.Asking:
                if (LineDone) phase = Phase.Choosing;
                break;
            case Phase.Responding:
                if (LineDone)
                {
                    afterLine += dt;
                    if (afterLine > 1.2f + (line != null ? line.Length : 0) * 0.012f) Advance();
                }
                break;
            case Phase.KO:
                koTimer += dt;
                if (koTimer > 3.5f) EndGame(true);
                break;
        }
    }

    // ------------------------------------------------------------------ UI

    void OnGUI()
    {
        Event e = Event.current;
        Vector2 raw = e.mousePosition; // read before changing GUI.matrix
        mouse = new Vector2(raw.x, Screen.height - raw.y);

        uiScale = Screen.height / H;
        W = Screen.width / uiScale;
        GUI.matrix = Matrix4x4.Scale(new Vector3(uiScale, uiScale, 1f));
        Vector2 m = raw / uiScale;

        EnsureStyles();
        HandleKeys(e);

        switch (state)
        {
            case State.Title:
                DrawTitle();
                break;
            case State.Playing:
                DrawHud();
                DrawBubble();
                DrawDialogue();
                DrawHotbar();
                // Any click that wasn't on a button uses your item.
                if (e.type == EventType.MouseDown && e.button == 0) { Fire(); e.Use(); }
                DrawPopups();
                DrawCrosshair(m);
                break;
            case State.Ending:
                DrawPopups();
                DrawEnding();
                break;
        }
    }

    void HandleKeys(Event e)
    {
        if (e.type == EventType.KeyDown)
        {
            KeyCode k = e.keyCode;
            if (state == State.Playing)
            {
                if (k == KeyCode.Alpha1 || k == KeyCode.Keypad1) Select(Weapon.Fist);
                else if (k == KeyCode.Alpha2 || k == KeyCode.Keypad2) Select(Weapon.Pistol);
                else if (k == KeyCode.Alpha3 || k == KeyCode.Keypad3) Select(Weapon.Stapler);
                else if (k == KeyCode.Alpha4 || k == KeyCode.Keypad4) Select(Weapon.Coffee);
                else if (k == KeyCode.Space && line != null) shown = line.Length;
            }
            else if (state == State.Title && (k == KeyCode.Return || k == KeyCode.KeypadEnter)) StartGame();
            else if (state == State.Ending && (k == KeyCode.R || k == KeyCode.Return || k == KeyCode.KeypadEnter)) Restart();
        }
        if (e.type == EventType.ScrollWheel && state == State.Playing)
        {
            Select((Weapon)(((int)weapon + (e.delta.y > 0f ? 1 : 3)) % 4));
            e.Use();
        }
    }

    void DrawTitle()
    {
        DrawRect(new Rect(0f, 0f, W, H), new Color(0.02f, 0.03f, 0.08f, 0.6f));
        ShadowLabel(new Rect(0f, 110f, W, 150f), "JOB INTERVIEW SIMULATOR", sTitle, Gold);
        ShadowLabel(new Rect(0f, 270f, W, 60f), "SynergyCorp is hiring! Mr. Pemberton from HR will see you now.", sH2, Color.white);

        Rect box = new Rect(W / 2f - 540f, 370f, 1080f, 310f);
        DrawRect(box, Panel);
        GUI.Label(new Rect(box.x + 30f, box.y + 24f, box.width - 60f, box.height - 48f),
            "Answer his questions like a normal, sensible person...\n...or don't.\n\n" +
            "MOUSE  aim        CLICK  use item        1-4 / SCROLL  switch item\n" +
            "1  Fist        2  Pistol        3  Stapler        4  Coffee\n" +
            "SPACE  skip his waffling",
            sBody);

        if (GUI.Button(new Rect(W / 2f - 250f, 730f, 500f, 110f), "START INTERVIEW", sBigButton)) StartGame();
        GUI.Label(new Rect(0f, H - 60f, W, 40f), "A silly cartoon game. Please don't do any of this at a real job interview.", sSmallCenter);
    }

    void DrawHud()
    {
        DrawRect(new Rect(20f, 20f, 620f, 116f), Panel);
        GUI.Label(new Rect(42f, 28f, 600f, 34f), "SYNERGYCORP  ·  INTERVIEW ROOM 3", sSmall);
        string q = qIndex < 0 ? "Introductions" : qIndex >= QuestionCount ? "Wrapping up" : "Question " + (qIndex + 1) + " of " + QuestionCount;
        GUI.Label(new Rect(42f, 62f, 600f, 60f), q, sHud);

        Rect right = new Rect(W - 540f, 20f, 520f, 170f);
        DrawRect(right, Panel);
        Meter(new Rect(right.x + 20f, right.y + 10f, 480f, 0f), "HIREABILITY  " + Mathf.RoundToInt(hireShown) + "%", hireShown / 100f, Good);
        float c = composureShown / 100f;
        Meter(new Rect(right.x + 20f, right.y + 88f, 480f, 0f), "MR. PEMBERTON'S COMPOSURE", c, Color.Lerp(Bad, new Color(1f, 0.75f, 0.2f), c));
    }

    void Meter(Rect r, string label, float v, Color color)
    {
        GUI.Label(new Rect(r.x, r.y, r.width, 34f), label, sSmall);
        DrawRect(new Rect(r.x, r.y + 38f, r.width, 24f), new Color(0f, 0f, 0f, 0.6f));
        DrawRect(new Rect(r.x + 3f, r.y + 41f, (r.width - 6f) * Mathf.Clamp01(v), 18f), color);
    }

    void DrawBubble()
    {
        string text = null;
        if (phase == Phase.KO) text = "zzz...";
        else if (line != null && phase != Phase.Knocked) text = line;
        if (text == null) return;

        Vector3 sp = cam.WorldToScreenPoint(boss.Head.position + Vector3.up * 0.3f);
        if (sp.z < 0f) return;
        float bw = 620f;
        float bh = sBubble.CalcHeight(new GUIContent(text), bw);
        float hx = sp.x / uiScale, hy = (Screen.height - sp.y) / uiScale;
        // Beside his head rather than over it, so you can still see what you're aiming at.
        float x = Mathf.Max(20f, Mathf.Min(hx + 110f, W - bw - 20f));
        float y = Mathf.Clamp(hy - bh * 0.5f - 40f, 210f, Mathf.Max(210f, H - 300f - bh));

        DrawRect(new Rect(x + 7f, y + 7f, bw, bh), new Color(0f, 0f, 0f, 0.35f));
        DrawRect(new Rect(x - 18f, Mathf.Clamp(hy - 10f, y + 16f, y + bh - 36f), 20f, 20f), new Color(0.98f, 0.98f, 0.95f));
        int count = phase == Phase.KO ? text.Length : Mathf.Min((int)shown, text.Length);
        GUI.Label(new Rect(x, y, bw, bh), text.Substring(0, count), sBubble);

        DrawRect(new Rect(x + 18f, y - 28f, 300f, 36f), new Color(0.15f, 0.45f, 0.9f));
        GUI.Label(new Rect(x + 18f, y - 28f, 300f, 36f), "MR. PEMBERTON, HR", sName);
    }

    void DrawDialogue()
    {
        float pw = W - 560f;
        Rect panel = new Rect(20f, H - 262f, pw, 242f);
        switch (phase)
        {
            case Phase.Choosing:
                DrawRect(panel, Panel);
                GUI.Label(new Rect(panel.x + 24f, panel.y + 12f, pw - 48f, 36f), "Answer him... or pick an item (1-4) and click on him.", sSmall);
                var q = InterviewScript.Questions[qIndex];
                for (int i = 0; i < q.answers.Length; i++)
                {
                    Rect r = new Rect(panel.x + 20f, panel.y + 56f + i * 90f, pw - 40f, 80f);
                    if (GUI.Button(r, (char)('A' + i) + ")   " + q.answers[i].label, sButton)) ChooseAnswer(q.answers[i]);
                }
                break;
            case Phase.Knocked:
                Hint(panel, "He's down! Hit him again for a COMBO... or let him get back up.");
                break;
            case Phase.KO:
                Hint(panel, "K.O.! Mr. Pemberton needs a little lie down.");
                break;
            default:
                Hint(panel, "SPACE to skip");
                break;
        }
    }

    void Hint(Rect panel, string text)
    {
        Rect r = new Rect(panel.x, panel.yMax - 60f, panel.width, 60f);
        DrawRect(r, Panel);
        GUI.Label(new Rect(r.x + 24f, r.y + 12f, r.width - 48f, 40f), text, sSmall);
    }

    void DrawHotbar()
    {
        const float size = 112f, gap = 10f;
        float x0 = W - 4f * (size + gap) - 10f;
        float y0 = H - size - 20f;
        GUI.Label(new Rect(x0, y0 - 40f, 4f * (size + gap), 36f), "ITEMS  (1-4 or scroll)", sSmall);
        for (int i = 0; i < 4; i++)
        {
            Rect r = new Rect(x0 + i * (size + gap), y0, size, size);
            bool selected = i == (int)weapon;
            DrawRect(r, selected ? Gold : new Color(0.3f, 0.32f, 0.4f, 0.9f));
            DrawRect(new Rect(r.x + 4f, r.y + 4f, r.width - 8f, r.height - 8f), selected ? new Color(0.3f, 0.22f, 0.05f, 0.95f) : new Color(0.08f, 0.09f, 0.14f, 0.92f));
            GUI.Label(new Rect(r.x + 10f, r.y + 6f, 40f, 30f), (i + 1).ToString(), sSmall);
            GUI.Label(r, WeaponNames[i], sSlot);
            if (GUI.Button(r, GUIContent.none, GUIStyle.none)) Select((Weapon)i);
        }
    }

    void DrawPopups()
    {
        foreach (var p in popups)
        {
            Vector2 pos;
            if (p.inWorld)
            {
                Vector3 sp = cam.WorldToScreenPoint(p.world);
                if (sp.z < 0f) continue;
                pos = new Vector2(sp.x / uiScale, (Screen.height - sp.y) / uiScale);
            }
            else pos = p.gui;
            pos.y -= p.t * 70f;
            float a = Mathf.Clamp01((1.4f - p.t) / 0.4f);
            ShadowLabel(new Rect(pos.x - 320f, pos.y - 40f, 640f, 80f), p.text, p.big ? sPop : sTag, new Color(p.color.r, p.color.g, p.color.b, a));
        }
    }

    void DrawCrosshair(Vector2 m)
    {
        float g = weapon == Weapon.Pistol ? 7f : 12f;
        for (int pass = 0; pass < 2; pass++)
        {
            float o = pass == 0 ? 2f : 0f;
            Color c = pass == 0 ? new Color(0f, 0f, 0f, 0.8f) : Color.white;
            DrawRect(new Rect(m.x - g - 14f - o, m.y - 2f - o, 14f + o * 2f, 4f + o * 2f), c);
            DrawRect(new Rect(m.x + g - o, m.y - 2f - o, 14f + o * 2f, 4f + o * 2f), c);
            DrawRect(new Rect(m.x - 2f - o, m.y - g - 14f - o, 4f + o * 2f, 14f + o * 2f), c);
            DrawRect(new Rect(m.x - 2f - o, m.y + g - o, 4f + o * 2f, 14f + o * 2f), c);
            DrawRect(new Rect(m.x - 2f - o, m.y - 2f - o, 4f + o * 2f, 4f + o * 2f), c);
        }
    }

    void DrawEnding()
    {
        DrawRect(new Rect(0f, 0f, W, H), new Color(0f, 0f, 0f, 0.72f));
        ShadowLabel(new Rect(0f, 90f, W, 150f), endTitle, sTitle, endColor);
        GUI.Label(new Rect(W / 2f - 620f, 250f, 1240f, 160f), endText, sBody);

        Rect sb = new Rect(W / 2f - 520f, 420f, 1040f, 300f);
        DrawRect(sb, Panel);
        GUI.Label(new Rect(sb.x + 40f, sb.y + 24f, 500f, 260f),
            "Answered with words:  " + talkAnswers + "\n" +
            "Punches thrown:  " + punches + "\n" +
            "Staplers thrown:  " + staplers + "\n" +
            "Headshots:  " + headshots + "\n" +
            "Office items wrecked:  " + officeDamage, sStats);
        GUI.Label(new Rect(sb.x + 540f, sb.y + 24f, 480f, 260f),
            "Answered with violence:  " + violentAnswers + "\n" +
            "Shots fired:  " + shots + "\n" +
            "Coffees thrown:  " + coffees + "\n" +
            "Bandages on Mr. Pemberton:  " + boss.Bandages + "\n" +
            "Final hireability:  " + hire + "%", sStats);

        if (GUI.Button(new Rect(W / 2f - 250f, 770f, 500f, 110f), "INTERVIEW AGAIN", sBigButton)) Restart();
        GUI.Label(new Rect(0f, 895f, W, 40f), "or press R", sSmallCenter);
    }

    // ------------------------------------------------------------------ UI helpers

    static void DrawRect(Rect r, Color c)
    {
        Color old = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, Texture2D.whiteTexture);
        GUI.color = old;
    }

    static void ShadowLabel(Rect r, string text, GUIStyle style, Color color)
    {
        Color old = style.normal.textColor;
        style.normal.textColor = new Color(0f, 0f, 0f, color.a * 0.85f);
        GUI.Label(new Rect(r.x + 4f, r.y + 4f, r.width, r.height), text, style);
        style.normal.textColor = color;
        GUI.Label(r, text, style);
        style.normal.textColor = old;
    }

    static Texture2D Tex(Color c)
    {
        var t = new Texture2D(1, 1);
        t.SetPixel(0, 0, c);
        t.Apply();
        return t;
    }

    static GUIStyle Label(int size, TextAnchor align, Color color, bool bold = false)
    {
        var s = new GUIStyle(GUI.skin.label) { fontSize = size, alignment = align, wordWrap = true, fontStyle = bold ? FontStyle.Bold : FontStyle.Normal };
        s.normal.textColor = color;
        return s;
    }

    static GUIStyle ButtonStyle(int size, TextAnchor align, Color normal, Color hover)
    {
        var s = new GUIStyle(GUI.skin.button)
        {
            fontSize = size,
            alignment = align,
            wordWrap = true,
            fontStyle = FontStyle.Bold,
            border = new RectOffset(0, 0, 0, 0),
            padding = new RectOffset(26, 26, 10, 10),
        };
        s.normal.background = Tex(normal);
        s.hover.background = Tex(hover);
        s.active.background = Tex(Color.Lerp(normal, Color.black, 0.3f));
        s.focused.background = s.normal.background;
        s.normal.textColor = s.hover.textColor = s.active.textColor = s.focused.textColor = Color.white;
        return s;
    }

    void EnsureStyles()
    {
        if (stylesReady) return;
        stylesReady = true;
        var grey = new Color(0.75f, 0.78f, 0.85f);
        sTitle = Label(104, TextAnchor.MiddleCenter, Color.white, true);
        sH2 = Label(38, TextAnchor.MiddleCenter, Color.white);
        sHud = Label(40, TextAnchor.UpperLeft, Color.white, true);
        sBody = Label(32, TextAnchor.UpperCenter, Color.white);
        sStats = Label(30, TextAnchor.UpperLeft, Color.white);
        sStats.wordWrap = false;
        sSmall = Label(24, TextAnchor.UpperLeft, grey, true);
        sSmallCenter = Label(24, TextAnchor.MiddleCenter, grey);
        sName = Label(22, TextAnchor.MiddleCenter, Color.white, true);
        sPop = Label(60, TextAnchor.MiddleCenter, Color.white, true);
        sTag = Label(32, TextAnchor.MiddleCenter, Color.white, true);
        sSlot = Label(22, TextAnchor.MiddleCenter, Color.white, true);

        sBubble = new GUIStyle(GUI.skin.label)
        {
            fontSize = 31,
            wordWrap = true,
            alignment = TextAnchor.UpperLeft,
            padding = new RectOffset(26, 26, 22, 22),
            border = new RectOffset(0, 0, 0, 0),
        };
        sBubble.normal.background = Tex(new Color(0.98f, 0.98f, 0.95f));
        sBubble.normal.textColor = new Color(0.1f, 0.1f, 0.14f);

        sButton = ButtonStyle(30, TextAnchor.MiddleLeft, new Color(0.14f, 0.17f, 0.26f), new Color(0.2f, 0.45f, 0.88f));
        sBigButton = ButtonStyle(44, TextAnchor.MiddleCenter, new Color(0.82f, 0.18f, 0.18f), new Color(0.95f, 0.32f, 0.25f));
    }
}
