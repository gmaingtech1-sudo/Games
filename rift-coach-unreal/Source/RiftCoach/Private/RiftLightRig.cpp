#include "RiftLightRig.h"
#include "ARBlueprintLibrary.h"
#include "ARLightEstimate.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/TextureCube.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr float KeyLux = 3.5f;
	constexpr float AmbientIntensity = 1.0f;
}

ARiftLightRig::ARiftLightRig()
{
	PrimaryActorTick.bCanEverTick = true;

	static ConstructorHelpers::FObjectFinder<UTextureCube> Cubemap(TEXT("/Engine/MapTemplates/Sky/DaylightAmbientCubemap.DaylightAmbientCubemap"));
	AmbientCubemap = Cubemap.Object;

	Key = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Key"));
	RootComponent = Key;
	Key->SetMobility(EComponentMobility::Movable);
	Key->SetIntensity(KeyLux);
	Key->bUseTemperature = true;
	Key->SetTemperature(6500.0f);
	Key->SetCastShadows(true);
	Key->SetDynamicShadowDistanceMovableLight(1500.0f);

	Ambient = CreateDefaultSubobject<USkyLightComponent>(TEXT("Ambient"));
	Ambient->SetupAttachment(Key);
	Ambient->SetMobility(EComponentMobility::Movable);
	Ambient->SourceType = ESkyLightSourceType::SLS_SpecifiedCubemap;
	Ambient->SetIntensity(AmbientIntensity);
}

void ARiftLightRig::BeginPlay()
{
	Super::BeginPlay();
	// Light from above and slightly behind the viewer, like most rooms.
	SetActorRotation(FRotator(-55.0f, 35.0f, 0.0f));
	if (AmbientCubemap)
	{
		Ambient->SetCubemap(AmbientCubemap);
	}
	Ambient->RecaptureSky();
}

void ARiftLightRig::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	float TargetBrightness = 1.0f;
	float TargetKelvin = 6500.0f;
	if (bUseAR)
	{
		if (const UARBasicLightEstimate* Estimate = Cast<UARBasicLightEstimate>(UARBlueprintLibrary::GetCurrentLightEstimate()))
		{
			// ARKit reports ~1000 lumens for a well-lit room; ARCore is normalised the same way by UE.
			TargetBrightness = FMath::Clamp(Estimate->GetAmbientIntensityLumens() / 1000.0f, 0.15f, 2.5f);
			TargetKelvin = FMath::Clamp(Estimate->GetAmbientColorTemperatureKelvin(), 2000.0f, 10000.0f);
		}
	}

	// Smooth it so lights don't flicker with camera noise.
	Brightness = FMath::FInterpTo(Brightness, TargetBrightness, DeltaSeconds, 2.0f);
	Kelvin = FMath::FInterpTo(Kelvin, TargetKelvin, DeltaSeconds, 2.0f);

	Key->SetIntensity(KeyLux * Brightness);
	Key->SetTemperature(Kelvin);
	Ambient->SetIntensity(AmbientIntensity * Brightness);
	Ambient->SetLightColor(FLinearColor::MakeFromColorTemperature(Kelvin));
}
