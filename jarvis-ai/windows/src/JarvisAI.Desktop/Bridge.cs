using System.Text.Json;
using System.Text.Json.Nodes;
using JarvisAI.Core;

namespace JarvisAI.Desktop;

/// <summary>
/// The page-to-app bridge (see shared/ui/js/platform.js): requests come in as
/// {"id", "method", "params"} and each gets one {"id", "result"|"error"} reply.
/// </summary>
sealed partial class MainForm
{
    bool readOnlyAllowedThisSession;
    CancellationTokenSource? stopRequested;

    async void HandleMessage(string raw)
    {
        int id = 0;
        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            id = root.TryGetProperty("id", out var idEl) && idEl.TryGetInt32(out var i) ? i : 0;
            var method = root.GetProperty("method").GetString() ?? "";
            var p = root.TryGetProperty("params", out var pe) && pe.ValueKind == JsonValueKind.Object ? pe.Clone() : JsonDocument.Parse("{}").RootElement;
            var result = await Dispatch(method, p);
            Post(new { id, result });
        }
        catch (Exception e)
        {
            var code = e is NotSupportedException ? "unsupported" : e is ToolException ? "rejected" : "error";
            Post(new { id, error = new { message = e.Message, code } });
        }
    }

    static string S(JsonElement p, string name, string fallback = "") =>
        p.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? fallback : fallback;

    static double D(JsonElement p, string name, double fallback) =>
        p.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : fallback;

    async Task<object?> Dispatch(string method, JsonElement p)
    {
        switch (method)
        {
            case "host.info":
                var stt = speech.RecognitionAvailable;
                return new
                {
                    platform = "windows",
                    version = Application.ProductVersion.Split('+')[0],
                    capabilities = new { stt, tts = true, wakeWord = stt, pcTools = true, files = true, secureStorage = true, permissions = true },
                };

            case "storage.get": return SecureStore.Get(S(p, "key"));
            case "storage.set": SecureStore.Set(S(p, "key"), S(p, "value")); return true;
            case "storage.remove": SecureStore.Remove(S(p, "key")); return true;

            case "stt.start": speech.StartDictation(S(p, "lang", "en-GB")); return true;
            case "stt.stop": speech.StopDictation(); return true;
            case "stt.cancel": speech.CancelDictation(); return true;
            case "tts.voices": return speech.Voices();
            case "tts.speak":
                speech.Speak(S(p, "text"), S(p, "id"), D(p, "rate", 1), D(p, "volume", 1), S(p, "voice"));
                return true;
            case "tts.stop": speech.StopSpeaking(); return true;
            case "wake.start": speech.StartWake(S(p, "phrase", "Jarvis"), S(p, "lang", "en-GB")); return true;
            case "wake.stop": speech.StopWake(); return true;

            case "tools.list": return tools.Definitions();
            case "tools.execute": return await ExecuteTool(p.GetProperty("call"));
            case "tools.cancel":
                stopRequested?.Cancel();
                ConfirmDialog.DenyCurrent();
                return true;
            case "tools.emergencyStop": EmergencyStop(); return true;
            case "tools.getConfig":
                return new
                {
                    folders = toolConfig.Folders,
                    apps = toolConfig.Apps.Select(a => new { name = a.Name, path = a.Path, builtin = a.Builtin }),
                    commands = toolConfig.Commands.Select(c => new { name = c.Name, command = c.Command, cwd = c.Cwd }),
                    notesFolder = toolConfig.NotesFolder,
                    backupFolder = toolConfig.BackupFolder,
                    logPath = actionLog.FilePath,
                    hotkey = StopHotkeyText,
                    listenHotkey = ListenHotkeyText,
                };
            case "tools.addFolder":
            {
                using var dlg = new FolderBrowserDialog { Description = "Choose a folder JARVIS may search, read and (with your OK) write in", UseDescriptionForTitle = true };
                if (dlg.ShowDialog(this) != DialogResult.OK) throw new ToolException("No folder chosen.");
                var full = toolConfig.AddFolder(dlg.SelectedPath);
                actionLog.Write("CONFIG", $"Approved folder {full}");
                return true;
            }
            case "tools.removeFolder":
                toolConfig.RemoveFolder(S(p, "path"));
                actionLog.Write("CONFIG", $"Removed folder {S(p, "path")}");
                return true;
            case "tools.addApp":
            {
                using var dlg = new OpenFileDialog { Title = "Choose a program or shortcut JARVIS may open", Filter = "Programs and shortcuts|*.exe;*.lnk;*.url;*.appref-ms" };
                if (dlg.ShowDialog(this) != DialogResult.OK) throw new ToolException("No program chosen.");
                var name = Path.GetFileNameWithoutExtension(dlg.FileName);
                toolConfig.AddApp(name, dlg.FileName);
                actionLog.Write("CONFIG", $"Approved app {name} = {dlg.FileName}");
                return true;
            }
            case "tools.removeApp":
                toolConfig.RemoveApp(S(p, "name"));
                actionLog.Write("CONFIG", $"Removed app {S(p, "name")}");
                return true;
            case "tools.addCommand":
            {
                var (name, command, cwd) = (S(p, "name"), S(p, "command"), S(p, "cwd"));
                // Approving a command is itself confirmed natively, so a page can never add one silently.
                var (ok, _) = ConfirmDialog.Ask(this, "APPROVE A COMMAND", $"Let JARVIS run \"{name}\"?",
                    $"Command line:\n  {command}\n\nRuns in:\n  {cwd}\n\nJARVIS will still ask you every time before running it.", false, "Approve");
                if (!ok) throw new ToolException("Not approved.");
                toolConfig.AddCommand(name, command, cwd);
                actionLog.Write("CONFIG", $"Approved command {name}: {command} (in {cwd})");
                return true;
            }
            case "tools.removeCommand":
                toolConfig.RemoveCommand(S(p, "name"));
                actionLog.Write("CONFIG", $"Removed command {S(p, "name")}");
                return true;
            case "tools.log": return actionLog.Tail((int)D(p, "lines", 200));

            case "file.pick":
            {
                using var dlg = new OpenFileDialog
                {
                    Title = "Attach a text or code file",
                    Filter = "Text and code|*.txt;*.md;*.cs;*.js;*.ts;*.jsx;*.tsx;*.json;*.html;*.css;*.py;*.java;*.kt;*.cpp;*.c;*.h;*.hpp;*.xml;*.yaml;*.yml;*.shader;*.hlsl;*.uss;*.uxml;*.csv;*.log;*.ini;*.cfg|All files|*.*",
                };
                if (dlg.ShowDialog(this) != DialogResult.OK) return null;
                return new { name = Path.GetFileName(dlg.FileName), text = TextFileReader.ReadFile(dlg.FileName, 1_200_000) };
            }
            case "file.save":
            {
                using var dlg = new SaveFileDialog { FileName = S(p, "name", "jarvis-export.json"), Filter = "JSON|*.json|All files|*.*" };
                if (dlg.ShowDialog(this) != DialogResult.OK) throw new ToolException("Export cancelled.");
                await File.WriteAllTextAsync(dlg.FileName, S(p, "text"));
                return true;
            }

            case "app.openExternal": OpenExternal(S(p, "url")); return true;
            case "app.permission":
            case "app.requestPermission":
                // Windows has no API to ask; the toggle lives in Settings > Privacy & security > Microphone.
                return new { microphone = speech.RecognitionAvailable ? "unknown" : "denied" };
            case "app.openSystemSettings":
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(S(p, "page") == "speech" ? "ms-settings:speech" : "ms-settings:privacy-microphone") { UseShellExecute = true });
                return true;

            default:
                throw new NotSupportedException($"{method} is not available on Windows");
        }
    }

    /// <summary>Validates the AI's tool call, asks you, runs it and logs every step.</summary>
    async Task<object> ExecuteTool(JsonElement callEl)
    {
        var call = new ToolCall(S(callEl, "id"), S(callEl, "name"), callEl.TryGetProperty("input", out var inp) ? inp.Clone() : default);
        var inputText = call.Input.ValueKind == JsonValueKind.Undefined ? "{}" : call.Input.GetRawText();
        actionLog.Write("REQUEST", $"{call.Name} {Truncate(inputText, 400)}");

        ToolPlan plan;
        try
        {
            plan = tools.Plan(call);
        }
        catch (ToolException e)
        {
            actionLog.Write("REFUSED", $"{call.Name}: {e.Message}");
            return new ToolResult(e.Message, IsError: true, Summary: e.Message);
        }

        var autoAllowed = plan.ReadOnly && readOnlyAllowedThisSession;
        if (!autoAllowed)
        {
            ShowFromTray();
            var (allowed, remember) = ConfirmDialog.Ask(this, "JARVIS WANTS TO", plan.Title, plan.Details, plan.ReadOnly);
            if (!allowed)
            {
                actionLog.Write("DENIED", $"{call.Name}: {plan.Title}");
                return new ToolResult("The user declined this action. Do not retry it unless they ask.", IsError: true, Summary: "You declined.", Declined: true);
            }
            if (remember) readOnlyAllowedThisSession = true;
        }
        actionLog.Write("ALLOWED", $"{call.Name}: {plan.Title} | {Truncate(plan.Details.Split('\n')[0], 300)}{(autoAllowed ? " (auto, read-only)" : "")}");

        stopRequested = new CancellationTokenSource();
        try
        {
            var result = await plan.Run(stopRequested.Token);
            actionLog.Write(result.IsError ? "FAILED" : "DONE", $"{call.Name}: {result.Summary ?? Truncate(result.Content, 200)}");
            return result;
        }
        catch (OperationCanceledException)
        {
            actionLog.Write("STOPPED", call.Name);
            return new ToolResult("Stopped by the user (emergency stop).", IsError: true, Summary: "Stopped.");
        }
        catch (Exception e) when (e is ToolException or IOException or UnauthorizedAccessException)
        {
            actionLog.Write("FAILED", $"{call.Name}: {e.Message}");
            return new ToolResult(e.Message, IsError: true, Summary: e.Message);
        }
        finally
        {
            stopRequested.Dispose();
            stopRequested = null;
        }
    }

    static string Truncate(string s, int max) => s.Length <= max ? s : s[..max] + "…";
}
