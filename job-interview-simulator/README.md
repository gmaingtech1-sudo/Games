# Job Interview Simulator

A first-person cartoon comedy game made in Unity. SynergyCorp is hiring, and
Mr. Pemberton from HR has eight questions for you. You can answer them like a
normal, sensible person... or you can punch him, shoot him, throw a stapler at
his head or chuck hot coffee in his face.

Every time he goes flying he gets back up with a fresh bandage (forehead
plasters, head wrap, arm cast, neck brace, eye patch...) and carries on with the
interview, getting more and more nervous. Hit him while he's down for a combo.
Knock all his composure out of him and you get his job.

It's slapstick: no blood, just "POW!", cartoon stars and an increasingly
bandaged HR manager.

## How to open it

1. Install [Unity Hub](https://unity.com/download) and any recent Unity editor
   (Unity 6 or 2022.3 LTS both work).
2. In Unity Hub choose **Add → Add project from disk** and pick this
   `job-interview-simulator` folder. If Hub asks which editor version to use,
   pick the one you installed.
3. Wait for Unity to import it. The first time it opens, the project makes and
   opens a scene called `Assets/Scenes/Interview.unity` by itself.
4. Press **Play**.

Everything (the office, Mr. Pemberton, the sounds and the menus) is built by
the scripts when you press Play, so there are no art or sound files to go
missing. If you'd rather copy it into a project of your own, copy the `Assets`
folder in and press Play in any scene.

To make a game you can send to people: **File → Build Profiles** (or **Build
Settings** in older Unity), pick Windows or Mac, and press **Build**.

## Controls

| Input | What it does |
| --- | --- |
| Mouse | Aim |
| Left click | Use your item on whatever you're aiming at |
| 1 / 2 / 3 / 4 or scroll wheel | Fist / Pistol / Stapler / Coffee |
| Click an answer | Answer the question like a grown-up |
| Space | Skip what he's saying |
| R | Interview again (on the results screen) |

## Endings

There are six: hired, kept "on file", hired on probation, rejected, Head of
Security, and promoted to his job. Which one you get depends on how many
questions you answer with violence and your Hireability score. Hitting him
changes your score as well, since it shows "+15 INITIATIVE" and
"-15 TEAM PLAYER".

## Code

| File | What's in it |
| --- | --- |
| `Assets/Scripts/InterviewGame.cs` | Builds the office, runs the interview, the items and all the UI |
| `Assets/Scripts/Interviewer.cs` | Mr. Pemberton: his body, ragdoll flights, getting back up, bandages |
| `Assets/Scripts/InterviewScript.cs` | Every question, answer and reaction line. Edit this to write your own jokes |
| `Assets/Scripts/Projectile.cs` | Thrown staplers and coffee mugs |
| `Assets/Scripts/Sfx.cs` | All sound effects, synthesised in code |
| `Assets/Scripts/Shapes.cs` | Helpers for building things out of cubes and spheres |
| `Assets/Editor/JobInterviewSetup.cs` | Makes the scene the first time the project opens |
