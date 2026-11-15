#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "RiftReticle.generated.h"

class UStaticMeshComponent;

/** A ring lying on the detected surface, showing where a rift or Sage would go. */
UCLASS()
class RIFTCOACH_API ARiftReticle : public AActor
{
	GENERATED_BODY()

public:
	ARiftReticle();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TArray<TObjectPtr<UStaticMeshComponent>> Dots;
	UPROPERTY() TObjectPtr<UMaterialInterface> FallbackMaterial;
	float Time = 0.0f;
};
