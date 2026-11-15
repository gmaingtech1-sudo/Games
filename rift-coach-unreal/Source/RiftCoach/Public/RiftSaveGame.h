#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "RiftSaveGame.generated.h"

/** A goal planned with the GROW model: Goal, Reality, Options, Will. */
USTRUCT()
struct FCoachGoal
{
	GENERATED_BODY()

	UPROPERTY() FString Goal;
	UPROPERTY() FString Reality;
	UPROPERTY() FString Options;
	UPROPERTY() FString NextStep;
	UPROPERTY() FString ByWhen;
	UPROPERTY() int32 CreatedDay = 0;
	UPROPERTY() int32 StepsDone = 0;
	UPROPERTY() bool bDone = false;
};

USTRUCT()
struct FCoachHabit
{
	GENERATED_BODY()

	UPROPERTY() FString Name;
	UPROPERTY() int32 Streak = 0;
	UPROPERTY() int32 Best = 0;
	UPROPERTY() int32 LastDay = -1;
};

USTRUCT()
struct FMoodEntry
{
	GENERATED_BODY()

	UPROPERTY() int32 Day = 0;
	UPROPERTY() int32 Mood = 3;
	UPROPERTY() FString Note;
};

/**
 * What survives between sessions. Rifts don't: AR coordinates reset every time the app starts,
 * so the rift war is fought fresh in whatever room you're in. Your coaching history and
 * resources carry over.
 */
UCLASS()
class RIFTCOACH_API URiftSaveGame : public USaveGame
{
	GENERATED_BODY()

public:
	UPROPERTY() FString PlayerName;

	UPROPERTY() int32 Shards = 12;
	UPROPERTY() int32 Resolve = 3;
	UPROPERTY() float Aether = 0.0f;
	UPROPERTY() int32 LifetimeResolve = 0;

	UPROPERTY() int32 LastCheckInDay = -1;
	UPROPERTY() int32 CheckInStreak = 0;
	UPROPERTY() int32 LastReflectDay = -1;
	UPROPERTY() int32 LastBreathDay = -1;

	UPROPERTY() TArray<FCoachGoal> Goals;
	UPROPERTY() TArray<FCoachHabit> Habits;
	UPROPERTY() TArray<FMoodEntry> Moods;
};
