#include "RiftGameMode.h"
#include "RiftPawn.h"
#include "RiftPlayerController.h"

ARiftGameMode::ARiftGameMode()
{
	DefaultPawnClass = ARiftPawn::StaticClass();
	PlayerControllerClass = ARiftPlayerController::StaticClass();
}
