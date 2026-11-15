#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "RiftSettings.generated.h"

class UARSessionConfig;
class USkeletalMesh;
class UAnimInstance;
class UMaterialInterface;

/**
 * Project Settings -> Game -> Rift Coach.
 * Everything works with these empty (engine shapes are used as stand-ins).
 * Fill them in to swap in photoreal assets.
 */
UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "Rift Coach"))
class RIFTCOACH_API URiftSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	/** AR session to run. Leave empty for a default world-tracking session with plane detection
	 *  and light estimation. Make your own to turn on scene-depth / people occlusion. */
	UPROPERTY(Config, EditAnywhere, Category = "AR")
	TSoftObjectPtr<UARSessionConfig> SessionConfig;

	/** A rigged, realistic dinosaur. When set, it replaces the built-in stand-in body. */
	UPROPERTY(Config, EditAnywhere, Category = "Dinosaur")
	TSoftObjectPtr<USkeletalMesh> DinoMesh;

	/** Animation Blueprint for DinoMesh. If it has a float variable called "Speed" (cm/s),
	 *  the game sets it every frame so you can blend idle and walk. */
	UPROPERTY(Config, EditAnywhere, Category = "Dinosaur")
	TSoftClassPtr<UAnimInstance> DinoAnimClass;

	UPROPERTY(Config, EditAnywhere, Category = "Dinosaur")
	float DinoMeshScale = 1.0f;

	/** Most imported meshes face +Y. Use Yaw -90 to make them face forward (+X). */
	UPROPERTY(Config, EditAnywhere, Category = "Dinosaur")
	FRotator DinoMeshRotation = FRotator::ZeroRotator;

	/** Materials need a vector parameter called "Color". Translucent / emissive ones look best. */
	UPROPERTY(Config, EditAnywhere, Category = "Look")
	TSoftObjectPtr<UMaterialInterface> PortalMaterial;

	UPROPERTY(Config, EditAnywhere, Category = "Look")
	TSoftObjectPtr<UMaterialInterface> LinkMaterial;

	UPROPERTY(Config, EditAnywhere, Category = "Look")
	TSoftObjectPtr<UMaterialInterface> FieldMaterial;

	/** How close you must physically be to a rift to hack it. */
	UPROPERTY(Config, EditAnywhere, Category = "Rules")
	float HackRangeCm = 200.0f;

	UPROPERTY(Config, EditAnywhere, Category = "Rules")
	float HackCooldownSeconds = 60.0f;

	UPROPERTY(Config, EditAnywhere, Category = "Rules")
	int32 OpenRiftCost = 4;

	UPROPERTY(Config, EditAnywhere, Category = "Rules")
	int32 ClaimCost = 3;

	UPROPERTY(Config, EditAnywhere, Category = "Rules")
	int32 MaxPortalLevel = 5;

	UPROPERTY(Config, EditAnywhere, Category = "Rules")
	float BaseLinkRangeCm = 400.0f;

	UPROPERTY(Config, EditAnywhere, Category = "Rules")
	float LinkRangePerLevelCm = 150.0f;
};
