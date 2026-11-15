#include "SRiftHud.h"
#include "RiftPlayerController.h"
#include "RiftPortal.h"

#include "Styling/CoreStyle.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SSafeZone.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SUniformGridPanel.h"
#include "Widgets/Text/STextBlock.h"

namespace
{
	FSlateFontInfo Font(int32 Size, bool bBold = false)
	{
		return FCoreStyle::GetDefaultFontStyle(bBold ? "Bold" : "Regular", Size);
	}

	const FLinearColor Teal(0.02f, 0.45f, 0.40f);
	const FLinearColor Magenta(0.55f, 0.05f, 0.38f);
	const FLinearColor Slate(0.18f, 0.20f, 0.26f);
	const FLinearColor Amber(0.65f, 0.40f, 0.05f);
	const FLinearColor Moss(0.20f, 0.36f, 0.12f);
	const FLinearColor TextColor(0.95f, 0.97f, 1.0f);
	const FLinearColor DimText(0.70f, 0.76f, 0.82f);
}

SRiftHud::SRiftHud()
	: PanelBrush(FLinearColor(0.01f, 0.02f, 0.04f, 0.78f))
	, ToastBrush(FLinearColor(0.0f, 0.0f, 0.0f, 0.7f))
{
}

void SRiftHud::Construct(const FArguments& InArgs)
{
	Owner = InArgs._Owner;

	ChildSlot
	[
		SNew(SSafeZone)
		.Visibility(EVisibility::SelfHitTestInvisible)
		[
			SNew(SOverlay)
			.Visibility(EVisibility::SelfHitTestInvisible)

			+ SOverlay::Slot()
			.HAlign(HAlign_Fill)
			.VAlign(VAlign_Top)
			.Padding(12.0f)
			[
				BuildTop()
			]

			+ SOverlay::Slot()
			.HAlign(HAlign_Center)
			.VAlign(VAlign_Center)
			[
				BuildHackPanel()
			]

			+ SOverlay::Slot()
			.HAlign(HAlign_Fill)
			.VAlign(VAlign_Bottom)
			.Padding(12.0f)
			[
				SNew(SVerticalBox)
				.Visibility(EVisibility::SelfHitTestInvisible)
				+ SVerticalBox::Slot().AutoHeight() [ BuildPlayBar() ]
				+ SVerticalBox::Slot().AutoHeight() [ BuildPortalPanel() ]
				+ SVerticalBox::Slot().AutoHeight() [ BuildLinkBar() ]
				+ SVerticalBox::Slot().AutoHeight() [ BuildCoachPanel() ]
			]
		]
	];
}

TSharedRef<SWidget> SRiftHud::MakeButton(const TAttribute<FText>& Label, FClick OnClick, const FLinearColor& Color,
	const TAttribute<bool>& Enabled, const TAttribute<EVisibility>& Visibility, int32 FontSize)
{
	TWeakObjectPtr<ARiftPlayerController> Weak = Owner;
	return SNew(SButton)
		.ButtonColorAndOpacity(Color)
		.IsEnabled(Enabled)
		.Visibility(Visibility)
		.HAlign(HAlign_Center)
		.VAlign(VAlign_Center)
		.ContentPadding(FMargin(14.0f, 11.0f))
		.OnClicked_Lambda([Weak, OnClick]()
		{
			if (ARiftPlayerController* PC = Weak.Get())
			{
				OnClick(*PC);
			}
			return FReply::Handled();
		})
		[
			SNew(STextBlock)
			.Text(Label)
			.Font(Font(FontSize, true))
			.ColorAndOpacity(TextColor)
			.Justification(ETextJustify::Center)
			.AutoWrapText(true)
		];
}

// ---------------------------------------------------------------- top: stats, hint, toast

TSharedRef<SWidget> SRiftHud::BuildTop()
{
	return SNew(SVerticalBox)
		.Visibility(EVisibility::HitTestInvisible)

		+ SVerticalBox::Slot().AutoHeight()
		[
			SNew(SBorder)
			.BorderImage(&PanelBrush)
			.Padding(FMargin(14.0f, 9.0f))
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()
				[
					SNew(STextBlock)
					.Font(Font(15, true))
					.ColorAndOpacity(TextColor)
					.Text_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return PC ? PC->GetStatsText() : FText::GetEmpty(); })
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.0f, 4.0f, 0.0f, 0.0f)
				[
					SNew(STextBlock)
					.Font(Font(13))
					.ColorAndOpacity(DimText)
					.AutoWrapText(true)
					.Text_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return PC ? PC->GetHintText() : FText::GetEmpty(); })
					.Visibility_Lambda([this]()
					{
						const ARiftPlayerController* PC = Owner.Get();
						return VisibleIf(PC && !PC->GetHintText().IsEmpty());
					})
				]
			]
		]

		+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.0f, 10.0f, 0.0f, 0.0f)
		[
			SNew(SBorder)
			.BorderImage(&ToastBrush)
			.Padding(FMargin(16.0f, 10.0f))
			.Visibility_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return VisibleIf(PC && PC->GetToastAlpha() > 0.0f); })
			.ColorAndOpacity_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return FLinearColor(1, 1, 1, PC ? PC->GetToastAlpha() : 0.0f); })
			.BorderBackgroundColor_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return FSlateColor(FLinearColor(1, 1, 1, PC ? PC->GetToastAlpha() : 0.0f)); })
			[
				SNew(SBox)
				.MaxDesiredWidth(560.0f)
				[
					SNew(STextBlock)
					.Font(Font(15))
					.ColorAndOpacity(TextColor)
					.AutoWrapText(true)
					.Justification(ETextJustify::Center)
					.Text_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return PC ? PC->GetToastText() : FText::GetEmpty(); })
				]
			]
		];
}

// ---------------------------------------------------------------- bottom bars

TSharedRef<SWidget> SRiftHud::BuildPlayBar()
{
	return SNew(SHorizontalBox)
		.Visibility_Lambda([this]()
		{
			const ARiftPlayerController* PC = Owner.Get();
			return VisibleIf(PC && PC->GetMode() == ERiftUIMode::Play && !PC->GetSelectedPortal());
		})
		+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(4.0f)
		[
			MakeButton(
				TAttribute<FText>::CreateLambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return PC ? PC->GetOpenRiftLabel() : FText::GetEmpty(); }),
				[](ARiftPlayerController& PC) { PC.UI_OpenRift(); },
				Teal,
				TAttribute<bool>::CreateLambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return PC && PC->CanOpenRift(); }),
				EVisibility::Visible, 17)
		]
		+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(4.0f)
		[
			MakeButton(
				TAttribute<FText>::CreateLambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return PC ? PC->GetSageLabel() : FText::GetEmpty(); }),
				[](ARiftPlayerController& PC) { PC.UI_Sage(); },
				Moss, true, EVisibility::Visible, 17)
		];
}

TSharedRef<SWidget> SRiftHud::BuildPortalPanel()
{
	auto Faction = [this](ERiftFaction F)
	{
		return TAttribute<EVisibility>::CreateLambda([this, F]()
		{
			const ARiftPlayerController* PC = Owner.Get();
			return VisibleIf(PC && PC->IsSelectedFaction(F));
		});
	};
	auto Label = [this](FText (ARiftPlayerController::*Getter)() const)
	{
		return TAttribute<FText>::CreateLambda([this, Getter]() { const ARiftPlayerController* PC = Owner.Get(); return PC ? (PC->*Getter)() : FText::GetEmpty(); });
	};
	auto Enabled = [this](bool (ARiftPlayerController::*Check)() const)
	{
		return TAttribute<bool>::CreateLambda([this, Check]() { const ARiftPlayerController* PC = Owner.Get(); return PC && (PC->*Check)(); });
	};

	return SNew(SBorder)
		.BorderImage(&PanelBrush)
		.Padding(14.0f)
		.Visibility_Lambda([this]()
		{
			const ARiftPlayerController* PC = Owner.Get();
			return VisibleIf(PC && PC->GetMode() == ERiftUIMode::Play && PC->GetSelectedPortal());
		})
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(STextBlock)
				.Font(Font(18, true))
				.ColorAndOpacity_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return FSlateColor(PC ? PC->GetSelectedColor() : TextColor); })
				.Text(Label(&ARiftPlayerController::GetPortalTitle))
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.0f, 4.0f, 0.0f, 10.0f)
			[
				SNew(STextBlock)
				.Font(Font(13))
				.ColorAndOpacity(DimText)
				.AutoWrapText(true)
				.Text(Label(&ARiftPlayerController::GetPortalDetails))
			]
			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(3.0f)
				[
					MakeButton(TAttribute<FText>::CreateLambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return PC ? PC->GetHackLabel() : FText::GetEmpty(); }),
						[](ARiftPlayerController& PC) { PC.UI_Hack(); }, Amber)
				]
				+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(3.0f)
				[
					MakeButton(Label(&ARiftPlayerController::GetClaimLabel), [](ARiftPlayerController& PC) { PC.UI_Claim(); }, Teal,
						Enabled(&ARiftPlayerController::CanClaim), Faction(ERiftFaction::Neutral))
				]
				+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(3.0f)
				[
					MakeButton(Label(&ARiftPlayerController::GetRechargeLabel), [](ARiftPlayerController& PC) { PC.UI_Recharge(); }, Moss,
						Enabled(&ARiftPlayerController::CanRecharge), Faction(Rift::PlayerFaction))
				]
			]
			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(3.0f)
				[
					MakeButton(Label(&ARiftPlayerController::GetUpgradeLabel), [](ARiftPlayerController& PC) { PC.UI_Upgrade(); }, Teal,
						Enabled(&ARiftPlayerController::CanUpgrade), Faction(Rift::PlayerFaction))
				]
				+ SHorizontalBox::Slot().FillWidth(1.0f).Padding(3.0f)
				[
					MakeButton(Label(&ARiftPlayerController::GetLinkLabel), [](ARiftPlayerController& PC) { PC.UI_StartLink(); }, Teal,
						Enabled(&ARiftPlayerController::CanStartLink), Faction(Rift::PlayerFaction))
				]
				+ SHorizontalBox::Slot().AutoWidth().Padding(3.0f)
				[
					MakeButton(FText::FromString(TEXT("Close")), [](ARiftPlayerController& PC) { PC.UI_Deselect(); }, Slate)
				]
			]
		];
}

TSharedRef<SWidget> SRiftHud::BuildLinkBar()
{
	return SNew(SBorder)
		.BorderImage(&PanelBrush)
		.Padding(14.0f)
		.Visibility_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return VisibleIf(PC && PC->GetMode() == ERiftUIMode::LinkPick); })
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.0f).VAlign(VAlign_Center)
			[
				SNew(STextBlock)
				.Font(Font(15, true))
				.ColorAndOpacity(TextColor)
				.AutoWrapText(true)
				.Text(FText::FromString(TEXT("Tap another of your teal rifts to link to. You need a key to it, and links can't cross.")))
			]
			+ SHorizontalBox::Slot().AutoWidth().Padding(8.0f, 0.0f, 0.0f, 0.0f)
			[
				MakeButton(FText::FromString(TEXT("Cancel")), [](ARiftPlayerController& PC) { PC.UI_CancelLink(); }, Slate)
			]
		];
}

// ---------------------------------------------------------------- Sage

TSharedRef<SWidget> SRiftHud::BuildCoachPanel()
{
	return SNew(SBorder)
		.BorderImage(&PanelBrush)
		.Padding(16.0f)
		.Visibility_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return VisibleIf(PC && PC->GetMode() == ERiftUIMode::Coach); })
		[
			SNew(SVerticalBox)

			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().FillWidth(1.0f).VAlign(VAlign_Center)
				[
					SNew(STextBlock)
					.Font(Font(18, true))
					.ColorAndOpacity(FLinearColor(0.55f, 0.85f, 0.45f))
					.Text(FText::FromString(TEXT("Sage")))
				]
				+ SHorizontalBox::Slot().AutoWidth()
				[
					MakeButton(FText::FromString(TEXT("Leave")), [](ARiftPlayerController& PC) { PC.UI_CoachLeave(); }, Slate, true, EVisibility::Visible, 13)
				]
			]

			+ SVerticalBox::Slot().AutoHeight().Padding(0.0f, 8.0f)
			[
				SNew(SBox)
				.MaxDesiredHeight(560.0f)
				[
					SNew(SScrollBox)
					+ SScrollBox::Slot()
					[
						SNew(STextBlock)
						.Font(Font(16))
						.ColorAndOpacity(TextColor)
						.AutoWrapText(true)
						.Text_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return PC ? PC->GetCoach().GetLine() : FText::GetEmpty(); })
					]
					+ SScrollBox::Slot().Padding(0.0f, 10.0f, 0.0f, 0.0f)
					[
						SAssignNew(ChoiceBox, SVerticalBox)
					]
				]
			]

			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(SHorizontalBox)
				.Visibility_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return VisibleIf(PC && PC->GetCoach().WantsText()); })
				+ SHorizontalBox::Slot().FillWidth(1.0f).VAlign(VAlign_Center)
				[
					SAssignNew(CoachInput, SEditableTextBox)
					.Font(Font(16))
					.OnTextCommitted_Lambda([this](const FText&, ETextCommit::Type CommitType)
					{
						if (CommitType == ETextCommit::OnEnter)
						{
							SubmitCoachText();
						}
					})
				]
				+ SHorizontalBox::Slot().AutoWidth().Padding(8.0f, 0.0f, 0.0f, 0.0f)
				[
					MakeButton(FText::FromString(TEXT("Send")), [this](ARiftPlayerController&) { SubmitCoachText(); }, Moss)
				]
			]
		];
}

void SRiftHud::SubmitCoachText()
{
	ARiftPlayerController* PC = Owner.Get();
	if (!PC || !CoachInput.IsValid())
	{
		return;
	}
	const FString Text = CoachInput->GetText().ToString();
	CoachInput->SetText(FText::GetEmpty());
	PC->UI_CoachSubmit(Text);
}

void SRiftHud::RebuildCoachChoices()
{
	const ARiftPlayerController* PC = Owner.Get();
	if (!PC || !ChoiceBox.IsValid())
	{
		return;
	}
	ChoiceBox->ClearChildren();

	const TArray<FCoachBrain::FChoice>& Choices = PC->GetCoach().GetChoices();
	for (int32 i = 0; i < Choices.Num(); ++i)
	{
		ChoiceBox->AddSlot()
		.AutoHeight()
		.Padding(0.0f, 3.0f)
		[
			MakeButton(Choices[i].Label, [i](ARiftPlayerController& Controller) { Controller.UI_CoachChoose(i); }, i == Choices.Num() - 1 ? Slate : Moss)
		];
	}

	if (CoachInput.IsValid() && PC->GetCoach().WantsText())
	{
		CoachInput->SetText(FText::GetEmpty());
		CoachInput->SetHintText(PC->GetCoach().GetTextHint());
	}
}

// ---------------------------------------------------------------- hacking

TSharedRef<SWidget> SRiftHud::BuildHackPanel()
{
	TSharedRef<SUniformGridPanel> Grid = SNew(SUniformGridPanel).SlotPadding(FMargin(9.0f));

	for (int32 Node = 0; Node < FRiftHack::NumNodes; ++Node)
	{
		Grid->AddSlot(Node % 3, Node / 3)
		[
			SNew(SBox)
			.WidthOverride(84.0f)
			.HeightOverride(84.0f)
			[
				SNew(SButton)
				.ButtonColorAndOpacity_Lambda([this, Node]() -> FSlateColor
				{
					const ARiftPlayerController* PC = Owner.Get();
					if (!PC)
					{
						return FSlateColor(Slate);
					}
					const FRiftHack& Hack = PC->GetHack();
					if (Hack.GetPhase() == EHackPhase::Result)
					{
						return FSlateColor(Hack.IsPerfect() ? FLinearColor(0.1f, 0.7f, 0.3f) : FLinearColor(0.35f, 0.08f, 0.1f));
					}
					if (Hack.GetShownNode() == Node)
					{
						return FSlateColor(FLinearColor(0.2f, 1.0f, 0.95f));
					}
					if (Hack.GetFlashNode() == Node)
					{
						return FSlateColor(Hack.WasFlashGood() ? FLinearColor(0.3f, 1.0f, 0.4f) : FLinearColor(1.0f, 0.2f, 0.2f));
					}
					return FSlateColor(Hack.GetPhase() == EHackPhase::Input ? FLinearColor(0.15f, 0.28f, 0.42f) : FLinearColor(0.1f, 0.12f, 0.18f));
				})
				.OnClicked_Lambda([this, Node]()
				{
					if (ARiftPlayerController* PC = Owner.Get())
					{
						PC->UI_HackNode(Node);
					}
					return FReply::Handled();
				})
			]
		];
	}

	return SNew(SBorder)
		.BorderImage(&PanelBrush)
		.Padding(20.0f)
		.Visibility_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return VisibleIf(PC && PC->GetMode() == ERiftUIMode::Hack); })
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
			[
				SNew(STextBlock)
				.Font(Font(18, true))
				.ColorAndOpacity(FLinearColor(0.3f, 1.0f, 0.9f))
				.Text_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return PC ? PC->GetHackTitle() : FText::GetEmpty(); })
			]
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.0f, 6.0f, 0.0f, 10.0f)
			[
				SNew(STextBlock)
				.Font(Font(15))
				.ColorAndOpacity(TextColor)
				.Text_Lambda([this]() { const ARiftPlayerController* PC = Owner.Get(); return PC ? FText::FromString(PC->GetHack().GetStatus()) : FText::GetEmpty(); })
			]
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
			[
				Grid
			]
		];
}
