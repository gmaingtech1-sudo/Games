#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "RiftLightRig.generated.h"

class UDirectionalLightComponent;
class USkyLightComponent;
class UTextureCube;

/**
 * Lights the virtual objects to match the real room. In AR it reads the camera's light
 * estimate every frame (brightness and colour temperature), so Sage and the rifts get
 * dimmer and warmer under a lamp and brighter and cooler by a window.
 */
UCLASS()
class RIFTCOACH_API ARiftLightRig : public AActor
{
	GENERATED_BODY()

public:
	ARiftLightRig();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	bool bUseAR = false;

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UDirectionalLightComponent> Key;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USkyLightComponent> Ambient;
	UPROPERTY() TObjectPtr<UTextureCube> AmbientCubemap;

	float Brightness = 1.0f;
	float Kelvin = 6500.0f;
};
