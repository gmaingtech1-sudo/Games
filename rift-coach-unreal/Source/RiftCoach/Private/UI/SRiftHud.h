#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Brushes/SlateColorBrush.h"

class ARiftPlayerController;
class SVerticalBox;
class SEditableTextBox;

/** The whole on-screen UI, built in C++ with Slate so the project needs no UMG assets. */
class SRiftHud : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SRiftHud) {}
		SLATE_ARGUMENT(TWeakObjectPtr<ARiftPlayerController>, Owner)
	SLATE_END_ARGS()

	SRiftHud();
	void Construct(const FArguments& InArgs);

	/** Called by the controller when Sage's choices change. */
	void RebuildCoachChoices();

private:
	using FClick = TFunction<void(ARiftPlayerController&)>;

	TSharedRef<SWidget> MakeButton(const TAttribute<FText>& Label, FClick OnClick, const FLinearColor& Color,
		const TAttribute<bool>& Enabled = true, const TAttribute<EVisibility>& Visibility = EVisibility::Visible, int32 FontSize = 15);

	TSharedRef<SWidget> BuildTop();
	TSharedRef<SWidget> BuildPlayBar();
	TSharedRef<SWidget> BuildPortalPanel();
	TSharedRef<SWidget> BuildLinkBar();
	TSharedRef<SWidget> BuildCoachPanel();
	TSharedRef<SWidget> BuildHackPanel();

	void SubmitCoachText();
	EVisibility VisibleIf(bool bCondition) const { return bCondition ? EVisibility::Visible : EVisibility::Collapsed; }

	TWeakObjectPtr<ARiftPlayerController> Owner;
	TSharedPtr<SVerticalBox> ChoiceBox;
	TSharedPtr<SEditableTextBox> CoachInput;

	FSlateColorBrush PanelBrush;
	FSlateColorBrush ToastBrush;
};
