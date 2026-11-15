#include "RiftNetworkSubsystem.h"
#include "RiftCoach.h"
#include "RiftPortal.h"
#include "RiftLink.h"
#include "RiftField.h"
#include "ARBlueprintLibrary.h"
#include "ARTrackable.h"
#include "Engine/World.h"

namespace
{
	double Cross2(const FVector2D& O, const FVector2D& A, const FVector2D& B)
	{
		return (A.X - O.X) * (B.Y - O.Y) - (A.Y - O.Y) * (B.X - O.X);
	}

	/** True if the two floor-plan segments properly cross (touching at an end doesn't count). */
	bool SegmentsCross(const FVector& P1, const FVector& P2, const FVector& Q1, const FVector& Q2)
	{
		const FVector2D A(P1), B(P2), C(Q1), D(Q2);
		const double D1 = Cross2(C, D, A);
		const double D2 = Cross2(C, D, B);
		const double D3 = Cross2(A, B, C);
		const double D4 = Cross2(A, B, D);
		return ((D1 > 0 && D2 < 0) || (D1 < 0 && D2 > 0)) && ((D3 > 0 && D4 < 0) || (D3 < 0 && D4 > 0));
	}

	float Dist2D(const FVector& A, const FVector& B)
	{
		return FVector::Dist2D(A, B);
	}
}

bool URiftNetworkSubsystem::DoesSupportWorldType(const EWorldType::Type WorldType) const
{
	return WorldType == EWorldType::Game || WorldType == EWorldType::PIE;
}

TStatId URiftNetworkSubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(URiftNetworkSubsystem, STATGROUP_Tickables);
}

ARiftPortal* URiftNetworkSubsystem::SpawnPortal(const FVector& FloorLocation, const FVector& FaceToward, ERiftFaction Faction)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return nullptr;
	}

	FVector ToViewer = FaceToward - FloorLocation;
	ToViewer.Z = 0.0f;
	const FRotator Facing = ToViewer.IsNearlyZero() ? FRotator::ZeroRotator : ToViewer.Rotation();

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	ARiftPortal* Portal = World->SpawnActor<ARiftPortal>(ARiftPortal::StaticClass(), FloorLocation, Facing, Params);
	if (Portal)
	{
		Portal->InitPortal(NextId++, Faction, MakePortalName());
		Portals.Add(Portal);
	}
	return Portal;
}

bool URiftNetworkSubsystem::HasLink(const ARiftPortal* A, const ARiftPortal* B) const
{
	for (const FRiftLinkRecord& L : Links)
	{
		if ((L.A.Get() == A && L.B.Get() == B) || (L.A.Get() == B && L.B.Get() == A))
		{
			return true;
		}
	}
	return false;
}

bool URiftNetworkSubsystem::HasField(const ARiftPortal* A, const ARiftPortal* B, const ARiftPortal* C) const
{
	for (const FRiftFieldRecord& F : Fields)
	{
		const TArray<const ARiftPortal*> Corners = { F.A.Get(), F.B.Get(), F.C.Get() };
		if (Corners.Contains(A) && Corners.Contains(B) && Corners.Contains(C))
		{
			return true;
		}
	}
	return false;
}

bool URiftNetworkSubsystem::CanLink(const ARiftPortal* A, const ARiftPortal* B, FString& OutReason) const
{
	if (!A || !B || A == B)
	{
		OutReason = TEXT("Pick a different rift to link to.");
		return false;
	}
	if (A->GetFaction() == ERiftFaction::Neutral || A->GetFaction() != B->GetFaction())
	{
		OutReason = TEXT("You can only link two rifts held by the same faction.");
		return false;
	}
	if (HasLink(A, B))
	{
		OutReason = TEXT("Those rifts are already linked.");
		return false;
	}
	const float Distance = Dist2D(A->GetActorLocation(), B->GetActorLocation());
	if (Distance > A->GetLinkRange())
	{
		OutReason = FString::Printf(TEXT("Too far: %.1f m. %s can link %.1f m. Upgrade it to reach further."),
			Distance / 100.0f, *A->GetPortalName(), A->GetLinkRange() / 100.0f);
		return false;
	}
	for (const FRiftLinkRecord& L : Links)
	{
		if (!L.A || !L.B || L.A.Get() == A || L.A.Get() == B || L.B.Get() == A || L.B.Get() == B)
		{
			continue;
		}
		if (SegmentsCross(A->GetActorLocation(), B->GetActorLocation(), L.A->GetActorLocation(), L.B->GetActorLocation()))
		{
			OutReason = FString::Printf(TEXT("That would cross the link between %s and %s. Links can't cross."),
				*L.A->GetPortalName(), *L.B->GetPortalName());
			return false;
		}
	}
	return true;
}

int32 URiftNetworkSubsystem::CreateLink(ARiftPortal* A, ARiftPortal* B)
{
	FString Reason;
	if (!CanLink(A, B, Reason))
	{
		return -1;
	}

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	ARiftLink* LinkActor = GetWorld()->SpawnActor<ARiftLink>(ARiftLink::StaticClass(), A->GetBeamPoint(), FRotator::ZeroRotator, Params);
	if (LinkActor)
	{
		LinkActor->Setup(A->GetBeamPoint(), B->GetBeamPoint(), A->GetFaction());
	}

	FRiftLinkRecord Record;
	Record.A = A;
	Record.B = B;
	Record.Actor = LinkActor;
	Record.Faction = A->GetFaction();
	Links.Add(Record);

	return CloseFields(A, B, A->GetFaction());
}

int32 URiftNetworkSubsystem::CloseFields(ARiftPortal* A, ARiftPortal* B, ERiftFaction Faction)
{
	int32 Made = 0;
	for (ARiftPortal* C : Portals)
	{
		if (!C || C == A || C == B || C->GetFaction() != Faction)
		{
			continue;
		}
		if (!HasLink(A, C) || !HasLink(B, C) || HasField(A, B, C))
		{
			continue;
		}

		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		ARiftField* FieldActor = GetWorld()->SpawnActor<ARiftField>(ARiftField::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, Params);
		if (!FieldActor)
		{
			continue;
		}
		FieldActor->Setup(A->GetActorLocation(), B->GetActorLocation(), C->GetActorLocation(), Faction);

		FRiftFieldRecord Record;
		Record.A = A;
		Record.B = B;
		Record.C = C;
		Record.Actor = FieldActor;
		Record.Faction = Faction;
		Record.AreaM2 = FieldActor->GetAreaM2();
		Fields.Add(Record);
		++Made;
	}
	return Made;
}

void URiftNetworkSubsystem::RemoveConnections(ARiftPortal* Portal)
{
	for (int32 i = Fields.Num() - 1; i >= 0; --i)
	{
		const FRiftFieldRecord& F = Fields[i];
		if (F.A.Get() == Portal || F.B.Get() == Portal || F.C.Get() == Portal)
		{
			if (F.Actor)
			{
				F.Actor->Destroy();
			}
			Fields.RemoveAt(i);
		}
	}
	for (int32 i = Links.Num() - 1; i >= 0; --i)
	{
		const FRiftLinkRecord& L = Links[i];
		if (L.A.Get() == Portal || L.B.Get() == Portal)
		{
			if (L.Actor)
			{
				L.Actor->Destroy();
			}
			Links.RemoveAt(i);
		}
	}
}

void URiftNetworkSubsystem::SetPortalFaction(ARiftPortal* Portal, ERiftFaction NewFaction)
{
	if (!Portal || Portal->GetFaction() == NewFaction)
	{
		return;
	}
	RemoveConnections(Portal);
	Portal->SetFaction(NewFaction);
}

int32 URiftNetworkSubsystem::CountPortals(ERiftFaction Faction) const
{
	int32 N = 0;
	for (const ARiftPortal* P : Portals)
	{
		N += (P && P->GetFaction() == Faction) ? 1 : 0;
	}
	return N;
}

int32 URiftNetworkSubsystem::CountLinks(ERiftFaction Faction) const
{
	return Links.FilterByPredicate([Faction](const FRiftLinkRecord& L) { return L.Faction == Faction; }).Num();
}

int32 URiftNetworkSubsystem::CountFields(ERiftFaction Faction) const
{
	return Fields.FilterByPredicate([Faction](const FRiftFieldRecord& F) { return F.Faction == Faction; }).Num();
}

float URiftNetworkSubsystem::GetFieldArea(ERiftFaction Faction) const
{
	float Area = 0.0f;
	for (const FRiftFieldRecord& F : Fields)
	{
		Area += F.Faction == Faction ? F.AreaM2 : 0.0f;
	}
	return Area;
}

ARiftPortal* URiftNetworkSubsystem::FindNearestPortal(const FVector& Location, float& OutDistance) const
{
	ARiftPortal* Best = nullptr;
	OutDistance = TNumericLimits<float>::Max();
	for (ARiftPortal* P : Portals)
	{
		if (!P)
		{
			continue;
		}
		const float D = Dist2D(P->GetActorLocation(), Location);
		if (D < OutDistance)
		{
			OutDistance = D;
			Best = P;
		}
	}
	return Best;
}

float URiftNetworkSubsystem::ConsumeAether()
{
	const float Out = AetherOwed;
	AetherOwed = 0.0f;
	return Out;
}

void URiftNetworkSubsystem::Prune()
{
	Portals.RemoveAll([](const TObjectPtr<ARiftPortal>& P) { return !IsValid(P); });
}

void URiftNetworkSubsystem::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);
	Prune();

	// Fields pay 2 Aether per square metre per minute, links a trickle.
	const float PerMinute = GetFieldArea(Rift::PlayerFaction) * 2.0f + CountLinks(Rift::PlayerFaction) * 0.25f;
	AetherOwed += PerMinute * DeltaTime / 60.0f;

	if (!bRivalsActive)
	{
		return;
	}
	RivalTimer -= DeltaTime;
	if (RivalTimer <= 0.0f)
	{
		RivalTimer = FMath::FRandRange(35.0f, 70.0f);
		RivalTurn();
	}
}

bool URiftNetworkSubsystem::FindSpawnSpot(FVector& Out) const
{
	TArray<FVector> Candidates;

	if (bUseAR)
	{
		// Real horizontal surfaces the phone has found: floors, tables, beds.
		for (UARTrackedGeometry* Geometry : UARBlueprintLibrary::GetAllGeometries())
		{
			const UARPlaneGeometry* Plane = Cast<UARPlaneGeometry>(Geometry);
			if (!Plane || Plane->GetTrackingState() != EARTrackingState::Tracking || Plane->GetOrientation() != EARPlaneOrientation::Horizontal)
			{
				continue;
			}
			const FVector Extent = Plane->GetExtent();
			if (Extent.X < 40.0f || Extent.Y < 40.0f)
			{
				continue;
			}
			const FTransform ToWorld = Plane->GetLocalToWorldTransform();
			for (int32 k = 0; k < 6; ++k)
			{
				const FVector Local = Plane->GetCenter() + FVector(FMath::FRandRange(-0.8f, 0.8f) * Extent.X, FMath::FRandRange(-0.8f, 0.8f) * Extent.Y, 0.0f);
				Candidates.Add(ToWorld.TransformPosition(Local));
			}
		}
	}
	else
	{
		for (int32 k = 0; k < 16; ++k)
		{
			const float Angle = FMath::FRandRange(0.0f, 2.0f * PI);
			const float Dist = FMath::FRandRange(150.0f, 450.0f);
			Candidates.Add(FVector(ViewerLocation.X + FMath::Cos(Angle) * Dist, ViewerLocation.Y + FMath::Sin(Angle) * Dist, FallbackFloorZ));
		}
	}

	Candidates.RemoveAll([this](const FVector& C)
	{
		const float ToViewer = Dist2D(C, ViewerLocation);
		if (ToViewer < 100.0f || ToViewer > 600.0f)
		{
			return true;
		}
		for (const ARiftPortal* P : Portals)
		{
			if (P && Dist2D(P->GetActorLocation(), C) < 90.0f)
			{
				return true;
			}
		}
		return false;
	});

	if (Candidates.Num() == 0)
	{
		return false;
	}
	Out = Candidates[FMath::RandRange(0, Candidates.Num() - 1)];
	return true;
}

void URiftNetworkSubsystem::RivalTurn()
{
	TArray<ARiftPortal*> Mine;
	TArray<ARiftPortal*> Theirs;
	for (ARiftPortal* P : Portals)
	{
		if (P && P->GetFaction() == Rift::PlayerFaction) { Mine.Add(P); }
		if (P && P->GetFaction() == Rift::RivalFaction) { Theirs.Add(P); }
	}

	// 1. Tear open a new rift.
	const int32 Wanted = FMath::Clamp(2 + Mine.Num() / 2, 2, 6);
	if (Theirs.Num() < Wanted && (Theirs.Num() < 2 || FMath::FRand() < 0.6f))
	{
		FVector Spot;
		if (FindSpawnSpot(Spot))
		{
			if (ARiftPortal* P = SpawnPortal(Spot, ViewerLocation, Rift::RivalFaction))
			{
				OnNews.Broadcast(FString::Printf(TEXT("A Breacher rift tore open nearby: %s. Look around!"), *P->GetPortalName()));
				return;
			}
		}
	}

	// 2. Link two of theirs.
	if (Theirs.Num() >= 2 && FMath::FRand() < 0.6f)
	{
		for (int32 Tries = 0; Tries < 8; ++Tries)
		{
			ARiftPortal* A = Theirs[FMath::RandRange(0, Theirs.Num() - 1)];
			ARiftPortal* B = Theirs[FMath::RandRange(0, Theirs.Num() - 1)];
			FString Reason;
			if (CanLink(A, B, Reason))
			{
				const int32 NewFields = CreateLink(A, B);
				OnNews.Broadcast(NewFields > 0
					? FString::Printf(TEXT("The Breachers linked %s and %s and raised a control field!"), *A->GetPortalName(), *B->GetPortalName())
					: FString::Printf(TEXT("The Breachers linked %s and %s."), *A->GetPortalName(), *B->GetPortalName()));
				return;
			}
		}
	}

	// 3. Drain one of the player's rifts.
	if (Mine.Num() > 0)
	{
		ARiftPortal* Target = Mine[FMath::RandRange(0, Mine.Num() - 1)];
		Target->AddCharge(-0.25f / Target->GetLevel() * 1.5f);
		if (Target->GetCharge() <= 0.01f)
		{
			SetPortalFaction(Target, ERiftFaction::Neutral);
			Target->AddCharge(0.5f);
			OnNews.Broadcast(FString::Printf(TEXT("%s collapsed to neutral! Hack it, then claim it back."), *Target->GetPortalName()));
		}
		else
		{
			OnNews.Broadcast(FString::Printf(TEXT("Breachers are draining %s (%d%% left). Recharge it with Resolve."),
				*Target->GetPortalName(), FMath::RoundToInt(Target->GetCharge() * 100.0f)));
		}
	}
}

FString URiftNetworkSubsystem::MakePortalName()
{
	static const TCHAR* First[] = { TEXT("Amber"), TEXT("Fern"), TEXT("Ember"), TEXT("Moss"), TEXT("Basalt"), TEXT("Cinder"),
		TEXT("Tide"), TEXT("Quartz"), TEXT("Thunder"), TEXT("Hollow"), TEXT("Comet"), TEXT("Glacier"), TEXT("Sable"), TEXT("Iron") };
	static const TCHAR* Second[] = { TEXT("Gate"), TEXT("Well"), TEXT("Arch"), TEXT("Spire"), TEXT("Hollow"), TEXT("Rift"),
		TEXT("Door"), TEXT("Nest"), TEXT("Crossing"), TEXT("Maw"), TEXT("Shard"), TEXT("Beacon") };

	for (int32 Tries = 0; Tries < 40; ++Tries)
	{
		const FString Name = FString::Printf(TEXT("%s %s"), First[FMath::RandRange(0, UE_ARRAY_COUNT(First) - 1)], Second[FMath::RandRange(0, UE_ARRAY_COUNT(Second) - 1)]);
		if (!UsedNames.Contains(Name) && !Name.StartsWith(TEXT("Hollow Hollow")))
		{
			UsedNames.Add(Name);
			return Name;
		}
	}
	return FString::Printf(TEXT("Rift %d"), NextId);
}
