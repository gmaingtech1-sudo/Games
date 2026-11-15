#pragma once

#include "CoreMinimal.h"
#include "RiftTypes.generated.h"

UENUM(BlueprintType)
enum class ERiftFaction : uint8
{
	Neutral,
	Wardens,
	Breachers
};

namespace Rift
{
	/** The player always fights for the Wardens. The Breachers are the rival AI. */
	constexpr ERiftFaction PlayerFaction = ERiftFaction::Wardens;
	constexpr ERiftFaction RivalFaction = ERiftFaction::Breachers;

	inline FLinearColor FactionColor(ERiftFaction Faction)
	{
		switch (Faction)
		{
		case ERiftFaction::Wardens:   return FLinearColor(0.05f, 0.85f, 0.75f);
		case ERiftFaction::Breachers: return FLinearColor(0.95f, 0.10f, 0.65f);
		default:                      return FLinearColor(0.60f, 0.60f, 0.66f);
		}
	}

	inline const TCHAR* FactionName(ERiftFaction Faction)
	{
		switch (Faction)
		{
		case ERiftFaction::Wardens:   return TEXT("Warden");
		case ERiftFaction::Breachers: return TEXT("Breacher");
		default:                      return TEXT("Neutral");
		}
	}

	/** Local calendar day number. Used for streaks and once-a-day rewards. */
	inline int32 Today()
	{
		return static_cast<int32>(FDateTime::Now().GetTicks() / ETimespan::TicksPerDay);
	}
}
