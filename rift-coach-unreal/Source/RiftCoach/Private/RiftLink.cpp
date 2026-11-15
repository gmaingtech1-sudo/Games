#include "RiftLink.h"
#include "RiftSettings.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

ARiftLink::ARiftLink()
{
	PrimaryActorTick.bCanEverTick = true;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereMesh(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	static ConstructorHelpers::FObjectFinder<UMaterialInterface> BasicMaterial(TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	FallbackMaterial = BasicMaterial.Object;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	auto MakePart = [this](const TCHAR* Name, UStaticMesh* Mesh)
	{
		UStaticMeshComponent* Part = CreateDefaultSubobject<UStaticMeshComponent>(Name);
		Part->SetupAttachment(Root);
		Part->SetStaticMesh(Mesh);
		Part->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Part->SetCastShadow(false);
		return Part;
	};
	Beam = MakePart(TEXT("Beam"), CylinderMesh.Object);
	PulseA = MakePart(TEXT("PulseA"), SphereMesh.Object);
	PulseB = MakePart(TEXT("PulseB"), SphereMesh.Object);
	PulseA->SetWorldScale3D(FVector(0.045f));
	PulseB->SetWorldScale3D(FVector(0.03f));
}

void ARiftLink::Setup(const FVector& InStart, const FVector& InEnd, ERiftFaction Faction)
{
	Start = InStart;
	End = InEnd;

	UMaterialInterface* Mat = GetDefault<URiftSettings>()->LinkMaterial.LoadSynchronous();
	UMaterialInstanceDynamic* Dyn = UMaterialInstanceDynamic::Create(Mat ? Mat : FallbackMaterial.Get(), this);
	const FLinearColor Color = Rift::FactionColor(Faction);
	Dyn->SetVectorParameterValue(TEXT("Color"), Color);
	Beam->SetMaterial(0, Dyn);

	UMaterialInstanceDynamic* PulseMat = UMaterialInstanceDynamic::Create(FallbackMaterial, this);
	PulseMat->SetVectorParameterValue(TEXT("Color"), FMath::Lerp(Color, FLinearColor::White, 0.6f));
	PulseA->SetMaterial(0, PulseMat);
	PulseB->SetMaterial(0, PulseMat);

	SetActorLocation(Start);
	Grow = 0.0f;
}

void ARiftLink::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// The beam shoots out from the source rift, then pulses travel along it.
	Grow = FMath::Min(1.0f, Grow + DeltaSeconds * 2.0f);
	const FVector Tip = FMath::Lerp(Start, End, Grow);
	const FVector Dir = Tip - Start;
	const float Length = FMath::Max(Dir.Size(), 1.0f);

	Beam->SetWorldLocation((Start + Tip) * 0.5f);
	Beam->SetWorldRotation(FRotationMatrix::MakeFromZ(Dir.GetSafeNormal()).Rotator());
	Beam->SetWorldScale3D(FVector(0.012f, 0.012f, Length / 100.0f));

	Phase = FMath::Fmod(Phase + DeltaSeconds * 0.5f, 1.0f);
	PulseA->SetWorldLocation(FMath::Lerp(Start, Tip, Phase));
	PulseB->SetWorldLocation(FMath::Lerp(Start, Tip, FMath::Fmod(Phase + 0.5f, 1.0f)));
}
