#include "RiftPawn.h"
#include "Camera/CameraComponent.h"

ARiftPawn::ARiftPawn()
{
	PrimaryActorTick.bCanEverTick = false;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Root);
	Camera->bLockToHmd = true;   // ARKit / ARCore drive the camera through the XR tracking system
	Camera->bUsePawnControlRotation = false;
	Camera->SetFieldOfView(65.0f);
}

void ARiftPawn::SetDesktopMode(bool bDesktop)
{
	Camera->bLockToHmd = !bDesktop;
	Camera->bUsePawnControlRotation = bDesktop;
	// Eye height of someone holding a phone.
	Camera->SetRelativeLocation(bDesktop ? FVector(0.0f, 0.0f, 150.0f) : FVector::ZeroVector);
}
