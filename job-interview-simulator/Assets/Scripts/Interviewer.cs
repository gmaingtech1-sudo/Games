using UnityEngine;

// Mr. Pemberton: built from primitives, flies across the room when hit, gets back
// up with a fresh bandage and carries on with the interview.
public class Interviewer : MonoBehaviour
{
    public static readonly Color Skin = new Color(0.96f, 0.78f, 0.64f);
    static readonly Color Suit = new Color(0.17f, 0.21f, 0.34f);
    static readonly Color Shirt = new Color(0.95f, 0.95f, 0.97f);
    static readonly Color Bandage = new Color(1f, 0.97f, 0.9f);
    static readonly Color Coffee = new Color(0.36f, 0.2f, 0.1f);

    public Rigidbody Body { get; private set; }
    public Collider HeadCollider { get; private set; }
    public Transform Head { get; private set; }
    public bool IsDown { get; private set; }
    public bool KnockedOut { get; private set; }
    public int Bandages { get; private set; }
    public bool Talking { get; set; }
    public System.Action Recovered;

    Sfx sfx;
    Vector3 homePos;
    Quaternion homeRot;
    Transform upper, torso, mouth, armL, armR, eyeL, eyeR, stars;
    Rigidbody chair;
    Vector3 chairHomePos;
    Quaternion chairHomeRot;

    float downTime, stillTime, sampleTimer;
    Vector3 lastSample;
    bool recovering;
    float recoverT;
    Vector3 fromPos, chairFromPos;
    Quaternion fromRot, chairFromRot;
    float idleT, blinkTimer = 2.5f, blinkHold, lastThud;
    bool blackEye, dizzy;

    public static Interviewer Create(Transform parent, Vector3 pos, Sfx sfx)
    {
        var root = new GameObject("Mr Pemberton");
        root.transform.SetParent(parent, false);
        root.transform.localPosition = pos;
        var me = root.AddComponent<Interviewer>();
        me.sfx = sfx;
        me.BuildBody();
        me.BuildChair(parent, pos + new Vector3(0f, 0f, 0.55f));
        me.homePos = root.transform.position;
        me.homeRot = root.transform.rotation;

        var rb = root.AddComponent<Rigidbody>();
        rb.mass = 70f;
        rb.isKinematic = true;
        rb.maxAngularVelocity = 25f;
        rb.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
        me.Body = rb;
        return me;
    }

    void BuildBody()
    {
        var t = transform;
        var trousers = new Color(0.22f, 0.22f, 0.26f);
        for (int s = -1; s <= 1; s += 2)
        {
            Shapes.Make(PrimitiveType.Cube, t, new Vector3(0.12f * s, 0.43f, 0f), new Vector3(0.2f, 0.86f, 0.22f), trousers);
            Shapes.Make(PrimitiveType.Cube, t, new Vector3(0.12f * s, 0.05f, -0.05f), new Vector3(0.22f, 0.1f, 0.32f), new Color(0.08f, 0.06f, 0.05f), false);
        }

        // Everything from the hips up sways together.
        upper = Shapes.Empty("Upper", t, new Vector3(0f, 0.86f, 0f));
        torso = Shapes.Make(PrimitiveType.Cube, upper, new Vector3(0f, 0.34f, 0f), new Vector3(0.56f, 0.7f, 0.32f), Suit).transform;
        Shapes.Make(PrimitiveType.Cube, upper, new Vector3(0f, 0.47f, -0.162f), new Vector3(0.2f, 0.4f, 0.01f), Shirt, false);
        Shapes.Make(PrimitiveType.Cube, upper, new Vector3(0f, 0.42f, -0.17f), new Vector3(0.07f, 0.36f, 0.01f), new Color(0.8f, 0.1f, 0.12f), false);
        Shapes.Make(PrimitiveType.Cube, upper, new Vector3(0f, 0.62f, -0.173f), new Vector3(0.085f, 0.06f, 0.015f), new Color(0.6f, 0.06f, 0.08f), false);
        // Name badge.
        Shapes.Make(PrimitiveType.Cube, upper, new Vector3(0.17f, 0.53f, -0.164f), new Vector3(0.11f, 0.065f, 0.01f), Color.white, false);
        Shapes.Make(PrimitiveType.Cube, upper, new Vector3(0.17f, 0.555f, -0.17f), new Vector3(0.11f, 0.018f, 0.004f), new Color(0.15f, 0.45f, 0.9f), false);

        armL = MakeArm(-1);
        armR = MakeArm(1);

        Shapes.Make(PrimitiveType.Cylinder, upper, new Vector3(0f, 0.74f, 0f), new Vector3(0.14f, 0.05f, 0.14f), Skin, false);

        Head = Shapes.Empty("Head", upper, new Vector3(0f, 0.9f, 0f));
        HeadCollider = Shapes.Make(PrimitiveType.Sphere, Head, Vector3.zero, Vector3.one * 0.36f, Skin).GetComponent<Collider>();
        var dark = new Color(0.08f, 0.08f, 0.1f);
        // Ears, nose, glasses, eyes, moustache, mouth, comb-over.
        Shapes.Make(PrimitiveType.Sphere, Head, new Vector3(-0.18f, 0f, 0f), new Vector3(0.05f, 0.09f, 0.07f), Skin, false);
        Shapes.Make(PrimitiveType.Sphere, Head, new Vector3(0.18f, 0f, 0f), new Vector3(0.05f, 0.09f, 0.07f), Skin, false);
        Shapes.Make(PrimitiveType.Sphere, Head, new Vector3(0f, -0.01f, -0.18f), new Vector3(0.07f, 0.08f, 0.07f), new Color(0.95f, 0.66f, 0.55f), false);
        for (int s = -1; s <= 1; s += 2)
            Shapes.Make(PrimitiveType.Cube, Head, new Vector3(0.075f * s, 0.035f, -0.162f), new Vector3(0.1f, 0.075f, 0.01f), new Color(0.75f, 0.88f, 0.97f), false);
        Shapes.Make(PrimitiveType.Cube, Head, new Vector3(0f, 0.075f, -0.168f), new Vector3(0.26f, 0.014f, 0.014f), dark, false);
        eyeL = Shapes.Make(PrimitiveType.Sphere, Head, new Vector3(-0.075f, 0.03f, -0.17f), new Vector3(0.045f, 0.045f, 0.02f), dark, false).transform;
        eyeR = Shapes.Make(PrimitiveType.Sphere, Head, new Vector3(0.075f, 0.03f, -0.17f), new Vector3(0.045f, 0.045f, 0.02f), dark, false).transform;
        Shapes.Make(PrimitiveType.Cube, Head, new Vector3(0f, -0.05f, -0.172f), new Vector3(0.14f, 0.03f, 0.02f), new Color(0.35f, 0.22f, 0.12f), false);
        mouth = Shapes.Make(PrimitiveType.Cube, Head, new Vector3(0f, -0.095f, -0.162f), new Vector3(0.08f, 0.015f, 0.02f), new Color(0.45f, 0.08f, 0.1f), false).transform;
        Shapes.Make(PrimitiveType.Cube, Head, new Vector3(0.02f, 0.155f, 0.01f), new Vector3(0.3f, 0.05f, 0.28f), new Color(0.3f, 0.2f, 0.12f), false).Rot(0f, 0f, 8f);
    }

    Transform MakeArm(int side)
    {
        var pivot = Shapes.Empty(side < 0 ? "ArmL" : "ArmR", upper, new Vector3(0.36f * side, 0.64f, 0f));
        Shapes.Make(PrimitiveType.Cube, pivot, new Vector3(0f, -0.29f, 0f), new Vector3(0.15f, 0.6f, 0.17f), Suit, false);
        Shapes.Make(PrimitiveType.Cube, pivot, new Vector3(0f, -0.6f, 0f), new Vector3(0.14f, 0.04f, 0.15f), Shirt, false);
        Shapes.Make(PrimitiveType.Sphere, pivot, new Vector3(0f, -0.67f, 0f), Vector3.one * 0.13f, Skin, false);
        return pivot;
    }

    void BuildChair(Transform parent, Vector3 pos)
    {
        var root = new GameObject("Office Chair").transform;
        root.SetParent(parent, false);
        root.localPosition = pos;
        var black = new Color(0.1f, 0.1f, 0.11f);
        Shapes.Make(PrimitiveType.Cube, root, new Vector3(0f, 0.5f, 0f), new Vector3(0.55f, 0.08f, 0.55f), black);
        Shapes.Make(PrimitiveType.Cube, root, new Vector3(0f, 0.88f, 0.27f), new Vector3(0.5f, 0.62f, 0.06f), black);
        Shapes.Make(PrimitiveType.Cylinder, root, new Vector3(0f, 0.27f, 0f), new Vector3(0.06f, 0.22f, 0.06f), new Color(0.6f, 0.6f, 0.62f), false);
        Shapes.Make(PrimitiveType.Cube, root, new Vector3(0f, 0.04f, 0f), new Vector3(0.62f, 0.05f, 0.07f), black);
        Shapes.Make(PrimitiveType.Cube, root, new Vector3(0f, 0.04f, 0f), new Vector3(0.07f, 0.05f, 0.62f), black);
        chair = root.gameObject.AddComponent<Rigidbody>();
        chair.mass = 10f;
        chairHomePos = root.position;
        chairHomeRot = root.rotation;
    }

    public void Hit(Vector3 velocity, bool headshot)
    {
        recovering = false;
        if (Body.isKinematic)
        {
            Body.isKinematic = false;
            Body.interpolation = RigidbodyInterpolation.Interpolate;
        }
        if (chair.isKinematic) chair.isKinematic = false;

        Body.AddForce(velocity, ForceMode.VelocityChange);
        // Spin him backwards, plus some random tumbling.
        Vector3 spin = Vector3.Cross(Vector3.up, velocity.normalized) * velocity.magnitude * 1.2f + Random.insideUnitSphere * 5f;
        Body.AddTorque(spin, ForceMode.VelocityChange);

        IsDown = true;
        downTime = 0f;
        stillTime = 0f;
        sampleTimer = 0f;
        lastSample = transform.position;

        if (headshot)
        {
            dizzy = true;
            if (!blackEye)
            {
                blackEye = true;
                Shapes.Make(PrimitiveType.Sphere, Head, new Vector3(-0.075f, 0.03f, -0.166f), new Vector3(0.11f, 0.1f, 0.02f), new Color(0.45f, 0.2f, 0.5f), false);
            }
        }
    }

    public void KnockOut()
    {
        KnockedOut = true;
        dizzy = true;
        // Cartoon X eyes.
        var dark = new Color(0.08f, 0.08f, 0.1f);
        foreach (var eye in new[] { eyeL, eyeR })
        {
            eye.gameObject.SetActive(false);
            Shapes.Make(PrimitiveType.Cube, Head, eye.localPosition + new Vector3(0f, 0f, -0.006f), new Vector3(0.06f, 0.012f, 0.008f), dark, false).Rot(0f, 0f, 45f);
            Shapes.Make(PrimitiveType.Cube, Head, eye.localPosition + new Vector3(0f, 0f, -0.006f), new Vector3(0.06f, 0.012f, 0.008f), dark, false).Rot(0f, 0f, -45f);
        }
    }

    public void AddStain()
    {
        var size = new Vector3(Random.Range(0.07f, 0.15f), Random.Range(0.06f, 0.14f), 0.006f);
        Shapes.Make(PrimitiveType.Cube, upper, new Vector3(Random.Range(-0.2f, 0.2f), Random.Range(0.12f, 0.55f), -0.172f), size, Coffee, false)
            .Rot(0f, 0f, Random.Range(0f, 90f));
    }

    void AddBandage()
    {
        var b = Bandage;
        switch (Bandages)
        {
            case 0: // Crossed plasters on the forehead.
                Shapes.Make(PrimitiveType.Cube, Head, new Vector3(0.05f, 0.11f, -0.14f), new Vector3(0.13f, 0.035f, 0.01f), b, false).Rot(0f, 0f, 25f);
                Shapes.Make(PrimitiveType.Cube, Head, new Vector3(0.05f, 0.11f, -0.143f), new Vector3(0.13f, 0.035f, 0.01f), b, false).Rot(0f, 0f, -25f);
                break;
            case 1: // Head wrap.
                Shapes.Make(PrimitiveType.Cylinder, Head, new Vector3(0f, 0.08f, 0f), new Vector3(0.375f, 0.035f, 0.375f), b, false);
                break;
            case 2: // Plaster on the nose.
                Shapes.Make(PrimitiveType.Cube, Head, new Vector3(0f, -0.005f, -0.214f), new Vector3(0.09f, 0.025f, 0.01f), b, false);
                break;
            case 3: // Arm in a cast.
                Shapes.Make(PrimitiveType.Cube, armR, new Vector3(0f, -0.36f, 0f), new Vector3(0.19f, 0.42f, 0.21f), b, false);
                break;
            case 4: // Neck brace.
                Shapes.Make(PrimitiveType.Cylinder, upper, new Vector3(0f, 0.76f, 0f), new Vector3(0.24f, 0.07f, 0.24f), b, false);
                break;
            case 5: // Eye patch.
                Shapes.Make(PrimitiveType.Cube, Head, new Vector3(0.075f, 0.035f, -0.18f), new Vector3(0.1f, 0.085f, 0.01f), new Color(0.05f, 0.05f, 0.05f), false);
                Shapes.Make(PrimitiveType.Cylinder, Head, new Vector3(0f, 0.06f, 0f), new Vector3(0.37f, 0.008f, 0.37f), new Color(0.05f, 0.05f, 0.05f), false).Rot(0f, 0f, 14f);
                break;
            case 6: // Other arm too.
                Shapes.Make(PrimitiveType.Cube, armL, new Vector3(0f, -0.36f, 0f), new Vector3(0.19f, 0.42f, 0.21f), b, false);
                break;
            default: // Random plasters all over his suit.
                Shapes.Make(PrimitiveType.Cube, upper, new Vector3(Random.Range(-0.22f, 0.22f), Random.Range(0.1f, 0.6f), -0.175f), new Vector3(0.12f, 0.04f, 0.01f), b, false)
                    .Rot(0f, 0f, Random.Range(-40f, 40f));
                break;
        }
        Bandages++;
    }

    void BeginRecover()
    {
        recovering = true;
        recoverT = 0f;
        Body.isKinematic = true;
        Body.interpolation = RigidbodyInterpolation.None;
        chair.isKinematic = true;
        fromPos = transform.position;
        fromRot = transform.rotation;
        chairFromPos = chair.transform.position;
        chairFromRot = chair.transform.rotation;
    }

    void Update()
    {
        float dt = Time.deltaTime;
        idleT += dt;

        if (IsDown && !recovering)
        {
            downTime += dt;
            sampleTimer += dt;
            if (sampleTimer >= 0.25f)
            {
                float moved = (transform.position - lastSample).magnitude;
                lastSample = transform.position;
                sampleTimer = 0f;
                stillTime = moved < 0.04f ? stillTime + 0.25f : 0f;
            }
            if (transform.position.y < -3f) transform.position = homePos + Vector3.up;
            if (!KnockedOut && downTime > 1.4f && (stillTime >= 0.5f || downTime > 4.5f)) BeginRecover();
        }

        if (recovering)
        {
            recoverT += dt / 0.9f;
            float k = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(recoverT));
            transform.SetPositionAndRotation(
                Vector3.Lerp(fromPos, homePos, k) + Vector3.up * Mathf.Sin(k * Mathf.PI) * 0.5f,
                Quaternion.Slerp(fromRot, homeRot, k));
            chair.transform.SetPositionAndRotation(Vector3.Lerp(chairFromPos, chairHomePos, k), Quaternion.Slerp(chairFromRot, chairHomeRot, k));
            if (recoverT >= 1f)
            {
                recovering = false;
                IsDown = false;
                dizzy = false;
                chair.isKinematic = false;
                AddBandage();
                if (Recovered != null) Recovered();
            }
        }

        Animate(dt);
    }

    void Animate(float dt)
    {
        if (IsDown && !KnockedOut)
        {
            // Flail.
            armL.localRotation = Quaternion.Euler(Mathf.Sin(idleT * 21f) * 70f, 0f, -50f + Mathf.Sin(idleT * 17f) * 30f);
            armR.localRotation = Quaternion.Euler(Mathf.Cos(idleT * 19f) * 70f, 0f, 50f + Mathf.Cos(idleT * 23f) * 30f);
        }
        else if (KnockedOut)
        {
            armL.localRotation = Quaternion.Slerp(armL.localRotation, Quaternion.Euler(0f, 0f, -80f), dt * 4f);
            armR.localRotation = Quaternion.Slerp(armR.localRotation, Quaternion.Euler(0f, 0f, 80f), dt * 4f);
        }
        else
        {
            upper.localRotation = Quaternion.Euler(Mathf.Sin(idleT * 1.3f) * 1.5f, 0f, Mathf.Sin(idleT * 0.7f) * 2f);
            Head.localRotation = Quaternion.Euler(Mathf.Sin(idleT * 0.9f) * 4f, Mathf.Sin(idleT * 0.5f) * 8f, Talking ? Mathf.Sin(idleT * 3f) * 4f : 0f);
            armL.localRotation = Quaternion.Euler(0f, 0f, -6f + Mathf.Sin(idleT * 1.1f) * 2f);
            armR.localRotation = Talking
                ? Quaternion.Euler(-35f + Mathf.Sin(idleT * 6f) * 18f, 0f, 12f)
                : Quaternion.Euler(0f, 0f, 6f + Mathf.Sin(idleT * 1.2f) * 2f);
        }

        float open = Talking ? 0.015f + Mathf.Abs(Mathf.Sin(idleT * 18f)) * 0.045f : (IsDown ? 0.05f : 0.015f);
        mouth.localScale = new Vector3(0.08f, open, 0.02f);

        blinkTimer -= dt;
        if (blinkTimer <= 0f) { blinkHold = 0.12f; blinkTimer = Random.Range(2f, 5f); }
        blinkHold -= dt;
        float eyeY = blinkHold > 0f ? 0.006f : 0.045f;
        eyeL.localScale = new Vector3(0.045f, eyeY, 0.02f);
        eyeR.localScale = new Vector3(0.045f, eyeY, 0.02f);

        // Cartoon stars spinning above his head when he's dizzy.
        if (dizzy && stars == null)
        {
            stars = new GameObject("Stars").transform;
            stars.SetParent(transform.parent, false);
            for (int i = 0; i < 5; i++)
            {
                float a = i * Mathf.PI * 2f / 5f;
                Shapes.Make(PrimitiveType.Cube, stars, new Vector3(Mathf.Cos(a) * 0.24f, 0f, Mathf.Sin(a) * 0.24f), Vector3.one * 0.06f, new Color(1f, 0.9f, 0.2f), false).Rot(45f, 0f, 45f);
            }
        }
        if (stars != null)
        {
            stars.gameObject.SetActive(dizzy);
            stars.position = Head.position + Vector3.up * 0.3f;
            stars.rotation = Quaternion.Euler(0f, Time.time * 200f, 0f);
        }
    }

    void OnCollisionEnter(Collision c)
    {
        if (Body == null || Body.isKinematic) return;
        if (c.rigidbody != null && c.rigidbody.mass < 2f) return;
        if (c.relativeVelocity.magnitude < 2.5f || Time.time - lastThud < 0.15f) return;
        lastThud = Time.time;
        sfx.Play("thud", Mathf.Clamp01(c.relativeVelocity.magnitude / 8f), Random.Range(0.85f, 1.1f));
    }
}
