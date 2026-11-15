#include "RiftPlayerController.h"
#include "RiftCoach.h"
#include "RiftSettings.h"
#include "RiftSaveGame.h"
#include "RiftPortal.h"
#include "RiftPawn.h"
#include "RiftNetworkSubsystem.h"
#include "DinoCoach.h"
#include "RiftLightRig.h"
#include "RiftReticle.h"
#include "UI/SRiftHud.h"

#include "ARBlueprintLibrary.h"
#include "ARSessionConfig.h"
#include "ARTraceResult.h"
#include "ARTrackable.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Widgets/SWeakWidget.h"

namespace
{
	const TCHAR* SaveSlot = TEXT("RiftCoach");
	constexpr float DragThreshold = 18.0f;
	constexpr float ToastSeconds = 4.5f;
}

ARiftPlayerController::ARiftPlayerController()
{
	PrimaryActorTick.bCanEverTick = true;
	bShowMouseCursor = true;
}

// ---------------------------------------------------------------- setup

void ARiftPlayerController::BeginPlay()
{
	Super::BeginPlay();
	if (!IsLocalController())
	{
		return;
	}

	LoadOrCreateSave();
	Coach.Init(Save,
		[this](int32 Amount, const FString& Why) { GrantResolve(Amount, Why); },
		[this]() { SaveNow(); });

	UWorld* World = GetWorld();
	Network = World->GetSubsystem<URiftNetworkSubsystem>();
	Network->OnNews.AddUObject(this, &ARiftPlayerController::OnNews);

	bUseAR = UARBlueprintLibrary::IsSessionTypeSupported(EARSessionType::World);
	bModeDecided = true;
	Network->bUseAR = bUseAR;
	ApplyPawnMode();

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	LightRig = World->SpawnActor<ARiftLightRig>(ARiftLightRig::StaticClass(), FTransform::Identity, Params);
	LightRig->bUseAR = bUseAR;
	Reticle = World->SpawnActor<ARiftReticle>(ARiftReticle::StaticClass(), FTransform::Identity, Params);
	Reticle->SetActorHiddenInGame(true);

	if (bUseAR)
	{
		StartAR();
	}
	else
	{
		SetupDesktop();
	}

	CreateHud();
	Toast(bUseAR
		? TEXT("Sweep your phone slowly across the floor to find surfaces.")
		: TEXT("No AR on this device, so you're in a practice room. Drag to look around."));
}

void ARiftPlayerController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (HudHost.IsValid() && GEngine && GEngine->GameViewport)
	{
		GEngine->GameViewport->RemoveViewportWidgetContent(HudHost.ToSharedRef());
	}
	HudHost.Reset();
	Hud.Reset();

	if (bUseAR)
	{
		UARBlueprintLibrary::StopARSession();
	}
	SaveNow();
	Super::EndPlay(EndPlayReason);
}

void ARiftPlayerController::StartAR()
{
	SessionConfig = GetDefault<URiftSettings>()->SessionConfig.LoadSynchronous();
	if (!SessionConfig)
	{
		// Defaults: world tracking, horizontal + vertical plane detection, ambient light
		// estimation and the camera image drawn behind the scene.
		SessionConfig = NewObject<UARSessionConfig>(this);
	}
	UARBlueprintLibrary::StartARSession(SessionConfig);
}

void ARiftPlayerController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);
	if (bModeDecided)
	{
		ApplyPawnMode();
	}
}

void ARiftPlayerController::ApplyPawnMode()
{
	if (ARiftPawn* RiftPawn = Cast<ARiftPawn>(GetPawn()))
	{
		RiftPawn->SetDesktopMode(!bUseAR);
		if (!bUseAR)
		{
			RiftPawn->SetActorLocation(FVector::ZeroVector);
			SetControlRotation(FRotator(DesktopPitch, DesktopYaw, 0.0f));
		}
	}
}

void ARiftPlayerController::SetupDesktop()
{

	// A plain floor so there's something to stand portals on.
	UWorld* World = GetWorld();
	AStaticMeshActor* Floor = World->SpawnActor<AStaticMeshActor>(AStaticMeshActor::StaticClass(), FTransform::Identity);
	if (Floor)
	{
		Floor->SetMobility(EComponentMobility::Movable);
		UStaticMeshComponent* Mesh = Floor->GetStaticMeshComponent();
		Mesh->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Plane.Plane")));
		Mesh->SetWorldScale3D(FVector(40.0f, 40.0f, 1.0f));
		Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		if (UMaterialInterface* Basic = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")))
		{
			UMaterialInstanceDynamic* Mat = UMaterialInstanceDynamic::Create(Basic, Floor);
			Mat->SetVectorParameterValue(TEXT("Color"), FLinearColor(0.22f, 0.2f, 0.18f));
			Mesh->SetMaterial(0, Mat);
		}
	}
	Network->FallbackFloorZ = 0.0f;
}

void ARiftPlayerController::CreateHud()
{
	if (!GEngine || !GEngine->GameViewport)
	{
		return;
	}
	Hud = SNew(SRiftHud).Owner(this);
	HudHost = SNew(SWeakWidget).PossiblyNullContent(Hud.ToSharedRef());
	GEngine->GameViewport->AddViewportWidgetContent(HudHost.ToSharedRef(), 10);
}

void ARiftPlayerController::LoadOrCreateSave()
{
	if (UGameplayStatics::DoesSaveGameExist(SaveSlot, 0))
	{
		Save = Cast<URiftSaveGame>(UGameplayStatics::LoadGameFromSlot(SaveSlot, 0));
	}
	if (!Save)
	{
		Save = Cast<URiftSaveGame>(UGameplayStatics::CreateSaveGameObject(URiftSaveGame::StaticClass()));
	}
}

void ARiftPlayerController::SaveNow()
{
	if (Save)
	{
		UGameplayStatics::SaveGameToSlot(Save, SaveSlot, 0);
	}
}

void ARiftPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
	InputComponent->BindTouch(IE_Pressed, this, &ARiftPlayerController::OnTouchPressed);
	InputComponent->BindTouch(IE_Repeat, this, &ARiftPlayerController::OnTouchMoved);
	InputComponent->BindTouch(IE_Released, this, &ARiftPlayerController::OnTouchReleased);
}

// ---------------------------------------------------------------- per frame

FVector ARiftPlayerController::ViewerLocation() const
{
	return PlayerCameraManager ? PlayerCameraManager->GetCameraLocation() : FVector::ZeroVector;
}

FRotator ARiftPlayerController::ViewerRotation() const
{
	return PlayerCameraManager ? PlayerCameraManager->GetCameraRotation() : FRotator::ZeroRotator;
}

float ARiftPlayerController::DistanceToViewer(const AActor* Actor) const
{
	return Actor ? FVector::Dist2D(Actor->GetActorLocation(), ViewerLocation()) : 0.0f;
}

void ARiftPlayerController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!IsLocalController() || !Save || !Network)
	{
		return;
	}

	const FVector CamLoc = ViewerLocation();
	Network->ViewerLocation = CamLoc;

	// Where the centre of the screen meets a real surface.
	int32 SizeX = 0, SizeY = 0;
	GetViewportSize(SizeX, SizeY);
	bHasFloorTarget = SizeX > 0 && TraceFloor(FVector2D(SizeX * 0.5f, SizeY * 0.55f), FloorTarget);
	bSawAnyPlane |= bHasFloorTarget;

	const bool bShowReticle = bHasFloorTarget && Mode == ERiftUIMode::Play && !Selected;
	Reticle->SetActorHiddenInGame(!bShowReticle);
	if (bHasFloorTarget)
	{
		Reticle->SetActorLocation(FloorTarget);
	}

	Save->Aether += Network->ConsumeAether();

	if (Mode == ERiftUIMode::Hack)
	{
		Hack.Tick(DeltaSeconds);
		if (Hack.GetPhase() == EHackPhase::Inactive)
		{
			Mode = ERiftUIMode::Play;
			HackTarget = nullptr;
		}
	}

	if (Mode == ERiftUIMode::Coach)
	{
		Coach.Tick(DeltaSeconds);
		if (!Coach.IsOpen())
		{
			EndCoaching();
		}
	}

	if (Dino)
	{
		Dino->SetLookTarget(CamLoc);
		Dino->SetBreathing(Mode == ERiftUIMode::Coach && Coach.IsBreathing(), Coach.GetBreathLevel());
	}
	if (Coach.ConsumeTalkPulses() > 0 && Dino)
	{
		Dino->Nod();
	}

	if (Coach.GetVersion() != SeenCoachVersion)
	{
		SeenCoachVersion = Coach.GetVersion();
		if (Hud.IsValid())
		{
			Hud->RebuildCoachChoices();
		}
	}

	if (Selected && !IsValid(Selected))
	{
		Selected = nullptr;
	}

	AutosaveTimer += DeltaSeconds;
	if (AutosaveTimer > 20.0f)
	{
		AutosaveTimer = 0.0f;
		SaveNow();
	}
}

bool ARiftPlayerController::TraceFloor(const FVector2D& ScreenPoint, FVector& OutPoint) const
{
	if (bUseAR)
	{
		TArray<FARTraceResult> Hits = UARBlueprintLibrary::LineTraceTrackedObjects(ScreenPoint, false, false, true, true);
		for (FARTraceResult& Hit : Hits)
		{
			const UARPlaneGeometry* Plane = Cast<UARPlaneGeometry>(Hit.GetTrackedGeometry());
			if (Plane && Plane->GetOrientation() == EARPlaneOrientation::Horizontal)
			{
				OutPoint = Hit.GetLocalToWorldTransform().GetLocation();
				return true;
			}
		}
		return false;
	}

	FVector Origin, Direction;
	if (!DeprojectScreenPositionToWorld(ScreenPoint.X, ScreenPoint.Y, Origin, Direction) || Direction.Z > -0.05f)
	{
		return false;
	}
	const float T = (Network->FallbackFloorZ - Origin.Z) / Direction.Z;
	OutPoint = Origin + Direction * T;
	return T > 0.0f && FVector::Dist2D(OutPoint, Origin) < 1200.0f;
}

// ---------------------------------------------------------------- touch

void ARiftPlayerController::OnTouchPressed(ETouchIndex::Type Finger, FVector Location)
{
	if (Finger != ETouchIndex::Touch1)
	{
		return;
	}
	bTouchDown = true;
	bTouchDragged = false;
	TouchStart = FVector2D(Location.X, Location.Y);
	TouchLast = TouchStart;
}

void ARiftPlayerController::OnTouchMoved(ETouchIndex::Type Finger, FVector Location)
{
	if (Finger != ETouchIndex::Touch1 || !bTouchDown)
	{
		return;
	}
	const FVector2D Point(Location.X, Location.Y);
	if (FVector2D::Distance(Point, TouchStart) > DragThreshold)
	{
		bTouchDragged = true;
	}
	if (!bUseAR && bTouchDragged)
	{
		const FVector2D Delta = Point - TouchLast;
		DesktopYaw += Delta.X * 0.2f;
		DesktopPitch = FMath::Clamp(DesktopPitch - Delta.Y * 0.2f, -85.0f, 15.0f);
		SetControlRotation(FRotator(DesktopPitch, DesktopYaw, 0.0f));
	}
	TouchLast = Point;
}

void ARiftPlayerController::OnTouchReleased(ETouchIndex::Type Finger, FVector Location)
{
	if (Finger != ETouchIndex::Touch1 || !bTouchDown)
	{
		return;
	}
	bTouchDown = false;
	if (!bTouchDragged)
	{
		HandleTap(TouchLast);
	}
}

void ARiftPlayerController::HandleTap(const FVector2D& ScreenPoint)
{
	if (Mode == ERiftUIMode::Hack || Mode == ERiftUIMode::Coach)
	{
		return;
	}

	FHitResult Hit;
	if (GetHitResultAtScreenPosition(ScreenPoint, ECC_Visibility, false, Hit))
	{
		if (ARiftPortal* Portal = Cast<ARiftPortal>(Hit.GetActor()))
		{
			OnPortalTapped(Portal);
			return;
		}
		if (Dino && Hit.GetActor() == Dino.Get())
		{
			UI_Sage();
			return;
		}
	}

	if (Mode == ERiftUIMode::LinkPick)
	{
		UI_CancelLink();
	}
	else if (Selected)
	{
		Select(nullptr);
	}
}

void ARiftPlayerController::OnPortalTapped(ARiftPortal* Portal)
{
	if (Mode == ERiftUIMode::LinkPick)
	{
		TryLinkTo(Portal);
	}
	else
	{
		Select(Portal);
	}
}

void ARiftPlayerController::Select(ARiftPortal* Portal)
{
	if (Selected)
	{
		Selected->SetSelected(false);
	}
	Selected = Portal;
	if (Selected)
	{
		Selected->SetSelected(true);
	}
}

// ---------------------------------------------------------------- HUD queries

ARiftPortal* ARiftPlayerController::GetSelectedPortal() const
{
	return IsValid(Selected) ? Selected.Get() : nullptr;
}

bool ARiftPlayerController::IsSelectedFaction(ERiftFaction Faction) const
{
	const ARiftPortal* P = GetSelectedPortal();
	return P && P->GetFaction() == Faction;
}

int32 ARiftPlayerController::KeysFor(const ARiftPortal* Portal) const
{
	const int32* Found = Portal ? Keys.Find(Portal->GetId()) : nullptr;
	return Found ? *Found : 0;
}

FText ARiftPlayerController::GetStatsText() const
{
	if (!Save || !Network)
	{
		return FText::GetEmpty();
	}
	return FText::FromString(FString::Printf(TEXT("Shards %d    Resolve %d    Aether %d\nYour rifts %d    Links %d    Fields %d    Breachers %d"),
		Save->Shards, Save->Resolve, FMath::FloorToInt(Save->Aether),
		Network->CountPortals(Rift::PlayerFaction), Network->CountLinks(Rift::PlayerFaction),
		Network->CountFields(Rift::PlayerFaction), Network->CountPortals(Rift::RivalFaction)));
}

FText ARiftPlayerController::GetHintText() const
{
	if (!Network)
	{
		return FText::GetEmpty();
	}
	if (bUseAR && !bSawAnyPlane)
	{
		return FText::FromString(TEXT("Move your phone slowly over the floor until a ring of dots appears."));
	}
	if (Mode == ERiftUIMode::Play && !Selected)
	{
		if (!bHasFloorTarget)
		{
			return FText::FromString(TEXT("Point at the floor or a table."));
		}
		if (Network->CountPortals(Rift::PlayerFaction) == 0)
		{
			return FText::FromString(TEXT("Tap Open Rift to tear a portal into your room. Summon Sage for coaching: real-life progress earns Resolve."));
		}
		if (Network->CountPortals(Rift::PlayerFaction) < 3)
		{
			return FText::FromString(TEXT("Open three rifts and link them in a triangle to raise a control field."));
		}
		return FText::FromString(TEXT("Tap a rift to hack, upgrade or link it. Walk right up to it: hacking needs you within 2 m."));
	}
	return FText::GetEmpty();
}

float ARiftPlayerController::GetToastAlpha() const
{
	const UWorld* World = GetWorld();
	if (!World)
	{
		return 0.0f;
	}
	const float Left = static_cast<float>(ToastTime + ToastSeconds - World->GetTimeSeconds());
	return FMath::Clamp(Left / 0.6f, 0.0f, 1.0f);
}

FText ARiftPlayerController::GetPortalTitle() const
{
	const ARiftPortal* P = GetSelectedPortal();
	return P ? FText::FromString(FString::Printf(TEXT("%s  -  %s, level %d"), *P->GetPortalName(), Rift::FactionName(P->GetFaction()), P->GetLevel()))
		: FText::GetEmpty();
}

FText ARiftPlayerController::GetPortalDetails() const
{
	const ARiftPortal* P = GetSelectedPortal();
	if (!P)
	{
		return FText::GetEmpty();
	}
	return FText::FromString(FString::Printf(TEXT("Charge %d%%    Keys %d    Link range %.1f m    You are %.1f m away"),
		FMath::RoundToInt(P->GetCharge() * 100.0f), KeysFor(P), P->GetLinkRange() / 100.0f, DistanceToViewer(P) / 100.0f));
}

FLinearColor ARiftPlayerController::GetSelectedColor() const
{
	const ARiftPortal* P = GetSelectedPortal();
	return Rift::FactionColor(P ? P->GetFaction() : ERiftFaction::Neutral);
}

bool ARiftPlayerController::CanOpenRift() const
{
	return Mode == ERiftUIMode::Play && bHasFloorTarget && Save && Save->Shards >= GetDefault<URiftSettings>()->OpenRiftCost;
}

FText ARiftPlayerController::GetOpenRiftLabel() const
{
	return FText::FromString(FString::Printf(TEXT("Open Rift (%d shards)"), GetDefault<URiftSettings>()->OpenRiftCost));
}

FText ARiftPlayerController::GetSageLabel() const
{
	return FText::FromString(Dino ? TEXT("Talk to Sage") : TEXT("Summon Sage"));
}

bool ARiftPlayerController::CanHack(FString* OutWhy) const
{
	const ARiftPortal* P = GetSelectedPortal();
	const UWorld* World = GetWorld();
	if (!P || !World)
	{
		return false;
	}
	const float Cooldown = P->GetHackCooldownLeft(World->GetTimeSeconds());
	if (Cooldown > 0.0f)
	{
		if (OutWhy) { *OutWhy = FString::Printf(TEXT("Cooling down: %ds"), FMath::CeilToInt(Cooldown)); }
		return false;
	}
	if (bUseAR && DistanceToViewer(P) > GetDefault<URiftSettings>()->HackRangeCm)
	{
		if (OutWhy) { *OutWhy = TEXT("Walk closer"); }
		return false;
	}
	return true;
}

FText ARiftPlayerController::GetHackLabel() const
{
	FString Why;
	if (!CanHack(&Why) && !Why.IsEmpty())
	{
		return FText::FromString(FString::Printf(TEXT("Hack (%s)"), *Why));
	}
	return FText::FromString(IsSelectedFaction(Rift::RivalFaction) ? TEXT("Hack: drain it") : TEXT("Hack"));
}

bool ARiftPlayerController::CanClaim() const
{
	return IsSelectedFaction(ERiftFaction::Neutral) && Save && Save->Shards >= GetDefault<URiftSettings>()->ClaimCost;
}

FText ARiftPlayerController::GetClaimLabel() const
{
	return FText::FromString(FString::Printf(TEXT("Claim (%d shards)"), GetDefault<URiftSettings>()->ClaimCost));
}

bool ARiftPlayerController::CanUpgrade() const
{
	const ARiftPortal* P = GetSelectedPortal();
	return P && P->GetFaction() == Rift::PlayerFaction && P->GetLevel() < GetDefault<URiftSettings>()->MaxPortalLevel
		&& Save->Shards >= P->GetLevel() * 3 && Save->Resolve >= P->GetLevel();
}

FText ARiftPlayerController::GetUpgradeLabel() const
{
	const ARiftPortal* P = GetSelectedPortal();
	if (!P)
	{
		return FText::GetEmpty();
	}
	if (P->GetLevel() >= GetDefault<URiftSettings>()->MaxPortalLevel)
	{
		return FText::FromString(TEXT("Max level"));
	}
	return FText::FromString(FString::Printf(TEXT("Upgrade (%d shards, %d Resolve)"), P->GetLevel() * 3, P->GetLevel()));
}

bool ARiftPlayerController::CanRecharge() const
{
	const ARiftPortal* P = GetSelectedPortal();
	return P && P->GetFaction() == Rift::PlayerFaction && P->GetCharge() < 0.99f && Save->Resolve >= 1;
}

FText ARiftPlayerController::GetRechargeLabel() const
{
	return FText::FromString(TEXT("Recharge (1 Resolve)"));
}

bool ARiftPlayerController::CanStartLink() const
{
	const ARiftPortal* P = GetSelectedPortal();
	if (!P || P->GetFaction() != Rift::PlayerFaction || !Network)
	{
		return false;
	}
	for (const ARiftPortal* Other : Network->GetPortals())
	{
		if (Other && Other != P && Other->GetFaction() == Rift::PlayerFaction && KeysFor(Other) > 0)
		{
			return true;
		}
	}
	return false;
}

FText ARiftPlayerController::GetLinkLabel() const
{
	return FText::FromString(CanStartLink() ? TEXT("Link") : TEXT("Link (need a key to another rift)"));
}

FText ARiftPlayerController::GetHackTitle() const
{
	const ARiftPortal* P = HackTarget.Get();
	return FText::FromString(P ? FString::Printf(TEXT("HACKING %s"), *P->GetPortalName().ToUpper()) : FString(TEXT("HACKING")));
}

// ---------------------------------------------------------------- actions

void ARiftPlayerController::UI_OpenRift()
{
	if (!CanOpenRift())
	{
		Toast(bHasFloorTarget ? TEXT("Not enough shards. Hack rifts to get more.") : TEXT("Point at the floor first."));
		return;
	}
	float Nearest = 0.0f;
	if (Network->FindNearestPortal(FloorTarget, Nearest) && Nearest < 90.0f)
	{
		Toast(TEXT("Too close to another rift. Step back and aim at an open spot."));
		return;
	}

	Save->Shards -= GetDefault<URiftSettings>()->OpenRiftCost;
	ARiftPortal* Portal = Network->SpawnPortal(FloorTarget, ViewerLocation(), Rift::PlayerFaction);
	if (!Portal)
	{
		return;
	}
	Keys.FindOrAdd(Portal->GetId()) += 1;
	Network->SetRivalsActive(true);
	Select(Portal);
	Toast(FString::Printf(TEXT("You tore open %s. You keep its first key."), *Portal->GetPortalName()));
	SaveNow();
}

void ARiftPlayerController::UI_Sage()
{
	if (Mode != ERiftUIMode::Play)
	{
		return;
	}
	if (!Dino)
	{
		if (!bHasFloorTarget)
		{
			Toast(TEXT("Point at the floor so Sage has somewhere to stand."));
			return;
		}
		FVector ToViewer = ViewerLocation() - FloorTarget;
		ToViewer.Z = 0.0f;
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		Dino = GetWorld()->SpawnActor<ADinoCoach>(ADinoCoach::StaticClass(), FloorTarget, ToViewer.Rotation(), Params);
		Toast(TEXT("Sage stepped out of a rift."));
	}
	StartCoaching();
}

void ARiftPlayerController::StartCoaching()
{
	Select(nullptr);
	Mode = ERiftUIMode::Coach;
	Coach.Open();

	// If Sage is far off, they amble over to stand in front of you.
	if (Dino && DistanceToViewer(Dino) > 250.0f)
	{
		FVector Forward = ViewerRotation().Vector();
		Forward.Z = 0.0f;
		Forward = Forward.GetSafeNormal();
		FVector Spot = ViewerLocation() + Forward * 160.0f;
		Spot.Z = Dino->GetActorLocation().Z;
		Dino->WalkTo(Spot);
	}
}

void ARiftPlayerController::EndCoaching()
{
	Mode = ERiftUIMode::Play;
	Toast(FString::Printf(TEXT("Sage: %s"), *Coach.GetLine().ToString()));
	SaveNow();
}

void ARiftPlayerController::UI_Hack()
{
	ARiftPortal* P = GetSelectedPortal();
	FString Why;
	if (!P || !CanHack(&Why))
	{
		if (!Why.IsEmpty())
		{
			Toast(Why == TEXT("Walk closer")
				? FString::Printf(TEXT("Walk up to %s. You need to be within %.0f m to hack it."), P ? *P->GetPortalName() : TEXT("it"), GetDefault<URiftSettings>()->HackRangeCm / 100.0f)
				: Why);
		}
		return;
	}
	const bool bEnemy = P->GetFaction() == Rift::RivalFaction;
	HackTarget = P;
	Hack.OnFinished = [this](int32 Correct, int32 Total) { FinishHack(Correct, Total); };
	Hack.Start(FMath::Clamp(2 + P->GetLevel() + (bEnemy ? 1 : 0), 3, 7));
	Mode = ERiftUIMode::Hack;
}

void ARiftPlayerController::FinishHack(int32 Correct, int32 Total)
{
	ARiftPortal* P = HackTarget.Get();
	if (!P || Total <= 0)
	{
		return;
	}
	P->MarkHacked(GetWorld()->GetTimeSeconds());
	const bool bPerfect = Correct == Total;

	if (P->GetFaction() == Rift::RivalFaction)
	{
		const float Drain = bPerfect ? 0.7f : 0.6f * Correct / Total;
		const int32 Shards = 1 + Correct / 2;
		Save->Shards += Shards;
		P->AddCharge(-Drain);
		if (P->GetCharge() <= 0.01f)
		{
			Network->SetPortalFaction(P, ERiftFaction::Neutral);
			P->AddCharge(0.5f);
			Toast(FString::Printf(TEXT("Breach! %s collapsed to neutral. Claim it for the Wardens. +%d shards."), *P->GetPortalName(), Shards));
		}
		else
		{
			Toast(FString::Printf(TEXT("Drained %s to %d%%. +%d shards. Hack again when it cools down."),
				*P->GetPortalName(), FMath::RoundToInt(P->GetCharge() * 100.0f), Shards));
		}
	}
	else
	{
		const int32 Shards = 1 + Correct + (bPerfect ? P->GetLevel() : 0);
		int32 NewKeys = 0;
		if (bPerfect)
		{
			NewKeys = P->GetLevel() >= 3 ? 2 : 1;
		}
		else if (Correct * 2 >= Total && FMath::FRand() < 0.5f)
		{
			NewKeys = 1;
		}
		Save->Shards += Shards;
		Keys.FindOrAdd(P->GetId()) += NewKeys;
		Toast(NewKeys > 0
			? FString::Printf(TEXT("+%d shards and %d key%s to %s."), Shards, NewKeys, NewKeys > 1 ? TEXT("s") : TEXT(""), *P->GetPortalName())
			: FString::Printf(TEXT("+%d shards. Nail the full glyph to win a key."), Shards));
	}
	SaveNow();
}

void ARiftPlayerController::UI_HackNode(int32 Node)
{
	if (Mode == ERiftUIMode::Hack)
	{
		Hack.Press(Node);
	}
}

void ARiftPlayerController::UI_Claim()
{
	ARiftPortal* P = GetSelectedPortal();
	if (!P || !CanClaim())
	{
		Toast(TEXT("Not enough shards to claim it."));
		return;
	}
	Save->Shards -= GetDefault<URiftSettings>()->ClaimCost;
	Network->SetPortalFaction(P, Rift::PlayerFaction);
	P->AddCharge(1.0f);
	Keys.FindOrAdd(P->GetId()) += 1;
	Network->SetRivalsActive(true);
	Toast(FString::Printf(TEXT("%s is a Warden rift now. +1 key."), *P->GetPortalName()));
	SaveNow();
}

void ARiftPlayerController::UI_Upgrade()
{
	ARiftPortal* P = GetSelectedPortal();
	if (!P || !CanUpgrade())
	{
		Toast(TEXT("You need more shards or Resolve. Sage can help you earn Resolve."));
		return;
	}
	Save->Shards -= P->GetLevel() * 3;
	Save->Resolve -= P->GetLevel();
	P->Upgrade();
	Toast(FString::Printf(TEXT("%s is level %d. It links further and resists draining."), *P->GetPortalName(), P->GetLevel()));
	SaveNow();
}

void ARiftPlayerController::UI_Recharge()
{
	ARiftPortal* P = GetSelectedPortal();
	if (!P || !CanRecharge())
	{
		Toast(TEXT("You need Resolve. Check in with Sage, or tick off a habit."));
		return;
	}
	Save->Resolve -= 1;
	P->AddCharge(0.5f);
	Toast(FString::Printf(TEXT("%s recharged to %d%%."), *P->GetPortalName(), FMath::RoundToInt(P->GetCharge() * 100.0f)));
	SaveNow();
}

void ARiftPlayerController::UI_StartLink()
{
	if (!CanStartLink())
	{
		Toast(TEXT("You need a key to another of your rifts. Hack one perfectly to get its key."));
		return;
	}
	LinkSource = GetSelectedPortal();
	Mode = ERiftUIMode::LinkPick;
}

void ARiftPlayerController::UI_CancelLink()
{
	Mode = ERiftUIMode::Play;
	LinkSource = nullptr;
}

void ARiftPlayerController::TryLinkTo(ARiftPortal* Target)
{
	ARiftPortal* Source = LinkSource.Get();
	if (!Source || !Target)
	{
		UI_CancelLink();
		return;
	}
	if (Target == Source)
	{
		Toast(TEXT("Tap a different rift to link to."));
		return;
	}
	if (KeysFor(Target) <= 0)
	{
		Toast(FString::Printf(TEXT("You need a key to %s. Hack it perfectly to get one."), *Target->GetPortalName()));
		return;
	}
	FString Reason;
	if (!Network->CanLink(Source, Target, Reason))
	{
		Toast(Reason);
		return;
	}
	const int32 NewFields = Network->CreateLink(Source, Target);
	Keys.FindOrAdd(Target->GetId()) -= 1;
	Mode = ERiftUIMode::Play;
	LinkSource = nullptr;
	Toast(NewFields > 0
		? FString::Printf(TEXT("Control field raised! %d new field%s earning Aether."), NewFields, NewFields > 1 ? TEXT("s") : TEXT(""))
		: FString::Printf(TEXT("Linked %s to %s."), *Source->GetPortalName(), *Target->GetPortalName()));
}

void ARiftPlayerController::UI_Deselect()
{
	Select(nullptr);
}

void ARiftPlayerController::UI_CoachChoose(int32 Index)
{
	if (Mode == ERiftUIMode::Coach)
	{
		Coach.Choose(Index);
	}
}

void ARiftPlayerController::UI_CoachSubmit(const FString& Text)
{
	if (Mode == ERiftUIMode::Coach)
	{
		Coach.SubmitText(Text);
	}
}

void ARiftPlayerController::UI_CoachLeave()
{
	if (Mode == ERiftUIMode::Coach)
	{
		Mode = ERiftUIMode::Play;
		Coach = FCoachBrain();
		Coach.Init(Save,
			[this](int32 Amount, const FString& Why) { GrantResolve(Amount, Why); },
			[this]() { SaveNow(); });
		SaveNow();
	}
}

// ---------------------------------------------------------------- feedback

void ARiftPlayerController::GrantResolve(int32 Amount, const FString& Why)
{
	Save->Resolve += Amount;
	Save->LifetimeResolve += Amount;
	Toast(FString::Printf(TEXT("+%d Resolve for %s. Spend it to recharge and upgrade rifts."), Amount, *Why));
}

void ARiftPlayerController::Toast(const FString& Message)
{
	ToastText = FText::FromString(Message);
	ToastTime = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0;
}

void ARiftPlayerController::OnNews(const FString& Message)
{
	Toast(Message);
}
