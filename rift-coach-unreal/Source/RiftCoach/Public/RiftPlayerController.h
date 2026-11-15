#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "RiftTypes.h"
#include "RiftHack.h"
#include "CoachBrain.h"
#include "RiftPlayerController.generated.h"

class ARiftPortal;
class ADinoCoach;
class ARiftLightRig;
class ARiftReticle;
class URiftNetworkSubsystem;
class URiftSaveGame;
class UARSessionConfig;
class SRiftHud;
class SWidget;

enum class ERiftUIMode : uint8
{
	Play,
	LinkPick,
	Hack,
	Coach
};

/**
 * Runs the game on the phone: starts the AR session, finds the floor, turns taps into
 * actions, applies the rules for hacking, claiming, upgrading, recharging and linking,
 * and hosts Sage's coaching sessions. The Slate HUD reads from and calls into this.
 */
UCLASS()
class RIFTCOACH_API ARiftPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	ARiftPlayerController();

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupInputComponent() override;
	virtual void OnPossess(APawn* InPawn) override;

	// ---- read by the HUD
	ERiftUIMode GetMode() const { return Mode; }
	ARiftPortal* GetSelectedPortal() const;
	bool IsSelectedFaction(ERiftFaction Faction) const;
	FText GetStatsText() const;
	FText GetHintText() const;
	FText GetToastText() const { return ToastText; }
	float GetToastAlpha() const;
	FText GetPortalTitle() const;
	FText GetPortalDetails() const;
	FLinearColor GetSelectedColor() const;

	bool CanOpenRift() const;
	FText GetOpenRiftLabel() const;
	FText GetSageLabel() const;
	bool CanHack(FString* OutWhy = nullptr) const;
	FText GetHackLabel() const;
	bool CanClaim() const;
	FText GetClaimLabel() const;
	bool CanUpgrade() const;
	FText GetUpgradeLabel() const;
	bool CanRecharge() const;
	FText GetRechargeLabel() const;
	bool CanStartLink() const;
	FText GetLinkLabel() const;
	FText GetHackTitle() const;

	const FRiftHack& GetHack() const { return Hack; }
	const FCoachBrain& GetCoach() const { return Coach; }

	// ---- called by the HUD
	void UI_OpenRift();
	void UI_Sage();
	void UI_Hack();
	void UI_Claim();
	void UI_Upgrade();
	void UI_Recharge();
	void UI_StartLink();
	void UI_CancelLink();
	void UI_Deselect();
	void UI_HackNode(int32 Node);
	void UI_CoachChoose(int32 Index);
	void UI_CoachSubmit(const FString& Text);
	void UI_CoachLeave();

private:
	void ApplyPawnMode();
	void StartAR();
	void SetupDesktop();
	void CreateHud();
	void LoadOrCreateSave();
	void SaveNow();

	bool TraceFloor(const FVector2D& ScreenPoint, FVector& OutPoint) const;
	void HandleTap(const FVector2D& ScreenPoint);
	void OnPortalTapped(ARiftPortal* Portal);
	void Select(ARiftPortal* Portal);
	void TryLinkTo(ARiftPortal* Target);
	void FinishHack(int32 Correct, int32 Total);
	void StartCoaching();
	void EndCoaching();
	void GrantResolve(int32 Amount, const FString& Why);
	void Toast(const FString& Message);
	void OnNews(const FString& Message);
	int32 KeysFor(const ARiftPortal* Portal) const;
	float DistanceToViewer(const AActor* Actor) const;
	FVector ViewerLocation() const;
	FRotator ViewerRotation() const;

	void OnTouchPressed(ETouchIndex::Type Finger, FVector Location);
	void OnTouchMoved(ETouchIndex::Type Finger, FVector Location);
	void OnTouchReleased(ETouchIndex::Type Finger, FVector Location);

	UPROPERTY() TObjectPtr<URiftSaveGame> Save;
	UPROPERTY() TObjectPtr<UARSessionConfig> SessionConfig;
	UPROPERTY() TObjectPtr<URiftNetworkSubsystem> Network;
	UPROPERTY() TObjectPtr<ADinoCoach> Dino;
	UPROPERTY() TObjectPtr<ARiftLightRig> LightRig;
	UPROPERTY() TObjectPtr<ARiftReticle> Reticle;
	UPROPERTY() TObjectPtr<ARiftPortal> Selected;
	UPROPERTY() TObjectPtr<ARiftPortal> LinkSource;
	UPROPERTY() TObjectPtr<ARiftPortal> HackTarget;

	TSharedPtr<SRiftHud> Hud;
	TSharedPtr<SWidget> HudHost;

	FRiftHack Hack;
	FCoachBrain Coach;
	int32 SeenCoachVersion = -1;

	ERiftUIMode Mode = ERiftUIMode::Play;
	bool bUseAR = false;
	bool bModeDecided = false;
	bool bHasFloorTarget = false;
	bool bSawAnyPlane = false;
	FVector FloorTarget = FVector::ZeroVector;

	TMap<int32, int32> Keys;   // rift id -> keys held (this session only)

	FText ToastText;
	double ToastTime = -100.0;
	float AutosaveTimer = 0.0f;

	bool bTouchDown = false;
	bool bTouchDragged = false;
	FVector2D TouchStart = FVector2D::ZeroVector;
	FVector2D TouchLast = FVector2D::ZeroVector;
	float DesktopYaw = 0.0f;
	float DesktopPitch = -28.0f;
};
