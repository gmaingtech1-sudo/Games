#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "DinoCoach.generated.h"

class USkeletalMeshComponent;
class UStaticMeshComponent;
class UMaterialInterface;
class UStaticMesh;

/**
 * Sage, a young Parasaurolophus and your life coach.
 *
 * Out of the box Sage is assembled from engine shapes and animated procedurally:
 * breathing, a swaying tail, walking legs, head tracking that follows your phone, and
 * nods when talking. Set Project Settings -> Rift Coach -> Dino Mesh to a rigged,
 * realistic dinosaur and the stand-in body is swapped for it.
 */
UCLASS()
class RIFTCOACH_API ADinoCoach : public AActor
{
	GENERATED_BODY()

public:
	ADinoCoach();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	void WalkTo(const FVector& FloorPoint);
	bool IsWalking() const { return bWalking; }
	void SetLookTarget(const FVector& WorldPoint) { LookTarget = WorldPoint; }
	void SetBreathing(bool bInGuided, float InLevel);
	void Nod() { NodTime = 0.0f; }

private:
	UStaticMeshComponent* AddPart(const TCHAR* Name, USceneComponent* Parent, UStaticMesh* Mesh,
		const FVector& Location, const FVector& Scale, const FRotator& Rotation = FRotator::ZeroRotator);
	USceneComponent* AddPivot(const TCHAR* Name, USceneComponent* Parent, const FVector& Location);
	void UpdateSkeletalAnim(float Speed);

	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> BodyRoot;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USkeletalMeshComponent> Skeletal;

	UPROPERTY() TObjectPtr<UStaticMeshComponent> Torso;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Belly;
	UPROPERTY() TObjectPtr<USceneComponent> NeckPivot;
	UPROPERTY() TObjectPtr<USceneComponent> HeadPivot;
	UPROPERTY() TObjectPtr<USceneComponent> JawPivot;
	UPROPERTY() TObjectPtr<USceneComponent> LegPivotL;
	UPROPERTY() TObjectPtr<USceneComponent> LegPivotR;
	UPROPERTY() TObjectPtr<USceneComponent> ArmPivotL;
	UPROPERTY() TObjectPtr<USceneComponent> ArmPivotR;
	UPROPERTY() TArray<TObjectPtr<USceneComponent>> TailPivots;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> SkinParts;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> BellyParts;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> CrestParts;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> EyeParts;
	UPROPERTY() TObjectPtr<UMaterialInterface> FallbackMaterial;

	bool bUsingSkeletal = false;
	bool bWalking = false;
	FVector WalkTarget = FVector::ZeroVector;
	FVector LookTarget = FVector::ZeroVector;
	FRotator HeadRot = FRotator::ZeroRotator;
	float Time = 0.0f;
	float WalkPhase = 0.0f;
	float CurrentSpeed = 0.0f;
	float NodTime = 10.0f;
	float AppearT = 0.0f;
	bool bGuidedBreath = false;
	float GuidedLevel = 0.0f;
	float BlinkTimer = 3.0f;
};
