#include "RiftReticle.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr int32 NumDots = 16;
	constexpr float Radius = 22.0f;
}

ARiftReticle::ARiftReticle()
{
	PrimaryActorTick.bCanEverTick = true;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	static ConstructorHelpers::FObjectFinder<UMaterialInterface> BasicMaterial(TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	FallbackMaterial = BasicMaterial.Object;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	for (int32 i = 0; i < NumDots; ++i)
	{
		UStaticMeshComponent* Dot = CreateDefaultSubobject<UStaticMeshComponent>(*FString::Printf(TEXT("Dot%d"), i));
		Dot->SetupAttachment(Root);
		Dot->SetStaticMesh(Sphere.Object);
		const float A = 2.0f * PI * i / NumDots;
		Dot->SetRelativeLocation(FVector(FMath::Cos(A) * Radius, FMath::Sin(A) * Radius, 0.5f));
		Dot->SetRelativeScale3D(FVector(0.03f, 0.03f, 0.008f));
		Dot->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Dot->SetCastShadow(false);
		Dots.Add(Dot);
	}
}

void ARiftReticle::BeginPlay()
{
	Super::BeginPlay();
	UMaterialInstanceDynamic* Mat = UMaterialInstanceDynamic::Create(FallbackMaterial, this);
	Mat->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.9f, 0.95f, 1.0f));
	for (UStaticMeshComponent* Dot : Dots)
	{
		Dot->SetMaterial(0, Mat);
	}
}

void ARiftReticle::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Time += DeltaSeconds;
	Root->SetRelativeRotation(FRotator(0.0f, Time * 40.0f, 0.0f));
	const float Pulse = 1.0f + 0.08f * FMath::Sin(Time * 4.0f);
	Root->SetRelativeScale3D(FVector(Pulse, Pulse, 1.0f));
}
