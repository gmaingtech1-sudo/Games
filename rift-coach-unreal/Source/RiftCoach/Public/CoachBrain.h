#pragma once

#include "CoreMinimal.h"
#include "RiftSaveGame.h"

/**
 * Sage's coaching conversations. Pure game logic, no UI: the HUD reads the current
 * line and choices and calls Choose / SubmitText.
 *
 * Techniques: a daily mood check-in, GROW goal planning (Goal, Reality, Options, Will)
 * with a nudge towards specific next steps, tiny habits stacked on existing routines
 * with streaks ("never miss twice"), reflection questions and box breathing.
 *
 * Sage is a coach, not a therapist, and says so when check-ins are low.
 */
class RIFTCOACH_API FCoachBrain
{
public:
	struct FChoice
	{
		FText Label;
		TFunction<void()> Action;
	};

	using FRewardFn = TFunction<void(int32 /*Resolve*/, const FString& /*Why*/)>;

	void Init(URiftSaveGame* InSave, FRewardFn InReward, TFunction<void()> InPersist);

	void Open();
	bool IsOpen() const { return bOpen; }

	const FText& GetLine() const { return Line; }
	const TArray<FChoice>& GetChoices() const { return Choices; }
	bool WantsText() const { return static_cast<bool>(TextHandler); }
	const FText& GetTextHint() const { return TextHint; }

	/** Bumps whenever the choices or text prompt change, so the HUD knows to rebuild. */
	int32 GetVersion() const { return Version; }

	void Choose(int32 Index);
	void SubmitText(const FString& Text);
	void Tick(float DeltaSeconds);

	bool IsBreathing() const { return bOpen && bBreathing; }
	/** 0 = fully out, 1 = fully in. Sage's chest follows it. */
	float GetBreathLevel() const;

	/** Number of new lines Sage has said since the last call. Drives head nods. */
	int32 ConsumeTalkPulses();

private:
	void Say(const FString& InLine);
	void SetLineQuiet(const FString& InLine);
	void SetChoices(TArray<FChoice>&& InChoices);
	void AddChoice(TArray<FChoice>& Out, const FString& Label, TFunction<void()> Action) const;
	void AskText(const FString& Hint, TFunction<void(const FString&)> Handler, bool bAllowBack);
	void GiveReward(int32 Resolve, const FString& Why);
	void Persist();

	FString Greeting() const;
	void ShowMenu(const FString& Intro);
	void Farewell();

	void StartCheckIn();
	void OnMood(int32 Mood);
	bool IsMoodTrendLow() const;

	void StartGoal();
	void GoalReality();
	void GoalOptions();
	void GoalWill(bool bSharpen);
	void GoalWhen();
	void FinishGoal();
	static bool LooksSpecific(const FString& Step);
	int32 CountActiveGoals() const;
	void ReviewGoals();
	void StepDone(int32 GoalIndex);
	void NextStepFor(int32 GoalIndex);
	void CompleteGoal(int32 GoalIndex);

	FString HabitsIntro() const;
	void ShowHabits(const FString& Intro);
	void DoHabit(int32 Index);
	void NewHabit();
	void RemoveHabitMenu();

	void StartReflect();
	void StartBreathing();
	void FinishBreathing();

	URiftSaveGame* Save = nullptr;
	FRewardFn Reward;
	TFunction<void()> PersistFn;

	bool bOpen = false;
	FText Line;
	TArray<FChoice> Choices;
	TFunction<void(const FString&)> TextHandler;
	FText TextHint;
	int32 Version = 0;
	int32 TalkPulses = 0;

	FCoachGoal Draft;
	bool bNudged = false;

	bool bBreathing = false;
	float BreathTime = 0.0f;
	int32 LastBreathKey = -1;
	int32 LastReflectPrompt = -1;
};
