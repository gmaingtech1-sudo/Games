#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "RiftPawn.generated.h"

class UCameraComponent;

/** The phone. In AR the tracking system moves the camera; on a desktop you drag to look. */
UCLASS()
class RIFTCOACH_API ARiftPawn : public APawn
{
	GENERATED_BODY()

public:
	ARiftPawn();

	void SetDesktopMode(bool bDesktop);
	UCameraComponent* GetCamera() const { return Camera; }

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> Camera;
};
