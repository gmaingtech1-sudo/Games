#include "DinoCoach.h"
#include "RiftSettings.h"
#include "Animation/AnimInstance.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"
#include "UObject/UnrealType.h"

namespace
{
	constexpr float WalkSpeed = 70.0f;       // cm/s, an unhurried amble
	constexpr float TurnSpeed = 120.0f;      // deg/s

	// Engine basic shapes are 100 cm across, centred on their pivot.
	constexpr float S = 0.01f;
}

USceneComponent* ADinoCoach::AddPivot(const TCHAR* Name, USceneComponent* Parent, const FVector& Location)
{
	USceneComponent* Pivot = CreateDefaultSubobject<USceneComponent>(Name);
	Pivot->SetupAttachment(Parent);
	Pivot->SetRelativeLocation(Location);
	return Pivot;
}

UStaticMeshComponent* ADinoCoach::AddPart(const TCHAR* Name, USceneComponent* Parent, UStaticMesh* Mesh,
	const FVector& Location, const FVector& Scale, const FRotator& Rotation)
{
	UStaticMeshComponent* Part = CreateDefaultSubobject<UStaticMeshComponent>(Name);
	Part->SetupAttachment(Parent);
	Part->SetStaticMesh(Mesh);
	Part->SetRelativeLocation(Location);
	Part->SetRelativeRotation(Rotation);
	Part->SetRelativeScale3D(Scale);
	Part->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Part->SetGenerateOverlapEvents(false);
	return Part;
}

ADinoCoach::ADinoCoach()
{
	PrimaryActorTick.bCanEverTick = true;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereFinder(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderFinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> ConeFinder(TEXT("/Engine/BasicShapes/Cone.Cone"));
	static ConstructorHelpers::FObjectFinder<UMaterialInterface> BasicMaterial(TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	UStaticMesh* Sphere = SphereFinder.Object;
	UStaticMesh* Cylinder = CylinderFinder.Object;
	UStaticMesh* Cone = ConeFinder.Object;
	FallbackMaterial = BasicMaterial.Object;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	Skeletal = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Skeletal"));
	Skeletal->SetupAttachment(Root);
	Skeletal->SetVisibility(false);
	Skeletal->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Skeletal->SetCollisionResponseToAllChannels(ECR_Ignore);
	Skeletal->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);

	// ---- the stand-in body. Local +X is forward, feet at Z = 0. About 1.5 m tall to the crest.
	BodyRoot = AddPivot(TEXT("BodyRoot"), Root, FVector::ZeroVector);

	Torso = AddPart(TEXT("Torso"), BodyRoot, Sphere, FVector(0, 0, 64), FVector(78, 42, 46) * S);
	Torso->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Torso->SetCollisionResponseToAllChannels(ECR_Ignore);
	Torso->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
	SkinParts.Add(Torso);
	Belly = AddPart(TEXT("Belly"), BodyRoot, Sphere, FVector(6, 0, 54), FVector(62, 34, 30) * S);
	BellyParts.Add(Belly);
	SkinParts.Add(AddPart(TEXT("Hips"), BodyRoot, Sphere, FVector(-18, 0, 66), FVector(48, 40, 42) * S));

	// Hind legs swing from the hips.
	LegPivotL = AddPivot(TEXT("LegPivotL"), BodyRoot, FVector(-12, 17, 58));
	LegPivotR = AddPivot(TEXT("LegPivotR"), BodyRoot, FVector(-12, -17, 58));
	for (USceneComponent* Leg : { LegPivotL.Get(), LegPivotR.Get() })
	{
		const TCHAR* Side = (Leg == LegPivotL.Get()) ? TEXT("L") : TEXT("R");
		SkinParts.Add(AddPart(*FString::Printf(TEXT("Thigh%s"), Side), Leg, Sphere, FVector(2, 0, -12), FVector(30, 20, 36) * S));
		SkinParts.Add(AddPart(*FString::Printf(TEXT("Shin%s"), Side), Leg, Cylinder, FVector(-4, 0, -36), FVector(11, 11, 34) * S, FRotator(-8, 0, 0)));
		SkinParts.Add(AddPart(*FString::Printf(TEXT("Foot%s"), Side), Leg, Sphere, FVector(6, 0, -55), FVector(26, 13, 7) * S));
	}

	// Small arms.
	ArmPivotL = AddPivot(TEXT("ArmPivotL"), BodyRoot, FVector(30, 15, 62));
	ArmPivotR = AddPivot(TEXT("ArmPivotR"), BodyRoot, FVector(30, -15, 62));
	for (USceneComponent* Arm : { ArmPivotL.Get(), ArmPivotR.Get() })
	{
		const TCHAR* Side = (Arm == ArmPivotL.Get()) ? TEXT("L") : TEXT("R");
		SkinParts.Add(AddPart(*FString::Printf(TEXT("Arm%s"), Side), Arm, Cylinder, FVector(5, 0, -10), FVector(6, 6, 24) * S, FRotator(-30, 0, 0)));
	}

	// Neck rises forward from the chest.
	NeckPivot = AddPivot(TEXT("NeckPivot"), BodyRoot, FVector(30, 0, 76));
	SkinParts.Add(AddPart(TEXT("Neck"), NeckPivot, Cylinder, FVector(12, 0, 17), FVector(17, 17, 44) * S, FRotator(-35, 0, 0)));

	HeadPivot = AddPivot(TEXT("HeadPivot"), NeckPivot, FVector(26, 0, 36));
	SkinParts.Add(AddPart(TEXT("Head"), HeadPivot, Sphere, FVector(8, 0, 0), FVector(32, 20, 21) * S));
	SkinParts.Add(AddPart(TEXT("Snout"), HeadPivot, Sphere, FVector(25, 0, -4), FVector(24, 14, 11) * S));
	JawPivot = AddPivot(TEXT("JawPivot"), HeadPivot, FVector(4, 0, -8));
	BellyParts.Add(AddPart(TEXT("Jaw"), JawPivot, Sphere, FVector(16, 0, -1), FVector(26, 12, 6) * S));

	// The Parasaurolophus crest: a long hollow tube sweeping back from the head.
	CrestParts.Add(AddPart(TEXT("Crest"), HeadPivot, Cylinder, FVector(-20, 0, 22), FVector(7.5f, 6, 58) * S, FRotator(58, 0, 0)));
	CrestParts.Add(AddPart(TEXT("CrestTip"), HeadPivot, Sphere, FVector(-44, 0, 38), FVector(9, 7, 9) * S));

	EyeParts.Add(AddPart(TEXT("EyeL"), HeadPivot, Sphere, FVector(14, 9.5f, 5), FVector(4.5f) * S));
	EyeParts.Add(AddPart(TEXT("EyeR"), HeadPivot, Sphere, FVector(14, -9.5f, 5), FVector(4.5f) * S));

	// The tail is a chain of pivots, so the sway ripples down it.
	USceneComponent* Parent = BodyRoot;
	FVector PivotAt(-36, 0, 66);
	const FVector Sizes[] = { FVector(46, 30, 30), FVector(40, 20, 20), FVector(36, 12, 12), FVector(30, 7, 7) };
	for (int32 i = 0; i < 4; ++i)
	{
		USceneComponent* Pivot = AddPivot(*FString::Printf(TEXT("TailPivot%d"), i), Parent, PivotAt);
		SkinParts.Add(AddPart(*FString::Printf(TEXT("Tail%d"), i), Pivot, Sphere, FVector(-Sizes[i].X * 0.45f, 0, 0), Sizes[i] * S));
		TailPivots.Add(Pivot);
		Parent = Pivot;
		PivotAt = FVector(-Sizes[i].X * 0.8f, 0, -2.5f);
	}
}

void ADinoCoach::BeginPlay()
{
	Super::BeginPlay();

	const URiftSettings* Settings = GetDefault<URiftSettings>();
	if (USkeletalMesh* Mesh = Settings->DinoMesh.LoadSynchronous())
	{
		Skeletal->SetSkeletalMeshAsset(Mesh);
		Skeletal->SetRelativeRotation(Settings->DinoMeshRotation);
		Skeletal->SetRelativeScale3D(FVector(Settings->DinoMeshScale));
		if (UClass* AnimClass = Settings->DinoAnimClass.LoadSynchronous())
		{
			Skeletal->SetAnimInstanceClass(AnimClass);
		}
		Skeletal->SetVisibility(true);
		BodyRoot->SetVisibility(false, true);
		Torso->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		bUsingSkeletal = true;
		return;
	}

	auto Paint = [this](const TArray<TObjectPtr<UStaticMeshComponent>>& Parts, const FLinearColor& Color)
	{
		UMaterialInstanceDynamic* Mat = UMaterialInstanceDynamic::Create(FallbackMaterial, this);
		Mat->SetVectorParameterValue(TEXT("Color"), Color);
		for (UStaticMeshComponent* Part : Parts)
		{
			Part->SetMaterial(0, Mat);
		}
	};
	Paint(SkinParts, FLinearColor(0.16f, 0.22f, 0.11f));   // mossy olive
	Paint(BellyParts, FLinearColor(0.45f, 0.40f, 0.28f));  // pale sand
	Paint(CrestParts, FLinearColor(0.62f, 0.22f, 0.07f));  // burnt orange
	Paint(EyeParts, FLinearColor(0.02f, 0.015f, 0.01f));

	BodyRoot->SetRelativeScale3D(FVector(0.01f));
}

void ADinoCoach::WalkTo(const FVector& FloorPoint)
{
	WalkTarget = FloorPoint;
	bWalking = true;
}

void ADinoCoach::SetBreathing(bool bInGuided, float InLevel)
{
	bGuidedBreath = bInGuided;
	GuidedLevel = InLevel;
}

void ADinoCoach::UpdateSkeletalAnim(float Speed)
{
	UAnimInstance* Anim = Skeletal->GetAnimInstance();
	if (!Anim)
	{
		return;
	}
	// Blueprint "Float" variables are doubles in UE5; support both.
	if (FDoubleProperty* DoubleProp = FindFProperty<FDoubleProperty>(Anim->GetClass(), TEXT("Speed")))
	{
		DoubleProp->SetPropertyValue_InContainer(Anim, Speed);
	}
	else if (FFloatProperty* FloatProp = FindFProperty<FFloatProperty>(Anim->GetClass(), TEXT("Speed")))
	{
		FloatProp->SetPropertyValue_InContainer(Anim, Speed);
	}
}

void ADinoCoach::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Time += DeltaSeconds;
	NodTime += DeltaSeconds;

	// ---- movement
	FVector Location = GetActorLocation();
	float DesiredYaw = GetActorRotation().Yaw;
	float TargetSpeed = 0.0f;

	if (bWalking)
	{
		FVector To = WalkTarget - Location;
		To.Z = 0.0f;
		const float Dist = To.Size();
		if (Dist < 6.0f)
		{
			bWalking = false;
		}
		else
		{
			DesiredYaw = To.Rotation().Yaw;
			// Only step forward once roughly facing the way, like a real animal.
			const float YawError = FMath::Abs(FMath::FindDeltaAngleDegrees(GetActorRotation().Yaw, DesiredYaw));
			TargetSpeed = YawError < 45.0f ? FMath::Min(WalkSpeed, Dist * 1.5f) : 0.0f;
		}
	}
	else
	{
		// Turn the whole body towards you when you wander too far round the side.
		FVector ToLook = LookTarget - Location;
		ToLook.Z = 0.0f;
		if (!ToLook.IsNearlyZero())
		{
			const float LookYaw = ToLook.Rotation().Yaw;
			if (FMath::Abs(FMath::FindDeltaAngleDegrees(GetActorRotation().Yaw, LookYaw)) > 50.0f)
			{
				DesiredYaw = LookYaw;
			}
		}
	}

	CurrentSpeed = FMath::FInterpTo(CurrentSpeed, TargetSpeed, DeltaSeconds, 4.0f);
	FRotator Rot = GetActorRotation();
	Rot.Yaw = FMath::FixedTurn(Rot.Yaw, DesiredYaw, TurnSpeed * DeltaSeconds);
	SetActorRotation(Rot);
	if (CurrentSpeed > 0.5f)
	{
		SetActorLocation(Location + Rot.Vector() * CurrentSpeed * DeltaSeconds);
	}

	if (bUsingSkeletal)
	{
		UpdateSkeletalAnim(CurrentSpeed);
		return;
	}

	// ---- procedural animation for the stand-in body
	AppearT = FMath::Min(1.0f, AppearT + DeltaSeconds / 0.9f);
	const float Appear = 1.0f - FMath::Pow(1.0f - AppearT, 3.0f);
	BodyRoot->SetRelativeScale3D(FVector(FMath::Max(Appear, 0.01f)));

	const float WalkAmount = FMath::Clamp(CurrentSpeed / WalkSpeed, 0.0f, 1.0f);
	WalkPhase += DeltaSeconds * (1.5f + 3.5f * WalkAmount);

	// Breathing: slow and subtle normally, deep when guiding you.
	const float Breath = bGuidedBreath ? GuidedLevel : (0.5f + 0.5f * FMath::Sin(Time * 1.4f)) * 0.25f;
	const float Chest = 1.0f + 0.12f * Breath;
	Torso->SetRelativeScale3D(FVector(78 * S, 42 * S * Chest, 46 * S * Chest));
	Belly->SetRelativeScale3D(FVector(62 * S, 34 * S * Chest, 30 * S * Chest));

	// Gait: legs swing opposite, the body bobs twice per stride.
	const float Swing = FMath::Sin(WalkPhase * 2.0f) * 28.0f * WalkAmount;
	LegPivotL->SetRelativeRotation(FRotator(Swing, 0, 0));
	LegPivotR->SetRelativeRotation(FRotator(-Swing, 0, 0));
	ArmPivotL->SetRelativeRotation(FRotator(-Swing * 0.4f + 5.0f * FMath::Sin(Time), 0, 0));
	ArmPivotR->SetRelativeRotation(FRotator(Swing * 0.4f + 5.0f * FMath::Sin(Time + 1.0f), 0, 0));
	const float Bob = FMath::Abs(FMath::Sin(WalkPhase * 2.0f)) * 3.0f * WalkAmount;
	BodyRoot->SetRelativeLocation(FVector(0, 0, Bob));

	// Tail sways, more when walking, rippling down the chain.
	for (int32 i = 0; i < TailPivots.Num(); ++i)
	{
		const float Amp = (4.0f + 6.0f * WalkAmount) * (1.0f + i * 0.35f);
		const float Yaw = FMath::Sin(Time * (1.3f + 2.0f * WalkAmount) - i * 0.7f) * Amp;
		const float Lift = 2.0f * FMath::Sin(Time * 0.9f - i * 0.5f);
		TailPivots[i]->SetRelativeRotation(FRotator(Lift - (i == 0 ? 4.0f : 2.0f), Yaw, 0));
	}

	// Head follows the phone, within what a neck can do.
	const FVector HeadLocal = GetActorTransform().InverseTransformPosition(LookTarget) - FVector(56, 0, 112);
	FRotator Want = HeadLocal.IsNearlyZero() ? FRotator::ZeroRotator : HeadLocal.Rotation();
	Want.Yaw = FMath::Clamp(Want.Yaw, -65.0f, 65.0f);
	Want.Pitch = FMath::Clamp(Want.Pitch, -30.0f, 35.0f);
	Want.Roll = 6.0f * FMath::Sin(Time * 0.6f); // a curious head-tilt
	if (bWalking)
	{
		Want = FRotator(-8.0f, 0.0f, 0.0f);
	}
	HeadRot = FMath::RInterpTo(HeadRot, Want, DeltaSeconds, 3.0f);

	// A nod when talking.
	const float Nod = NodTime < 0.6f ? FMath::Sin(NodTime / 0.6f * PI * 2.0f) * 8.0f : 0.0f;
	HeadPivot->SetRelativeRotation(FRotator(HeadRot.Pitch * 0.6f - Nod, HeadRot.Yaw * 0.6f, HeadRot.Roll));
	NeckPivot->SetRelativeRotation(FRotator(HeadRot.Pitch * 0.4f, HeadRot.Yaw * 0.4f, 0.0f));

	// Jaw moves while talking; eyes blink.
	const float Talk = NodTime < 1.4f ? FMath::Abs(FMath::Sin(NodTime * 14.0f)) * 10.0f * (1.0f - NodTime / 1.4f) : 0.0f;
	JawPivot->SetRelativeRotation(FRotator(-Talk, 0, 0));

	BlinkTimer -= DeltaSeconds;
	const bool bBlink = BlinkTimer < 0.12f;
	if (BlinkTimer <= 0.0f)
	{
		BlinkTimer = FMath::FRandRange(2.5f, 6.0f);
	}
	for (UStaticMeshComponent* Eye : EyeParts)
	{
		Eye->SetRelativeScale3D(FVector(4.5f * S, 4.5f * S, (bBlink ? 0.6f : 4.5f) * S));
	}
}
