#include "CoachBrain.h"
#include "RiftTypes.h"

namespace
{
	constexpr int32 MaxHabits = 5;
	constexpr float BreathLeadIn = 3.0f;
	constexpr float BreathPhaseSeconds = 4.0f;
	constexpr int32 BreathRounds = 4;

	template <typename ElemType>
	const ElemType& PickOne(const TArray<ElemType>& Items)
	{
		return Items[FMath::RandRange(0, Items.Num() - 1)];
	}

	float Ease(float F)
	{
		return 0.5f - 0.5f * FMath::Cos(PI * FMath::Clamp(F, 0.0f, 1.0f));
	}

	const TArray<FString>& ReflectPrompts()
	{
		static const TArray<FString> Prompts = {
			TEXT("What's something you handled better this week than you would have a year ago?"),
			TEXT("What's taking up the most space in your head right now?"),
			TEXT("Who made your life a little easier recently? Have you told them?"),
			TEXT("What would you try tomorrow if you weren't afraid of getting it wrong?"),
			TEXT("What's one thing you're putting up with that you don't have to?"),
			TEXT("When did you last feel really like yourself? What were you doing?"),
			TEXT("What's a small win from today that you nearly didn't notice?"),
			TEXT("If your future self could send you one sentence, what would it say?"),
			TEXT("What are you saying yes to that you'd rather say no to?"),
			TEXT("What drains your energy, and what fills it back up?"),
			TEXT("What's one belief about yourself that might be out of date?"),
			TEXT("What are you proud of that nobody else knows about?"),
		};
		return Prompts;
	}
}

void FCoachBrain::Init(URiftSaveGame* InSave, FRewardFn InReward, TFunction<void()> InPersist)
{
	Save = InSave;
	Reward = MoveTemp(InReward);
	PersistFn = MoveTemp(InPersist);
}

// ---------------------------------------------------------------- plumbing

void FCoachBrain::Say(const FString& InLine)
{
	Line = FText::FromString(InLine);
	++TalkPulses;
	++Version;
}

void FCoachBrain::SetLineQuiet(const FString& InLine)
{
	Line = FText::FromString(InLine);
}

void FCoachBrain::SetChoices(TArray<FChoice>&& InChoices)
{
	Choices = MoveTemp(InChoices);
	TextHandler = nullptr;
	TextHint = FText::GetEmpty();
	++Version;
}

void FCoachBrain::AddChoice(TArray<FChoice>& Out, const FString& Label, TFunction<void()> Action) const
{
	FChoice Choice;
	Choice.Label = FText::FromString(Label);
	Choice.Action = MoveTemp(Action);
	Out.Add(MoveTemp(Choice));
}

void FCoachBrain::AskText(const FString& Hint, TFunction<void(const FString&)> Handler, bool bAllowBack)
{
	TArray<FChoice> Back;
	if (bAllowBack)
	{
		AddChoice(Back, TEXT("Skip, back to the menu"), [this]() { ShowMenu(TEXT("No problem. What would you like to do?")); });
	}
	Choices = MoveTemp(Back);
	TextHandler = MoveTemp(Handler);
	TextHint = FText::FromString(Hint);
	++Version;
}

void FCoachBrain::Choose(int32 Index)
{
	if (!Choices.IsValidIndex(Index))
	{
		return;
	}
	// Copy first: the action usually replaces Choices, which would destroy it mid-call.
	TFunction<void()> Action = Choices[Index].Action;
	if (Action)
	{
		Action();
	}
}

void FCoachBrain::SubmitText(const FString& Text)
{
	if (!TextHandler)
	{
		return;
	}
	const FString Clean = Text.TrimStartAndEnd().Left(280);
	if (Clean.IsEmpty())
	{
		Say(TEXT("Take your time. Even a few words is fine."));
		return;
	}
	TFunction<void(const FString&)> Handler = TextHandler;
	Handler(Clean);
}

void FCoachBrain::GiveReward(int32 Resolve, const FString& Why)
{
	if (Reward)
	{
		Reward(Resolve, Why);
	}
	Persist();
}

void FCoachBrain::Persist()
{
	if (PersistFn)
	{
		PersistFn();
	}
}

int32 FCoachBrain::ConsumeTalkPulses()
{
	const int32 N = TalkPulses;
	TalkPulses = 0;
	return N;
}

// ---------------------------------------------------------------- menu

void FCoachBrain::Open()
{
	check(Save);
	bOpen = true;
	bBreathing = false;

	if (Save->PlayerName.IsEmpty())
	{
		Say(TEXT("Hello there. I'm Sage, a Parasaurolophus. My family has been adapting to big changes for about seventy-five million years, so I've picked up a few things.\n\n")
			TEXT("I'm here to help with your real life: your goals, your habits, and how you're doing. Everything you follow through on earns Resolve, and Resolve is what powers your rifts.\n\n")
			TEXT("What should I call you?"));
		AskText(TEXT("Your name"), [this](const FString& Name)
		{
			Save->PlayerName = Name.Left(24);
			Persist();
			ShowMenu(FString::Printf(TEXT("Nice to meet you, %s. Where would you like to start? A daily check-in is a good first step."), *Save->PlayerName));
		}, false);
		return;
	}
	ShowMenu(Greeting());
}

FString FCoachBrain::Greeting() const
{
	const int32 Hour = FDateTime::Now().GetHour();
	const TCHAR* Hello = Hour < 5 ? TEXT("Up late") : Hour < 12 ? TEXT("Good morning") : Hour < 18 ? TEXT("Good afternoon") : TEXT("Good evening");
	FString Out = FString::Printf(TEXT("%s, %s."), Hello, *Save->PlayerName);

	const int32 Today = Rift::Today();
	const FCoachHabit* Waiting = Save->Habits.FindByPredicate([Today](const FCoachHabit& H) { return H.LastDay != Today; });
	const FCoachGoal* Active = Save->Goals.FindByPredicate([](const FCoachGoal& G) { return !G.bDone; });

	if (Save->LastCheckInDay != Today)
	{
		Out += TEXT(" We haven't checked in yet today. Shall we start there?");
	}
	else if (Waiting)
	{
		Out += FString::Printf(TEXT(" \"%s\" is still waiting for you today."), *Waiting->Name);
	}
	else if (Active)
	{
		Out += FString::Printf(TEXT(" Your next step is \"%s\". How's it going?"), *Active->NextStep);
	}
	else
	{
		Out += TEXT(" What's on your mind?");
	}

	if (Hour < 5)
	{
		Out += TEXT("\n\n(Gentle reminder from an old dinosaur: sleep is the best performance tool there is.)");
	}
	return Out;
}

void FCoachBrain::ShowMenu(const FString& Intro)
{
	bBreathing = false;
	Say(Intro);

	TArray<FChoice> C;
	const bool bCheckedIn = Save->LastCheckInDay == Rift::Today();
	AddChoice(C, bCheckedIn ? TEXT("Check in again") : TEXT("Daily check-in (+2 Resolve)"), [this]() { StartCheckIn(); });
	AddChoice(C, TEXT("Plan a new goal (+3 Resolve)"), [this]() { StartGoal(); });
	const int32 Active = CountActiveGoals();
	if (Active > 0)
	{
		AddChoice(C, FString::Printf(TEXT("Review my goals (%d)"), Active), [this]() { ReviewGoals(); });
	}
	AddChoice(C, FString::Printf(TEXT("My habits (%d)"), Save->Habits.Num()), [this]() { ShowHabits(HabitsIntro()); });
	AddChoice(C, TEXT("Reflect with me"), [this]() { StartReflect(); });
	AddChoice(C, TEXT("Breathe with me (1 minute)"), [this]() { StartBreathing(); });
	AddChoice(C, TEXT("See you later"), [this]() { Farewell(); });
	SetChoices(MoveTemp(C));
}

void FCoachBrain::Farewell()
{
	static const TArray<FString> Lines = {
		TEXT("Go get 'em. I'll be right here by the rift."),
		TEXT("Remember: tiny steps still move you forward."),
		TEXT("Be kind to yourself out there. That's an order from a very old dinosaur."),
		TEXT("Progress, not perfection. See you soon."),
	};
	bOpen = false;
	bBreathing = false;
	TextHandler = nullptr;
	Choices.Reset();
	Say(PickOne(Lines));
}

// ---------------------------------------------------------------- check-in

void FCoachBrain::StartCheckIn()
{
	Say(Save->LastCheckInDay == Rift::Today()
		? TEXT("We already checked in today, but I'm always glad to hear from you. How are you now?")
		: TEXT("How are you arriving today? Be honest, there's no wrong answer."));

	TArray<FChoice> C;
	AddChoice(C, TEXT("1 - Rough"), [this]() { OnMood(1); });
	AddChoice(C, TEXT("2 - Low"), [this]() { OnMood(2); });
	AddChoice(C, TEXT("3 - Okay"), [this]() { OnMood(3); });
	AddChoice(C, TEXT("4 - Good"), [this]() { OnMood(4); });
	AddChoice(C, TEXT("5 - Great"), [this]() { OnMood(5); });
	AddChoice(C, TEXT("Back"), [this]() { ShowMenu(TEXT("Okay. What would you like to do?")); });
	SetChoices(MoveTemp(C));
}

bool FCoachBrain::IsMoodTrendLow() const
{
	const int32 N = Save->Moods.Num();
	if (N < 3)
	{
		return false;
	}
	for (int32 i = N - 3; i < N; ++i)
	{
		if (Save->Moods[i].Mood > 2)
		{
			return false;
		}
	}
	return true;
}

void FCoachBrain::OnMood(int32 Mood)
{
	const int32 Today = Rift::Today();
	const bool bFirstToday = Save->LastCheckInDay != Today;

	FMoodEntry Entry;
	Entry.Day = Today;
	Entry.Mood = Mood;
	Save->Moods.Add(Entry);
	if (Save->Moods.Num() > 90)
	{
		Save->Moods.RemoveAt(0, Save->Moods.Num() - 90);
	}

	if (bFirstToday)
	{
		Save->CheckInStreak = (Save->LastCheckInDay == Today - 1) ? Save->CheckInStreak + 1 : 1;
		Save->LastCheckInDay = Today;
		GiveReward(2, TEXT("checking in"));
	}

	FString Reply;
	FString Hint;
	switch (Mood)
	{
	case 1:
		Reply = TEXT("Thank you for telling me straight. Rough days are real, and you don't have to fix everything today.\n\n")
			TEXT("If it's more than a rough day, and you feel unsafe or hopeless, please talk to someone you trust or contact a local crisis line right now. Reaching out is strength, not weakness.\n\n")
			TEXT("What's one small, kind thing you could do for yourself in the next hour?");
		Hint = TEXT("e.g. Drink some water and step outside for five minutes");
		break;
	case 2:
		Reply = TEXT("Low days happen to every creature. Let's keep it gentle.\n\nWhat's one thing that would make today even 1% better?");
		Hint = TEXT("e.g. Text a friend, go to bed on time");
		break;
	case 3:
		Reply = TEXT("Okay is a solid place to build from.\n\nWhat's one thing that would turn okay into good today?");
		Hint = TEXT("e.g. Finish that one task I keep putting off");
		break;
	case 4:
		Reply = TEXT("Love that. What's going well? Name it, so you can do more of it.");
		Hint = TEXT("e.g. I slept well and got a walk in");
		break;
	default:
		Reply = TEXT("ROAR! Let's use that energy. What's the one thing you most want to get done while you feel this good?");
		Hint = TEXT("e.g. Start the first page of my project");
		break;
	}

	if (IsMoodTrendLow())
	{
		Reply += TEXT("\n\nI've noticed your last few check-ins have been low. That's worth paying attention to. Would talking to a friend, a doctor or a counsellor help? I'm a dinosaur with good intentions, but they can do things I can't.");
	}
	if (bFirstToday && Save->CheckInStreak > 1)
	{
		Reply += FString::Printf(TEXT("\n\n(That's %d days in a row of checking in.)"), Save->CheckInStreak);
	}

	Say(Reply);
	AskText(Hint, [this](const FString& Note)
	{
		if (Save->Moods.Num() > 0)
		{
			Save->Moods.Last().Note = Note;
		}
		Persist();
		ShowMenu(FString::Printf(TEXT("Got it: \"%s\". Small and specific beats big and someday. I'm rooting for you.\n\nAnything else?"), *Note));
	}, true);
}

// ---------------------------------------------------------------- goals (GROW)

void FCoachBrain::StartGoal()
{
	Draft = FCoachGoal();
	bNudged = false;
	Say(TEXT("Let's build a plan. I use four steps: Goal, Reality, Options, Will.\n\n")
		TEXT("First, the Goal. What do you want? Say it like you've already decided."));
	AskText(TEXT("e.g. Run a 5K by spring"), [this](const FString& Text)
	{
		Draft.Goal = Text;
		GoalReality();
	}, true);
}

void FCoachBrain::GoalReality()
{
	Say(FString::Printf(TEXT("\"%s\". Good.\n\nNow Reality. Where are you with it right now, honestly? No judging, just the facts."), *Draft.Goal));
	AskText(TEXT("e.g. I can jog for about ten minutes"), [this](const FString& Text)
	{
		Draft.Reality = Text;
		GoalOptions();
	}, true);
}

void FCoachBrain::GoalOptions()
{
	Say(TEXT("Thanks for being honest. That's usually the hardest part.\n\n")
		TEXT("Now Options. If nothing could stop you, what are some ways forward? Throw out a few, even silly ones."));
	AskText(TEXT("e.g. A couch-to-5K app, running with a friend, joining a club"), [this](const FString& Text)
	{
		Draft.Options = Text;
		GoalWill(false);
	}, true);
}

void FCoachBrain::GoalWill(bool bSharpen)
{
	Say(bSharpen
		? TEXT("Let's sharpen it. Add a number, a place or a time. What exactly will you do?")
		: TEXT("Lots to work with.\n\nNow Will. What's the one next step you'll actually take? Make it so small you can't say no."));
	AskText(TEXT("e.g. Jog for 10 minutes on Tuesday morning"), [this](const FString& Text)
	{
		Draft.NextStep = Text;
		if (!bNudged && !LooksSpecific(Text))
		{
			bNudged = true;
			Say(TEXT("Could we make that a bit more specific? \"Walk for 10 minutes after lunch\" beats \"exercise more\", because your brain knows exactly what to do and when it's done."));
			TArray<FChoice> C;
			AddChoice(C, TEXT("Sharpen it"), [this]() { GoalWill(true); });
			AddChoice(C, TEXT("Keep it as it is"), [this]() { GoalWhen(); });
			SetChoices(MoveTemp(C));
			return;
		}
		GoalWhen();
	}, true);
}

void FCoachBrain::GoalWhen()
{
	Say(FString::Printf(TEXT("\"%s\". I like it.\n\nWhen exactly will you do it? A day and a time works best."), *Draft.NextStep));
	AskText(TEXT("e.g. Tuesday at 7am"), [this](const FString& Text)
	{
		Draft.ByWhen = Text;
		FinishGoal();
	}, true);
}

void FCoachBrain::FinishGoal()
{
	Draft.CreatedDay = Rift::Today();
	Save->Goals.Add(Draft);
	GiveReward(3, TEXT("planning a goal"));

	Say(FString::Printf(TEXT("Here's your plan.\n\nGoal: %s\nRight now: %s\nNext step: %s\nWhen: %s\n\n")
		TEXT("I've saved it. Come back and tell me when you've done the step. Keeping promises to yourself is how confidence gets built."),
		*Draft.Goal, *Draft.Reality, *Draft.NextStep, *Draft.ByWhen));

	TArray<FChoice> C;
	AddChoice(C, TEXT("Back to the menu"), [this]() { ShowMenu(TEXT("What next?")); });
	AddChoice(C, TEXT("See you later"), [this]() { Farewell(); });
	SetChoices(MoveTemp(C));
}

bool FCoachBrain::LooksSpecific(const FString& Step)
{
	for (const TCHAR Ch : Step)
	{
		if (FChar::IsDigit(Ch))
		{
			return true;
		}
	}
	static const TCHAR* Words[] = {
		TEXT("minute"), TEXT("hour"), TEXT("page"), TEXT(" km"), TEXT("mile"), TEXT("every"), TEXT("daily"),
		TEXT("morning"), TEXT("evening"), TEXT("tonight"), TEXT("today"), TEXT("tomorrow"), TEXT("lunch"), TEXT("breakfast"),
		TEXT("dinner"), TEXT("monday"), TEXT("tuesday"), TEXT("wednesday"), TEXT("thursday"), TEXT("friday"),
		TEXT("saturday"), TEXT("sunday"), TEXT("one "), TEXT("two "), TEXT("three "), TEXT("five "), TEXT("ten ") };
	const FString Lower = Step.ToLower() + TEXT(" ");
	for (const TCHAR* Word : Words)
	{
		if (Lower.Contains(Word))
		{
			return true;
		}
	}
	return false;
}

int32 FCoachBrain::CountActiveGoals() const
{
	return Save->Goals.FilterByPredicate([](const FCoachGoal& G) { return !G.bDone; }).Num();
}

void FCoachBrain::ReviewGoals()
{
	TArray<int32> Active;
	for (int32 i = 0; i < Save->Goals.Num(); ++i)
	{
		if (!Save->Goals[i].bDone)
		{
			Active.Add(i);
		}
	}
	if (Active.Num() == 0)
	{
		ShowMenu(TEXT("No goals in progress right now. Want to plan one?"));
		return;
	}

	FString Text = TEXT("Here's what you're working on:\n");
	for (int32 i : Active)
	{
		const FCoachGoal& G = Save->Goals[i];
		Text += FString::Printf(TEXT("\n- %s\n   Next: %s%s"), *G.Goal, *G.NextStep, G.ByWhen.IsEmpty() ? TEXT("") : *FString::Printf(TEXT(" (%s)"), *G.ByWhen));
	}
	Text += TEXT("\n\nDid you take any of those steps?");
	Say(Text);

	TArray<FChoice> C;
	for (int32 i : Active)
	{
		AddChoice(C, FString::Printf(TEXT("I did it: %s"), *Save->Goals[i].NextStep.Left(40)), [this, i]() { StepDone(i); });
	}
	AddChoice(C, TEXT("Not yet, back to the menu"), [this]()
	{
		ShowMenu(TEXT("That's okay. If a step keeps not happening, it's usually too big. Try making it smaller. What next?"));
	});
	SetChoices(MoveTemp(C));
}

void FCoachBrain::StepDone(int32 GoalIndex)
{
	if (!Save->Goals.IsValidIndex(GoalIndex))
	{
		return;
	}
	FCoachGoal& G = Save->Goals[GoalIndex];
	G.StepsDone++;
	GiveReward(2, TEXT("following through"));

	Say(FString::Printf(TEXT("You did what you said you'd do. That's how you build trust with yourself.\n\nIs \"%s\" complete, or is there a next step?"), *G.Goal));
	TArray<FChoice> C;
	AddChoice(C, TEXT("The whole goal is done!"), [this, GoalIndex]() { CompleteGoal(GoalIndex); });
	AddChoice(C, TEXT("Set the next step"), [this, GoalIndex]() { NextStepFor(GoalIndex); });
	SetChoices(MoveTemp(C));
}

void FCoachBrain::NextStepFor(int32 GoalIndex)
{
	Say(TEXT("What's the next small step? Same rule: so small you can't say no, with a number or a time."));
	AskText(TEXT("e.g. Jog for 15 minutes on Thursday"), [this, GoalIndex](const FString& Text)
	{
		if (Save->Goals.IsValidIndex(GoalIndex))
		{
			Save->Goals[GoalIndex].NextStep = Text;
			Save->Goals[GoalIndex].ByWhen.Reset();
		}
		Persist();
		ShowMenu(FString::Printf(TEXT("Next step: \"%s\". One step at a time is how mountains get climbed. What next?"), *Text));
	}, true);
}

void FCoachBrain::CompleteGoal(int32 GoalIndex)
{
	if (!Save->Goals.IsValidIndex(GoalIndex))
	{
		return;
	}
	Save->Goals[GoalIndex].bDone = true;
	const FString GoalName = Save->Goals[GoalIndex].Goal;
	GiveReward(5, TEXT("finishing a goal"));

	Say(FString::Printf(TEXT("ROOOAR! You finished \"%s\"! Take a moment to really notice that.\n\nWhat did you learn about yourself along the way?"), *GoalName));
	AskText(TEXT("e.g. I'm more consistent than I thought"), [this](const FString&)
	{
		ShowMenu(TEXT("I'll remember that, and you should too. Lean on it next time something feels hard. What next?"));
	}, true);
}

// ---------------------------------------------------------------- habits

FString FCoachBrain::HabitsIntro() const
{
	if (Save->Habits.Num() == 0)
	{
		return TEXT("Habits are where real change lives. Big goals are great, but what you do every day decides where you end up.\n\nLet's start one tiny habit.");
	}
	return TEXT("Here are your habits. Tick off the ones you did today.");
}

void FCoachBrain::ShowHabits(const FString& Intro)
{
	Say(Intro);
	const int32 Today = Rift::Today();

	TArray<FChoice> C;
	for (int32 i = 0; i < Save->Habits.Num(); ++i)
	{
		const FCoachHabit& H = Save->Habits[i];
		if (H.LastDay == Today)
		{
			AddChoice(C, FString::Printf(TEXT("Done today: %s (streak %d)"), *H.Name.Left(36), H.Streak), [this]()
			{
				ShowHabits(TEXT("Already counted for today. Nice work. See you tomorrow for the next one."));
			});
		}
		else
		{
			AddChoice(C, FString::Printf(TEXT("I did it: %s (+1)"), *H.Name.Left(36)), [this, i]() { DoHabit(i); });
		}
	}
	if (Save->Habits.Num() < MaxHabits)
	{
		AddChoice(C, TEXT("Add a habit"), [this]() { NewHabit(); });
	}
	if (Save->Habits.Num() > 0)
	{
		AddChoice(C, TEXT("Remove a habit"), [this]() { RemoveHabitMenu(); });
	}
	AddChoice(C, TEXT("Back"), [this]() { ShowMenu(TEXT("What next?")); });
	SetChoices(MoveTemp(C));
}

void FCoachBrain::DoHabit(int32 Index)
{
	if (!Save->Habits.IsValidIndex(Index))
	{
		return;
	}
	FCoachHabit& H = Save->Habits[Index];
	const int32 Today = Rift::Today();
	const bool bBroken = H.LastDay >= 0 && H.LastDay < Today - 1 && H.Streak >= 2;

	H.Streak = (H.LastDay == Today - 1) ? H.Streak + 1 : 1;
	H.Best = FMath::Max(H.Best, H.Streak);
	H.LastDay = Today;
	const FString Name = H.Name;
	const int32 Streak = H.Streak;
	GiveReward(1, TEXT("keeping a habit"));

	FString Msg;
	if (bBroken)
	{
		Msg = FString::Printf(TEXT("Welcome back to \"%s\". Streaks break; what matters is how fast you restart. The rule is: never miss twice."), *Name);
	}
	else if (Streak == 3)
	{
		Msg = TEXT("Three days in a row! It's starting to feel like part of you.");
	}
	else if (Streak == 7)
	{
		Msg = TEXT("A full week! That's not luck, that's who you're becoming.");
	}
	else if (Streak == 14 || Streak == 21)
	{
		Msg = FString::Printf(TEXT("%d days. Most people never get here. I'm doing a little dinosaur dance."), Streak);
	}
	else if (Streak == 30 || (Streak > 30 && Streak % 30 == 0))
	{
		Msg = FString::Printf(TEXT("%d days! This habit is yours now. Maybe it's time to make it a little bigger?"), Streak);
	}
	else
	{
		static const TArray<FString> Praise = {
			TEXT("Logged. Every rep is a vote for the person you want to be."),
			TEXT("Nice. Small things, done often, become big things."),
			TEXT("Done! Feel that? That's Resolve."),
			TEXT("Another one. Consistency beats intensity."),
		};
		Msg = PickOne(Praise);
	}
	ShowHabits(FString::Printf(TEXT("%s\n\n\"%s\": %d day streak."), *Msg, *Name, Streak));
}

void FCoachBrain::NewHabit()
{
	Say(TEXT("What tiny habit do you want to build? The trick is to tie it to something you already do:\n\n")
		TEXT("\"After I ___, I will ___.\"\n\nKeep it so small it feels almost silly. You can grow it later."));
	AskText(TEXT("e.g. After I make coffee, I'll stretch for 2 minutes"), [this](const FString& Text)
	{
		FCoachHabit H;
		H.Name = Text.Left(60);
		Save->Habits.Add(H);
		Persist();
		ShowHabits(FString::Printf(TEXT("Locked in: \"%s\". Tick it off here each day you do it."), *H.Name));
	}, true);
}

void FCoachBrain::RemoveHabitMenu()
{
	Say(TEXT("Which one? Letting go of a habit that doesn't fit is a good decision, not a failure."));
	TArray<FChoice> C;
	for (int32 i = 0; i < Save->Habits.Num(); ++i)
	{
		AddChoice(C, FString::Printf(TEXT("Remove: %s"), *Save->Habits[i].Name.Left(40)), [this, i]()
		{
			if (Save->Habits.IsValidIndex(i))
			{
				Save->Habits.RemoveAt(i);
				Persist();
			}
			ShowHabits(TEXT("Removed. Make room for what matters."));
		});
	}
	AddChoice(C, TEXT("Cancel"), [this]() { ShowHabits(HabitsIntro()); });
	SetChoices(MoveTemp(C));
}

// ---------------------------------------------------------------- reflection

void FCoachBrain::StartReflect()
{
	const TArray<FString>& Prompts = ReflectPrompts();
	int32 Index;
	do { Index = FMath::RandRange(0, Prompts.Num() - 1); } while (Index == LastReflectPrompt && Prompts.Num() > 1);
	LastReflectPrompt = Index;

	Say(Prompts[Index]);
	AskText(TEXT("Write whatever comes to mind"), [this](const FString&)
	{
		const int32 Today = Rift::Today();
		if (Save->LastReflectDay != Today)
		{
			Save->LastReflectDay = Today;
			GiveReward(1, TEXT("reflecting"));
		}
		static const TArray<FString> Replies = {
			TEXT("Thank you for sharing that. Noticing is the first step to changing anything."),
			TEXT("That's worth sitting with. You don't have to solve it right now; knowing it is enough for today."),
			TEXT("I hear you. Seventy-five million years taught my family one thing: the ones who make it are the ones who pay attention."),
			TEXT("Good reflection. Is there one tiny action hiding in that answer?"),
		};
		Say(PickOne(Replies));
		TArray<FChoice> C;
		AddChoice(C, TEXT("Another question"), [this]() { StartReflect(); });
		AddChoice(C, TEXT("Turn it into a goal"), [this]() { StartGoal(); });
		AddChoice(C, TEXT("Back to the menu"), [this]() { ShowMenu(TEXT("What next?")); });
		SetChoices(MoveTemp(C));
	}, true);
}

// ---------------------------------------------------------------- breathing

void FCoachBrain::StartBreathing()
{
	bBreathing = true;
	BreathTime = 0.0f;
	LastBreathKey = -1;
	Say(TEXT("Let's do box breathing together. Watch my chest and match me: in for 4, hold for 4, out for 4, hold for 4. Four rounds."));
	TArray<FChoice> C;
	AddChoice(C, TEXT("Stop"), [this]()
	{
		bBreathing = false;
		ShowMenu(TEXT("That's okay. Even a few slow breaths count. What next?"));
	});
	SetChoices(MoveTemp(C));
}

void FCoachBrain::Tick(float DeltaSeconds)
{
	if (!bOpen || !bBreathing)
	{
		return;
	}
	BreathTime += DeltaSeconds;
	const float T = BreathTime - BreathLeadIn;
	if (T < 0.0f)
	{
		return;
	}
	const int32 Phase = FMath::FloorToInt(T / BreathPhaseSeconds);
	if (Phase >= BreathRounds * 4)
	{
		FinishBreathing();
		return;
	}
	const int32 SecondsLeft = FMath::CeilToInt(BreathPhaseSeconds - FMath::Fmod(T, BreathPhaseSeconds));
	const int32 Key = Phase * 10 + SecondsLeft;
	if (Key != LastBreathKey)
	{
		LastBreathKey = Key;
		static const TCHAR* Cues[] = { TEXT("Breathe in"), TEXT("Hold"), TEXT("Breathe out"), TEXT("Hold") };
		SetLineQuiet(FString::Printf(TEXT("%s...  %d\n\nRound %d of %d"), Cues[Phase % 4], SecondsLeft, Phase / 4 + 1, BreathRounds));
	}
}

float FCoachBrain::GetBreathLevel() const
{
	if (!bBreathing)
	{
		return 0.0f;
	}
	const float T = BreathTime - BreathLeadIn;
	if (T < 0.0f)
	{
		return 0.0f;
	}
	const int32 Phase = FMath::FloorToInt(T / BreathPhaseSeconds) % 4;
	const float F = FMath::Fmod(T, BreathPhaseSeconds) / BreathPhaseSeconds;
	switch (Phase)
	{
	case 0:  return Ease(F);
	case 1:  return 1.0f;
	case 2:  return 1.0f - Ease(F);
	default: return 0.0f;
	}
}

void FCoachBrain::FinishBreathing()
{
	bBreathing = false;
	const int32 Today = Rift::Today();
	if (Save->LastBreathDay != Today)
	{
		Save->LastBreathDay = Today;
		GiveReward(1, TEXT("breathing"));
	}
	ShowMenu(TEXT("Nicely done. Notice how your shoulders feel now.\n\n")
		TEXT("Your breath goes everywhere you go. Use it before a hard conversation, an exam, or bed. What next?"));
}
