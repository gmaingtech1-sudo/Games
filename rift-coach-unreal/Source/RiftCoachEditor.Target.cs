using UnrealBuildTool;

public class RiftCoachEditorTarget : TargetRules
{
	public RiftCoachEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("RiftCoach");
	}
}
