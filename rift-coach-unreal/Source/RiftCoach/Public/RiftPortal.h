#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "RiftTypes.h"
#include "RiftPortal.generated.h"

class UBoxComponent;
class UPointLightComponent;
class UStaticMeshComponent;
class UMaterialInterface;
class UMaterialInstanceDynamic;

/** A portal rift standing on a real surface: an oval ring of light around a shimmering event horizon. */
UCLASS()
class RIFTCOACH_API ARiftPortal : public AActor
{
	GENERATED_BODY()

public:
	ARiftPortal();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	void InitPortal(int32 InId, ERiftFaction InFaction, const FString& InName);
	void SetFaction(ERiftFaction NewFaction);
	void SetSelected(bool bInSelected);
	void AddCharge(float Delta);
	void Upgrade();

	int32 GetId() const { return Id; }
	ERiftFaction GetFaction() const { return Faction; }
	const FString& GetPortalName() const { return PortalName; }
	int32 GetLevel() const { return Level; }
	float GetCharge() const { return Charge; }

	/** Where links attach: the middle of the ring. */
	FVector GetBeamPoint() const;
	float GetLinkRange() const;

	bool IsHackReady(double Now) const;
	float GetHackCooldownLeft(double Now) const;
	void MarkHacked(double Now) { LastHackTime = Now; }

private:
	void ApplyColors();

	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> TapBox;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> RingPivot;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Horizon;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Scorch;
	UPROPERTY(VisibleAnywhere) TArray<TObjectPtr<UStaticMeshComponent>> Beads;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> Glow;

	UPROPERTY() TObjectPtr<UMaterialInterface> FallbackMaterial;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> RingMat;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> HorizonMat;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> ScorchMat;

	int32 Id = 0;
	ERiftFaction Faction = ERiftFaction::Neutral;
	FString PortalName;
	int32 Level = 1;
	float Charge = 1.0f;
	double LastHackTime = -1.0e9;
	bool bSelected = false;

	float Time = 0.0f;
	float OpenAmount = 0.0f;
};
