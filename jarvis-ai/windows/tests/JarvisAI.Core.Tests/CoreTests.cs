using System.Text.Json;
using JarvisAI.Core;
using Xunit;

namespace JarvisAI.Core.Tests;

sealed class FakePlatform : IPlatformActions
{
    public List<string> Calls { get; } = new();
    public void OpenApp(AppEntry app) => Calls.Add($"app:{app.Name}");
    public void OpenFolder(string path) => Calls.Add($"folder:{path}");
    public void OpenUrl(string url) => Calls.Add($"url:{url}");
    public void Notify(string title, string message) => Calls.Add($"notify:{title}");
}

public sealed class CoreTests : IDisposable
{
    readonly string temp = Directory.CreateTempSubdirectory("jarvis-tests-").FullName;
    readonly string project;
    readonly string outside;
    readonly ToolConfig config;
    readonly FakePlatform platform = new();
    readonly ToolEngine engine;

    public CoreTests()
    {
        project = Path.Combine(temp, "Projects", "MyGame");
        outside = Path.Combine(temp, "Private");
        Directory.CreateDirectory(Path.Combine(project, "Assets", "Scripts"));
        Directory.CreateDirectory(Path.Combine(project, "ProjectSettings"));
        Directory.CreateDirectory(Path.Combine(project, "Library", "Cache"));
        Directory.CreateDirectory(Path.Combine(project, "Packages"));
        Directory.CreateDirectory(outside);
        File.WriteAllText(Path.Combine(project, "ProjectSettings", "ProjectVersion.txt"), "m_EditorVersion: 6000.2.3f1\nm_EditorVersionWithRevision: x");
        File.WriteAllText(Path.Combine(project, "Packages", "manifest.json"), "{\"dependencies\":{\"com.unity.inputsystem\":\"1.14.0\",\"com.unity.modules.audio\":\"1.0.0\"}}");
        File.WriteAllText(Path.Combine(project, "Assets", "Scripts", "Player.cs"), "using UnityEngine;\npublic class Player : MonoBehaviour {}\n");
        File.WriteAllText(Path.Combine(project, "Assets", "Main.unity"), "%YAML");
        File.WriteAllText(Path.Combine(project, "Library", "Cache", "Player.cs"), "generated");
        File.WriteAllText(Path.Combine(outside, "secrets.txt"), "password");

        config = ToolConfig.Load(Path.Combine(temp, "cfg", "tools.json"), Path.Combine(temp, "Notes"), Path.Combine(temp, "Backups"));
        config.AddFolder(Path.Combine(temp, "Projects"));
        engine = new ToolEngine(config, platform, new CommandRunner());
    }

    public void Dispose() => Directory.Delete(temp, recursive: true);

    static ToolCall Call(string name, object input) => new("t1", name, JsonSerializer.SerializeToElement(input));

    // ---- path policy --------------------------------------------------------------

    [Fact]
    public void PathsInsideApprovedFoldersAreAllowed()
    {
        Assert.True(PathPolicy.TryResolve(config.Folders, Path.Combine(project, "Assets", "Scripts", "Player.cs"), out var full, out _));
        Assert.EndsWith("Player.cs", full);
        Assert.True(PathPolicy.TryResolve(config.Folders, "MyGame/Assets", out _, out _), "relative to the first approved folder");
    }

    [Theory]
    [InlineData("../Private/secrets.txt")]
    [InlineData("MyGame/../../Private/secrets.txt")]
    [InlineData("")]
    public void TraversalAndEmptyPathsAreRefused(string path)
    {
        Assert.False(PathPolicy.TryResolve(config.Folders, path, out _, out var error));
        Assert.NotEmpty(error);
    }

    [Fact]
    public void AbsolutePathsOutsideAreRefused()
    {
        Assert.False(PathPolicy.TryResolve(config.Folders, Path.Combine(outside, "secrets.txt"), out _, out var error));
        Assert.Contains("outside your approved folders", error);
    }

    [Fact]
    public void SiblingFolderWithSamePrefixIsNotInside()
    {
        Directory.CreateDirectory(Path.Combine(temp, "Projects2"));
        Assert.False(PathPolicy.TryResolve(config.Folders, Path.Combine(temp, "Projects2", "x.txt"), out _, out _));
    }

    [Fact]
    public void SymlinkEscapingTheFolderIsRefused()
    {
        var link = Path.Combine(project, "sneaky");
        try { Directory.CreateSymbolicLink(link, outside); }
        catch (Exception) { return; } // symlinks may need extra rights on some systems
        Assert.False(PathPolicy.TryResolve(config.Folders, Path.Combine(link, "secrets.txt"), out _, out var error));
        Assert.Contains("link", error);
    }

    [Fact]
    public void AlternateDataStreamsAndDevicePathsAreRefused()
    {
        Assert.False(PathPolicy.TryResolve(config.Folders, Path.Combine(project, "a.txt") + ":hidden", out _, out _));
        Assert.False(PathPolicy.TryResolve(config.Folders, @"\\?\C:\Windows\System32", out _, out _));
    }

    [Fact]
    public void NothingIsAllowedWithoutApprovedFolders()
    {
        Assert.False(PathPolicy.TryResolve(Array.Empty<string>(), project, out _, out var error));
        Assert.Contains("No folders are approved", error);
    }

    // ---- config -------------------------------------------------------------------

    [Fact]
    public void ConfigRoundTripsAndKeepsBuiltinApps()
    {
        config.AddCommand("Run tests", "dotnet test", project);
        var again = ToolConfig.Load(config.FilePath!, "n", "b");
        Assert.Contains(again.Folders, f => f.EndsWith("Projects"));
        Assert.Single(again.Commands);
        Assert.Contains(again.Apps, a => a.Name == "Notepad" && a.Builtin);
        Assert.DoesNotContain("Notepad", File.ReadAllText(config.FilePath!));
    }

    [Fact]
    public void CommandsMustRunInsideApprovedFoldersAndBeOneLine()
    {
        Assert.Throws<ToolException>(() => config.AddCommand("x", "echo hi", outside));
        Assert.Throws<ToolException>(() => config.AddCommand("x", "echo hi\nrmdir /s /q C:\\", project));
    }

    [Fact]
    public void RemovingAFolderRemovesItsCommands()
    {
        config.AddCommand("Build", "dotnet build", project);
        config.RemoveFolder(config.Folders[0]);
        Assert.Empty(config.Commands);
    }

    [Fact]
    public void WholeDrivesCannotBeApproved()
    {
        Assert.Throws<ToolException>(() => config.AddFolder(Path.GetPathRoot(temp)!));
    }

    [Fact]
    public void CorruptConfigUnlocksNothing()
    {
        File.WriteAllText(config.FilePath!, "{not json");
        var again = ToolConfig.Load(config.FilePath!, "n", "b");
        Assert.Empty(again.Folders);
        Assert.Empty(again.Commands);
    }

    // ---- tools --------------------------------------------------------------------------

    [Fact]
    public void ToolDefinitionsUseAnObjectSchema()
    {
        var defs = engine.Definitions();
        Assert.Equal(12, defs.Count);
        foreach (var d in defs)
        {
            Assert.Equal("object", d!["input_schema"]!["type"]!.GetValue<string>());
            Assert.Matches("^[a-z_]+$", d["name"]!.GetValue<string>());
        }
    }

    [Fact]
    public async Task OnlyApprovedAppsOpen()
    {
        var plan = engine.Plan(Call("open_app", new { name = "notepad" }));
        Assert.False(plan.ReadOnly);
        await plan.Run(CancellationToken.None);
        Assert.Equal("app:Notepad", platform.Calls.Single());
        Assert.Throws<ToolException>(() => engine.Plan(Call("open_app", new { name = "powershell" })));
    }

    [Fact]
    public void OnlyWebUrlsOpen()
    {
        engine.Plan(Call("open_website", new { url = "https://docs.unity3d.com/Manual" }));
        Assert.Throws<ToolException>(() => engine.Plan(Call("open_website", new { url = "file:///C:/Windows" })));
        Assert.Throws<ToolException>(() => engine.Plan(Call("open_website", new { url = "ms-settings:privacy" })));
    }

    [Fact]
    public async Task SearchSkipsGeneratedFolders()
    {
        var result = await engine.Plan(Call("search_files", new { query = "*.cs" })).Run(CancellationToken.None);
        Assert.Contains("Player.cs", result.Content);
        Assert.DoesNotContain("Library", result.Content);
    }

    [Fact]
    public async Task ReadFileInsideAndRefuseOutside()
    {
        var ok = await engine.Plan(Call("read_file", new { path = Path.Combine(project, "Assets", "Scripts", "Player.cs") })).Run(CancellationToken.None);
        Assert.Contains("MonoBehaviour", ok.Content);
        Assert.Throws<ToolException>(() => engine.Plan(Call("read_file", new { path = Path.Combine(outside, "secrets.txt") })));
    }

    [Fact]
    public void BinaryFilesAreNotReadAsText()
    {
        var bin = Path.Combine(project, "image.png");
        File.WriteAllBytes(bin, new byte[] { 0x89, 0x50, 0x00, 0x47 });
        Assert.Throws<ToolException>(() => FileTools.Read(bin));
    }

    [Fact]
    public async Task WritingBacksUpTheOldVersion()
    {
        var target = Path.Combine(project, "Assets", "Scripts", "Player.cs");
        var plan = engine.Plan(Call("write_file", new { path = target, content = "public class Player {}\n" }));
        Assert.Contains("OVERWRITES", plan.Details);
        var result = await plan.Run(CancellationToken.None);
        Assert.False(result.IsError);
        Assert.Equal("public class Player {}\n", File.ReadAllText(target));
        var backups = Directory.GetFiles(config.BackupFolder, "Player.cs", SearchOption.AllDirectories);
        Assert.Single(backups);
        Assert.Contains("MonoBehaviour", File.ReadAllText(backups[0]));
    }

    [Theory]
    [InlineData("evil.bat")]
    [InlineData("run.ps1")]
    [InlineData("tool.exe")]
    [InlineData("link.lnk")]
    public void ExecutableFilesCannotBeWritten(string name)
    {
        Assert.Throws<ToolException>(() => engine.Plan(Call("write_file", new { path = Path.Combine(project, name), content = "x" })));
    }

    [Fact]
    public async Task NotesAreNeverOverwritten()
    {
        var a = await engine.Plan(Call("create_note", new { title = "Level ideas: forest/cave", content = "Boss at the end" })).Run(CancellationToken.None);
        var b = await engine.Plan(Call("create_note", new { title = "Level ideas: forest/cave", content = "Second" })).Run(CancellationToken.None);
        var files = Directory.GetFiles(config.NotesFolder);
        Assert.Equal(2, files.Length);
        Assert.All(files, f => Assert.DoesNotContain("/", Path.GetFileName(f)));
        Assert.NotEqual(a.Content, b.Content);
    }

    [Fact]
    public async Task UnityOverviewFindsVersionPackagesAndScripts()
    {
        var r = await engine.Plan(Call("unity_project_overview", new { path = Path.Combine(project, "Assets") })).Run(CancellationToken.None);
        Assert.Contains("6000.2.3f1", r.Content);
        Assert.Contains("com.unity.inputsystem@1.14.0", r.Content);
        Assert.DoesNotContain("com.unity.modules.audio", r.Content);
        Assert.Contains(Path.Combine("Assets", "Scripts", "Player.cs"), r.Content);
        Assert.Contains("Main.unity", r.Content);
    }

    [Fact]
    public void OnlyApprovedCommandsRun()
    {
        Assert.Throws<ToolException>(() => engine.Plan(Call("run_command", new { name = "format c:" })));
        config.AddCommand("Say hi", OperatingSystem.IsWindows() ? "echo hi" : "echo hi", project);
        var plan = engine.Plan(Call("run_command", new { name = "say HI" }));
        Assert.Contains("echo hi", plan.Details);
    }

    [Fact]
    public async Task ApprovedCommandOutputAndExitCodeAreReturned()
    {
        config.AddCommand("Fail", OperatingSystem.IsWindows() ? "echo out & exit 3" : "echo out; exit 3", project);
        var r = await engine.Plan(Call("run_command", new { name = "Fail" })).Run(CancellationToken.None);
        Assert.True(r.IsError);
        Assert.Contains("exited with code 3", r.Content);
        Assert.Contains("out", r.Content);
    }

    [Fact]
    public async Task EmergencyStopKillsRunningCommands()
    {
        var runner = new CommandRunner();
        var cmd = new CommandEntry("Sleep", OperatingSystem.IsWindows() ? "ping -n 30 127.0.0.1" : "sleep 30", project);
        using var cts = new CancellationTokenSource();
        var task = runner.RunAsync(cmd, TimeSpan.FromMinutes(1), cts.Token);
        await Task.Delay(500);
        Assert.Equal(1, runner.KillAll());
        var (exit, _, timedOut) = await task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.False(timedOut);
        Assert.NotEqual(0, exit);
    }

    [Fact]
    public async Task CommandsTimeOut()
    {
        var runner = new CommandRunner();
        var cmd = new CommandEntry("Sleep", OperatingSystem.IsWindows() ? "ping -n 30 127.0.0.1" : "sleep 30", project);
        var (_, _, timedOut) = await runner.RunAsync(cmd, TimeSpan.FromMilliseconds(400), CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(10));
        Assert.True(timedOut);
    }

    [Fact]
    public void BadToolInputIsRejectedClearly()
    {
        var e = Assert.Throws<ToolException>(() => engine.Plan(Call("read_file", new { file = "x" })));
        Assert.Contains("Missing \"path\"", e.Message);
        Assert.Throws<ToolException>(() => engine.Plan(Call("read_file", new { path = 42 })));
        Assert.Throws<ToolException>(() => engine.Plan(Call("delete_file", new { path = "x" })));
    }

    [Fact]
    public void TextDecodingHandlesBomAndLegacyEncodings()
    {
        Assert.Equal("hi", TextFileReader.Decode("a", new byte[] { 0xEF, 0xBB, 0xBF, (byte)'h', (byte)'i' }, 100));
        Assert.Equal("café", TextFileReader.Decode("a", new byte[] { (byte)'c', (byte)'a', (byte)'f', 0xE9 }, 100));
        Assert.Throws<ToolException>(() => TextFileReader.Decode("a", new byte[200], 100));
    }

    [Fact]
    public void ActionLogAppendsAndTails()
    {
        var log = new ActionLog(Path.Combine(temp, "log", "actions.log"));
        log.Write("REQUEST", "open_app notepad");
        log.Write("ALLOWED", "line\nbreak");
        var tail = log.Tail(1);
        Assert.Contains("ALLOWED", tail);
        Assert.DoesNotContain("\n", tail);
    }
}
