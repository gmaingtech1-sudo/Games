#include "RiftField.h"
#include "RiftSettings.h"
#include "ProceduralMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

ARiftField::ARiftField()
{
	PrimaryActorTick.bCanEverTick = true;

	static ConstructorHelpers::FObjectFinder<UMaterialInterface> BasicMaterial(TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	FallbackMaterial = BasicMaterial.Object;

	Mesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Mesh"));
	RootComponent = Mesh;
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->SetCastShadow(false);
}

void ARiftField::Setup(const FVector& A, const FVector& B, const FVector& C, ERiftFaction Faction)
{
	// Lay the field just above the lowest of the three rifts' floors.
	const FVector Centre = (A + B + C) / 3.0f;
	const float FloorZ = FMath::Min3(A.Z, B.Z, C.Z) + 1.5f;
	SetActorLocation(FVector(Centre.X, Centre.Y, FloorZ));
	BaseZ = FloorZ;

	TArray<FVector> Verts;
	for (const FVector& P : { A, B, C })
	{
		Verts.Add(FVector(P.X - Centre.X, P.Y - Centre.Y, 0.0f));
	}
	// Both windings, so it shows from above whichever order the corners come in.
	const TArray<int32> Tris = { 0, 1, 2, 0, 2, 1 };
	const TArray<FVector> Normals = { FVector::UpVector, FVector::UpVector, FVector::UpVector };
	const TArray<FVector2D> UVs = { FVector2D(0, 0), FVector2D(1, 0), FVector2D(0, 1) };
	const FLinearColor Color = Rift::FactionColor(Faction);
	const TArray<FLinearColor> Colors = { Color, Color, Color };
	const TArray<FProcMeshTangent> Tangents;
	Mesh->CreateMeshSection_LinearColor(0, Verts, Tris, Normals, UVs, Colors, Tangents, false);

	UMaterialInterface* Mat = GetDefault<URiftSettings>()->FieldMaterial.LoadSynchronous();
	UMaterialInstanceDynamic* Dyn = UMaterialInstanceDynamic::Create(Mat ? Mat : FallbackMaterial.Get(), this);
	Dyn->SetVectorParameterValue(TEXT("Color"), Color * 0.6f);
	Mesh->SetMaterial(0, Dyn);

	const FVector2D AB(B.X - A.X, B.Y - A.Y);
	const FVector2D AC(C.X - A.X, C.Y - A.Y);
	AreaM2 = 0.5f * FMath::Abs(AB.X * AC.Y - AB.Y * AC.X) / 10000.0f;
}

void ARiftField::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Time += DeltaSeconds;
	// A slow breathing shimmer.
	const float S = 1.0f + 0.015f * FMath::Sin(Time * 1.7f);
	SetActorScale3D(FVector(S, S, 1.0f));
}
