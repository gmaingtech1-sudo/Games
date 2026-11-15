#pragma once

#include "CoreMinimal.h"

enum class EHackPhase : uint8
{
	Inactive,
	Showing,  // the rift flashes its glyph, one node at a time
	Input,    // the player traces it back from memory
	Result
};

/**
 * Glyph hacking: memorise a sequence of nodes on a 3x3 grid, then tap it back
 * before time runs out. Longer glyphs for higher-level and enemy rifts.
 */
class RIFTCOACH_API FRiftHack
{
public:
	static constexpr int32 NumNodes = 9;

	void Start(int32 Length);
	void Tick(float DeltaSeconds);
	void Press(int32 Node);
	void Cancel() { Phase = EHackPhase::Inactive; }

	EHackPhase GetPhase() const { return Phase; }
	int32 GetLength() const { return Sequence.Num(); }
	int32 GetCorrect() const { return Correct; }
	float GetTimeLeft() const { return FMath::Max(0.0f, Timer); }

	/** Node shown lit during Showing, or -1. */
	int32 GetShownNode() const;
	/** Flash feedback after a press: node, and whether it was right. */
	int32 GetFlashNode() const { return FlashTimer > 0.0f ? FlashNode : -1; }
	bool WasFlashGood() const { return bFlashGood; }
	bool IsPerfect() const { return Correct == Sequence.Num() && Sequence.Num() > 0; }
	FString GetStatus() const;

	/** Called once, the moment a hack ends: (correct, total). */
	TFunction<void(int32, int32)> OnFinished;

private:
	void Finish();

	EHackPhase Phase = EHackPhase::Inactive;
	TArray<int32> Sequence;
	int32 Correct = 0;
	float Timer = 0.0f;
	float ShowClock = 0.0f;
	int32 FlashNode = -1;
	bool bFlashGood = false;
	float FlashTimer = 0.0f;
};
