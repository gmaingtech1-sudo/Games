#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "RiftTypes.h"
#include "RiftField.generated.h"

class UProceduralMeshComponent;
class UMaterialInterface;

/** A control field: a triangle of energy laid over the floor between three linked rifts. */
UCLASS()
class RIFTCOACH_API ARiftField : public AActor
{
	GENERATED_BODY()

public:
	ARiftField();

	void Setup(const FVector& A, const FVector& B, const FVector& C, ERiftFaction Faction);
	virtual void Tick(float DeltaSeconds) override;

	/** Floor area covered, in square metres. */
	float GetAreaM2() const { return AreaM2; }

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UProceduralMeshComponent> Mesh;
	UPROPERTY() TObjectPtr<UMaterialInterface> FallbackMaterial;

	float AreaM2 = 0.0f;
	float Time = 0.0f;
	float BaseZ = 0.0f;
};
