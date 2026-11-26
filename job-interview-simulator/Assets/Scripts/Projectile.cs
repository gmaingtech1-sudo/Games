using UnityEngine;

// A thrown stapler or coffee mug.
public class Projectile : MonoBehaviour
{
    public InterviewGame game;
    public InterviewGame.Weapon weapon;
    public Vector3 dir;
    bool spent;

    void OnCollisionEnter(Collision c)
    {
        if (spent) return;
        spent = true;

        Vector3 point = c.contactCount > 0 ? c.GetContact(0).point : transform.position;
        Interviewer who = c.rigidbody != null ? c.rigidbody.GetComponent<Interviewer>() : null;

        if (who != null) game.HitBoss(weapon, dir, point, c.collider == who.HeadCollider);
        else if (c.rigidbody != null) c.rigidbody.AddForceAtPosition(dir * 2f, point, ForceMode.VelocityChange);

        if (weapon == InterviewGame.Weapon.Coffee)
        {
            game.CoffeeSplash(point, who);
            Destroy(gameObject);
        }
        else
        {
            game.Sfx.Play("clank", 0.6f, Random.Range(0.9f, 1.1f));
        }
    }
}
