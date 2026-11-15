#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "RiftTypes.h"
#include "RiftNetworkSubsystem.generated.h"

class ARiftPortal;
class ARiftLink;
class ARiftField;

USTRUCT()
struct FRiftLinkRecord
{
	GENERATED_BODY()

	UPROPERTY() TObjectPtr<ARiftPortal> A;
	UPROPERTY() TObjectPtr<ARiftPortal> B;
	UPROPERTY() TObjectPtr<ARiftLink> Actor;
	UPROPERTY() ERiftFaction Faction = ERiftFaction::Neutral;
};

USTRUCT()
struct FRiftFieldRecord
{
	GENERATED_BODY()

	UPROPERTY() TObjectPtr<ARiftPortal> A;
	UPROPERTY() TObjectPtr<ARiftPortal> B;
	UPROPERTY() TObjectPtr<ARiftPortal> C;
	UPROPERTY() TObjectPtr<ARiftField> Actor;
	UPROPERTY() ERiftFaction Faction = ERiftFaction::Neutral;
	UPROPERTY() float AreaM2 = 0.0f;
};

DECLARE_MULTICAST_DELEGATE_OneParam(FOnRiftNews, const FString& /*Message*/);

/**
 * Owns every rift, link and field in the room, enforces the linking rules
 * (same faction, in range, no crossing links), closes triangles into fields,
 * pays out Aether, and runs the rival Breachers.
 */
UCLASS()
class RIFTCOACH_API URiftNetworkSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool DoesSupportWorldType(const EWorldType::Type WorldType) const override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	ARiftPortal* SpawnPortal(const FVector& FloorLocation, const FVector& FaceToward, ERiftFaction Faction);

	bool CanLink(const ARiftPortal* A, const ARiftPortal* B, FString& OutReason) const;

	/** Returns how many control fields the new link closed, or -1 if it couldn't be made. */
	int32 CreateLink(ARiftPortal* A, ARiftPortal* B);

	/** Changes hands. Any links and fields touching the rift collapse. */
	void SetPortalFaction(ARiftPortal* Portal, ERiftFaction NewFaction);

	const TArray<TObjectPtr<ARiftPortal>>& GetPortals() const { return Portals; }
	int32 CountPortals(ERiftFaction Faction) const;
	int32 CountLinks(ERiftFaction Faction) const;
	int32 CountFields(ERiftFaction Faction) const;
	float GetFieldArea(ERiftFaction Faction) const;
	ARiftPortal* FindNearestPortal(const FVector& Location, float& OutDistance) const;

	/** Aether the player's network earned since the last call. */
	float ConsumeAether();

	/** The Breachers wake up once the player has opened their first rift. */
	void SetRivalsActive(bool bActive) { bRivalsActive = bActive; }

	bool bUseAR = false;
	float FallbackFloorZ = 0.0f;
	FVector ViewerLocation = FVector::ZeroVector;
	FOnRiftNews OnNews;

private:
	bool HasLink(const ARiftPortal* A, const ARiftPortal* B) const;
	bool HasField(const ARiftPortal* A, const ARiftPortal* B, const ARiftPortal* C) const;
	int32 CloseFields(ARiftPortal* A, ARiftPortal* B, ERiftFaction Faction);
	void RemoveConnections(ARiftPortal* Portal);
	bool FindSpawnSpot(FVector& Out) const;
	void RivalTurn();
	FString MakePortalName();
	void Prune();

	UPROPERTY() TArray<TObjectPtr<ARiftPortal>> Portals;
	UPROPERTY() TArray<FRiftLinkRecord> Links;
	UPROPERTY() TArray<FRiftFieldRecord> Fields;

	int32 NextId = 1;
	float AetherOwed = 0.0f;
	float RivalTimer = 45.0f;
	bool bRivalsActive = false;
	TSet<FString> UsedNames;
};
