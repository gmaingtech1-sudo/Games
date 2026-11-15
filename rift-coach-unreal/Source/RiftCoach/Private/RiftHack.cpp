#include "RiftHack.h"

namespace
{
	constexpr float StepOn = 0.55f;
	constexpr float StepGap = 0.18f;
	constexpr float LeadIn = 0.6f;
	constexpr float ResultHold = 2.0f;
}

void FRiftHack::Start(int32 Length)
{
	Sequence.Reset();
	int32 Last = -1;
	for (int32 i = 0; i < Length; ++i)
	{
		int32 Node;
		do { Node = FMath::RandRange(0, NumNodes - 1); } while (Node == Last);
		Sequence.Add(Node);
		Last = Node;
	}
	Correct = 0;
	ShowClock = 0.0f;
	FlashTimer = 0.0f;
	Phase = EHackPhase::Showing;
}

int32 FRiftHack::GetShownNode() const
{
	if (Phase != EHackPhase::Showing)
	{
		return -1;
	}
	const float T = ShowClock - LeadIn;
	if (T < 0.0f)
	{
		return -1;
	}
	const int32 Step = FMath::FloorToInt(T / (StepOn + StepGap));
	const float Within = T - Step * (StepOn + StepGap);
	return (Sequence.IsValidIndex(Step) && Within < StepOn) ? Sequence[Step] : -1;
}

void FRiftHack::Tick(float DeltaSeconds)
{
	FlashTimer -= DeltaSeconds;

	switch (Phase)
	{
	case EHackPhase::Showing:
		ShowClock += DeltaSeconds;
		if (ShowClock >= LeadIn + Sequence.Num() * (StepOn + StepGap))
		{
			Phase = EHackPhase::Input;
			Timer = 3.0f + 1.6f * Sequence.Num();
		}
		break;

	case EHackPhase::Input:
		Timer -= DeltaSeconds;
		if (Timer <= 0.0f)
		{
			Finish();
		}
		break;

	case EHackPhase::Result:
		Timer -= DeltaSeconds;
		if (Timer <= 0.0f)
		{
			Phase = EHackPhase::Inactive;
		}
		break;

	default:
		break;
	}
}

void FRiftHack::Press(int32 Node)
{
	if (Phase != EHackPhase::Input || !Sequence.IsValidIndex(Correct))
	{
		return;
	}
	FlashNode = Node;
	FlashTimer = 0.25f;
	bFlashGood = Sequence[Correct] == Node;
	if (!bFlashGood)
	{
		Finish();
		return;
	}
	++Correct;
	if (Correct == Sequence.Num())
	{
		Finish();
	}
}

void FRiftHack::Finish()
{
	Phase = EHackPhase::Result;
	Timer = ResultHold;
	if (OnFinished)
	{
		// Copy first: the callback may replace OnFinished.
		TFunction<void(int32, int32)> Callback = OnFinished;
		Callback(Correct, Sequence.Num());
	}
}

FString FRiftHack::GetStatus() const
{
	switch (Phase)
	{
	case EHackPhase::Showing:
		return FString::Printf(TEXT("Memorise the glyph (%d nodes)"), Sequence.Num());
	case EHackPhase::Input:
		return FString::Printf(TEXT("Trace it back: %d / %d     %.1fs"), Correct, Sequence.Num(), GetTimeLeft());
	case EHackPhase::Result:
		if (IsPerfect())
		{
			return TEXT("PERFECT HACK");
		}
		return Correct > 0 ? FString::Printf(TEXT("Partial hack: %d of %d"), Correct, Sequence.Num()) : FString(TEXT("Hack failed"));
	default:
		return FString();
	}
}
