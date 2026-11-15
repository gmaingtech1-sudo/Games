#include "RiftPortal.h"
#include "RiftSettings.h"
#include "Components/BoxComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr int32 NumBeads = 26;
	constexpr float RingHeight = 75.0f;   // cm above the floor
	constexpr float RingRadiusY = 44.0f;
	constexpr float RingRadiusZ = 68.0f;
	const FName ColorParam(TEXT("Color"));

	void MakeDecorative(UStaticMeshComponent* Mesh)
	{
		Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Mesh->SetGenerateOverlapEvents(false);
		Mesh->SetCastShadow(false);
	}
}

ARiftPortal::ARiftPortal()
{
	PrimaryActorTick.bCanEverTick = true;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereMesh(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	static ConstructorHelpers::FObjectFinder<UMaterialInterface> BasicMaterial(TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	FallbackMaterial = BasicMaterial.Object;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	// An invisible box that catches taps. Only the Visibility channel is blocked.
	TapBox = CreateDefaultSubobject<UBoxComponent>(TEXT("TapBox"));
	TapBox->SetupAttachment(Root);
	TapBox->SetRelativeLocation(FVector(0.0f, 0.0f, RingHeight));
	TapBox->SetBoxExtent(FVector(35.0f, RingRadiusY + 15.0f, RingRadiusZ + 15.0f));
	TapBox->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	TapBox->SetCollisionResponseToAllChannels(ECR_Ignore);
	TapBox->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
	TapBox->SetGenerateOverlapEvents(false);

	RingPivot = CreateDefaultSubobject<USceneComponent>(TEXT("RingPivot"));
	RingPivot->SetupAttachment(Root);
	RingPivot->SetRelativeLocation(FVector(0.0f, 0.0f, RingHeight));

	Horizon = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Horizon"));
	Horizon->SetupAttachment(RingPivot);
	Horizon->SetStaticMesh(SphereMesh.Object);
	Horizon->SetRelativeScale3D(FVector(0.03f, RingRadiusY * 0.019f, RingRadiusZ * 0.019f));
	MakeDecorative(Horizon);

	for (int32 i = 0; i < NumBeads; ++i)
	{
		UStaticMeshComponent* Bead = CreateDefaultSubobject<UStaticMeshComponent>(*FString::Printf(TEXT("Bead%d"), i));
		Bead->SetupAttachment(RingPivot);
		Bead->SetStaticMesh(SphereMesh.Object);
		const float Angle = 2.0f * PI * i / NumBeads;
		Bead->SetRelativeLocation(FVector(0.0f, FMath::Cos(Angle) * RingRadiusY, FMath::Sin(Angle) * RingRadiusZ));
		Bead->SetRelativeScale3D(FVector(0.075f));
		MakeDecorative(Bead);
		Beads.Add(Bead);
	}

	// A scorched disc on the floor where reality tore.
	Scorch = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Scorch"));
	Scorch->SetupAttachment(Root);
	Scorch->SetStaticMesh(CylinderMesh.Object);
	Scorch->SetRelativeLocation(FVector(0.0f, 0.0f, 0.6f));
	Scorch->SetRelativeScale3D(FVector(0.75f, 0.75f, 0.01f));
	MakeDecorative(Scorch);

	Glow = CreateDefaultSubobject<UPointLightComponent>(TEXT("Glow"));
	Glow->SetupAttachment(RingPivot);
	Glow->SetRelativeLocation(FVector(25.0f, 0.0f, 0.0f));
	Glow->IntensityUnits = ELightUnits::Candelas;
	Glow->SetIntensity(3.0f);
	Glow->SetAttenuationRadius(260.0f);
	Glow->SetCastShadows(false);
}

void ARiftPortal::BeginPlay()
{
	Super::BeginPlay();

	UMaterialInterface* Mat = GetDefault<URiftSettings>()->PortalMaterial.LoadSynchronous();
	if (!Mat)
	{
		Mat = FallbackMaterial;
	}
	RingMat = UMaterialInstanceDynamic::Create(Mat, this);
	HorizonMat = UMaterialInstanceDynamic::Create(Mat, this);
	ScorchMat = UMaterialInstanceDynamic::Create(FallbackMaterial, this);

	for (UStaticMeshComponent* Bead : Beads)
	{
		Bead->SetMaterial(0, RingMat);
	}
	Horizon->SetMaterial(0, HorizonMat);
	Scorch->SetMaterial(0, ScorchMat);

	RingPivot->SetRelativeScale3D(FVector(1.0f, 0.01f, 0.01f));
	ApplyColors();
}

void ARiftPortal::InitPortal(int32 InId, ERiftFaction InFaction, const FString& InName)
{
	Id = InId;
	PortalName = InName;
	Faction = InFaction;
	Level = 1;
	Charge = 1.0f;
	ApplyColors();
}

void ARiftPortal::SetFaction(ERiftFaction NewFaction)
{
	Faction = NewFaction;
	if (Faction == ERiftFaction::Neutral)
	{
		Level = 1;
	}
	ApplyColors();
}

void ARiftPortal::SetSelected(bool bInSelected)
{
	bSelected = bInSelected;
	ApplyColors();
}

void ARiftPortal::AddCharge(float Delta)
{
	Charge = FMath::Clamp(Charge + Delta, 0.0f, 1.0f);
	ApplyColors();
}

void ARiftPortal::Upgrade()
{
	Level = FMath::Min(Level + 1, GetDefault<URiftSettings>()->MaxPortalLevel);
	Charge = 1.0f;
	ApplyColors();
}

FVector ARiftPortal::GetBeamPoint() const
{
	return GetActorLocation() + FVector(0.0f, 0.0f, RingHeight);
}

float ARiftPortal::GetLinkRange() const
{
	const URiftSettings* S = GetDefault<URiftSettings>();
	return S->BaseLinkRangeCm + S->LinkRangePerLevelCm * (Level - 1);
}

bool ARiftPortal::IsHackReady(double Now) const
{
	return GetHackCooldownLeft(Now) <= 0.0f;
}

float ARiftPortal::GetHackCooldownLeft(double Now) const
{
	return FMath::Max(0.0f, static_cast<float>(LastHackTime + GetDefault<URiftSettings>()->HackCooldownSeconds - Now));
}

void ARiftPortal::ApplyColors()
{
	if (!RingMat)
	{
		return;
	}
	FLinearColor Base = Rift::FactionColor(Faction);
	if (bSelected)
	{
		Base = FMath::Lerp(Base, FLinearColor::White, 0.35f);
	}
	const float Energy = 0.35f + 0.65f * Charge;
	RingMat->SetVectorParameterValue(ColorParam, Base * Energy);
	HorizonMat->SetVectorParameterValue(ColorParam, Base * (0.25f + 0.3f * Charge));
	ScorchMat->SetVectorParameterValue(ColorParam, FLinearColor(0.02f, 0.02f, 0.025f));
	Glow->SetLightColor(Base);
}

void ARiftPortal::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Time += DeltaSeconds;

	// Tear open over ~1.2 s with an ease-out.
	OpenAmount = FMath::Min(1.0f, OpenAmount + DeltaSeconds / 1.2f);
	const float Open = 1.0f - FMath::Pow(1.0f - OpenAmount, 3.0f);
	RingPivot->SetRelativeScale3D(FVector(1.0f, FMath::Max(Open, 0.01f), FMath::Max(Open, 0.01f)));

	// A weak rift flickers.
	const float Flicker = Charge < 0.3f ? (0.6f + 0.4f * FMath::Abs(FMath::Sin(Time * 17.0f))) : 1.0f;

	for (int32 i = 0; i < Beads.Num(); ++i)
	{
		const float Pulse = 0.5f + 0.5f * FMath::Sin(Time * 4.0f - i * 0.5f);
		Beads[i]->SetRelativeScale3D(FVector(0.055f + 0.03f * Pulse * (0.4f + 0.6f * Charge)));
	}

	const float Wobble = FMath::Sin(Time * 2.3f);
	Horizon->SetRelativeScale3D(FVector(0.03f + 0.012f * Wobble, RingRadiusY * (0.019f + 0.0006f * Wobble), RingRadiusZ * 0.019f));
	Horizon->SetRelativeRotation(FRotator(0.0f, 0.0f, Time * 25.0f));

	Glow->SetIntensity((2.5f + 0.8f * FMath::Sin(Time * 3.0f)) * (0.3f + 0.7f * Charge) * Open * Flicker * (bSelected ? 1.6f : 1.0f));
}
