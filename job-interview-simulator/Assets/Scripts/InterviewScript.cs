// Everything Mr. Pemberton says.

public class Answer
{
    public readonly string label, reply;
    public readonly int delta;
    public Answer(string label, int delta, string reply) { this.label = label; this.delta = delta; this.reply = reply; }
}

public class Question
{
    public readonly string text, scared;
    public readonly Answer[] answers;
    public Question(string text, string scared, params Answer[] answers) { this.text = text; this.scared = scared; this.answers = answers; }
}

public struct HitTag
{
    public readonly string text;
    public readonly int delta;
    public HitTag(string text, int delta) { this.text = text; this.delta = delta; }
}

public static class InterviewScript
{
    public const string Intro =
        "Ah, you must be the candidate. I'm Mr. Pemberton, Head of HR here at SynergyCorp. Please, take a seat. Let's begin.";

    public const string OutroCalm = "Well! Thank you so much for coming in. We'll be in touch.";
    public const string OutroScared = "Okay. That's... that's all the questions. Please stay seated. I'll see myself out. Of my own office.";

    // "scared" is used once you've answered two or more questions with violence.
    public static readonly Question[] Questions =
    {
        new Question(
            "So, tell me a little bit about yourself.",
            null,
            new Answer("I'm a hard-working team player.", 5, "Wow. Never heard that one before. Riveting stuff."),
            new Answer("I once ate a whole rotisserie chicken in a car park.", -5, "...I'm writing that down. I don't know why I'm writing that down.")),

        new Question(
            "Where do you see yourself in five years?",
            "Where do you see yourself in five years? ...Please say 'not in prison'.",
            new Answer("Sitting in your chair.", 5, "Ha ha. Ha. ...That's not funny. Don't look at my chair."),
            new Answer("On a beach. Far away from all of this.", 10, "Same, buddy. Same.")),

        new Question(
            "What would you say is your greatest weakness?",
            "What's your greatest weakness? And please don't say 'anger management'.",
            new Answer("I'm a perfectionist.", 0, "Classic. Textbook. I've heard it four hundred times. Next."),
            new Answer("Kryptonite.", -5, "Are you... Superman? That's not on your CV.")),

        new Question(
            "A coworker steals your lunch from the office fridge. What do you do in this situation?",
            "Hypothetically, a coworker steals your lunch. What do you do? Please. Do NOT demonstrate.",
            new Answer("Send them a polite email about it.", 10, "A passive-aggressive email. You'd fit right in here."),
            new Answer("Steal their lunch back. And their chair.", 0, "An eye for an eye. And a chair for a chair. Hm.")),

        new Question(
            "How do you handle conflict in the workplace?",
            "How do you handle conflict in the workplace? ...Actually, I think I already know.",
            new Answer("Open and honest communication.", 10, "Lovely. Very mature. Unlike some candidates."),
            new Answer("I hide in the toilets until it goes away.", 5, "That's... honestly, that's what I do.")),

        new Question(
            "Your manager gives you some negative feedback. How do you respond?",
            "If I gave you some negative feedback right now... how would you respond? Asking for me.",
            new Answer("Thank them, and work on it.", 10, "Gold star. Have a gold star."),
            new Answer("Cry in my car at lunch.", 0, "Fair. We've all been there. Tuesdays, mostly.")),

        new Question(
            "Why should we hire you over the other candidates?",
            "Why should we hire you? And can I go home straight after this?",
            new Answer("I bring passion and dedication.", 10, "Passion. Yes. I've seen a LOT of passion today."),
            new Answer("Because the other candidates are worse.", 5, "Have you met them? ...No, you're right, actually.")),

        new Question(
            "Finally... do you have any questions for us?",
            "Do you have any questions for us? Please say no. Please say no.",
            new Answer("What does a typical day look like?", 5, "Meetings. Then meetings about those meetings. You'll love it."),
            new Answer("Are there free biscuits?", 10, "There are! Well. There are crumbs. Welcome to SynergyCorp.")),
    };

    public static readonly string[] PunchLines =
    {
        "OW! My nose! That's... that's going in your appraisal.",
        "Ah! Okay! Firm handshake. VERY firm.",
        "You can't just PUNCH people in an interview!",
        "*spits out a tooth* ...Right. Next question.",
        "Was that a punch or a 'growth opportunity'?",
    };

    public static readonly string[] ShootLines =
    {
        "YOU SHOT ME! That is going on your CV!",
        "AAAGH! It's fine! It's fine! It's just a flesh wound!",
        "Is that a GUN? Did you bring a GUN to an INTERVIEW?",
        "Ow. Ow. OW. I'm putting 'not a team player'.",
        "Okay! I'll be honest! The salary is lower than the advert said!",
    };

    public static readonly string[] StaplerLines =
    {
        "Was that MY stapler?!",
        "Stapler to the face. A classic power move.",
        "I've been looking for that stapler for three years!",
        "Ow! Okay, I'll ask about your stationery skills later.",
    };

    public static readonly string[] CoffeeLines =
    {
        "HOT! HOT HOT HOT!",
        "That was MY coffee! It was decaf, but still!",
        "AAH! My shirt! This is designer! ...From the supermarket!",
        "*licks face* ...Needs sugar.",
    };

    public static readonly string[] ComboLines =
    {
        "STOP HITTING ME WHILE I'M DOWN!",
        "Please! I have a mortgage!",
        "I GET IT! You want the job! You REALLY want the job!",
        "Okay, that's a COMBO, that's not even fair!",
    };

    public static readonly HitTag[] HitTags =
    {
        new HitTag("+15 INITIATIVE", 15),
        new HitTag("+10 LEADERSHIP", 10),
        new HitTag("-15 TEAM PLAYER", -15),
        new HitTag("+10 HANDS-ON EXPERIENCE", 10),
        new HitTag("+20 ASSERTIVENESS", 20),
        new HitTag("-10 PEOPLE SKILLS", -10),
        new HitTag("+5 THINKS OUTSIDE THE BOX", 5),
        new HitTag("+10 GOAL-ORIENTED", 10),
        new HitTag("-20 CULTURE FIT", -20),
        new HitTag("+5 GOOD WITH TOOLS", 5),
        new HitTag("+10 MAKES AN IMPRESSION", 10),
    };
}
