# Unity game development with JARVIS

Switch the style chip (left of *Voice replies*) to **Unity game dev**. JARVIS then:

- writes **complete C# scripts** (file name = class name), using the new Input System when relevant;
- tells you exactly **how to hook each script up**: which GameObject, which components (Rigidbody, CharacterController, Collider…), which Inspector fields to fill;
- explains **console errors** (paste the error text) with the cause and the fix;
- designs **systems** step by step: player controllers, enemy AI (state machines, NavMesh), inventories (ScriptableObject items), menus and HUDs (UI Toolkit or uGUI), save systems, quests and levels;
- **reviews code** you paste or attach (paperclip button);
- helps **organise the project** and write **documentation**;
- keeps performance in mind (no `Find` in `Update`, cached components, no per-frame allocations).

JARVIS has not run anything inside Unity, and it says so. Check generated code in Play mode.

## Working on your project from Windows

1. In **Settings > PC tools > Approved folders**, add your Unity project folder (or the folder holding your projects).
2. Ask, for example: *"Give me an overview of my project in D:\Unity\RiftRunner"*. JARVIS uses `unity_project_overview` to see the Unity version, packages, scenes and every script.
3. *"Read PlayerController.cs and find why my player slides on slopes"* uses `read_file` (with your approval).
4. *"Fix it"* uses `write_file`. You see the full new content in the approval window. If you allow it, the old file is first **backed up** to `%APPDATA%\JarvisAI\Backups\<date-time>\…`, then saved. Unity reloads the script automatically.
5. To undo, copy the backup back over the file (or use version control: Git with a Unity `.gitignore` is strongly recommended).

JARVIS never modifies the project without your OK, and the backups mean nothing is lost. It skips `Library`, `Temp`, `obj` and `Logs` when searching. It can't write executables or scripts outside the approved folders, and it can't drive the Unity Editor.

**Useful approved commands** (Settings > PC tools > Approved commands; each still needs your OK when used):
- `git status` and `git diff --stat`, run in the project folder
- `dotnet build` on a separate C# library, if you have one

## On Android

The same Unity style works for questions, designing systems and reviewing scripts you attach. Phones can't access your PC's project folders.

## Prompt ideas

- "Create a third-person controller with jump, sprint and coyote time for the new Input System. Explain the Inspector setup."
- "Design an inventory system with ScriptableObject items, stacking and a UI Toolkit grid."
- "My enemy AI gets stuck on corners using NavMeshAgent. Here's the script…"
- "Plan five levels for a short 2D platformer, with a difficulty curve and one new mechanic per level."
- "Write a README for my project: controls, folder structure, how to build."
