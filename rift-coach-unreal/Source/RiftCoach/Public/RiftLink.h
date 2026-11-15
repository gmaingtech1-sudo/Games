#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "RiftTypes.h"
#include "RiftLink.generated.h"

class UStaticMeshComponent;
class UMaterialInterface;

/** A beam of light joining two rifts, with energy pulses running along it. */
UCLASS()
class RIFTCOACH_API ARiftLink : public AActor
{
	GENERATED_BODY()

public:
	ARiftLink();

	void Setup(const FVector& InStart, const FVector& InEnd, ERiftFaction Faction);
	virtual void Tick(float DeltaSeconds) override;

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Beam;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> PulseA;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> PulseB;
	UPROPERTY() TObjectPtr<UMaterialInterface> FallbackMaterial;

	FVector Start = FVector::ZeroVector;
	FVector End = FVector::ZeroVector;
	float Phase = 0.0f;
	float Grow = 0.0f;
};
