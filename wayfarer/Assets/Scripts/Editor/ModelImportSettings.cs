using UnityEditor;

namespace Wayfarer.EditorTools
{
    /// <summary>Import settings for the Blender models: plain static meshes, no
    /// animation, cameras, lights or colliders. The game assigns its own
    /// materials by slot name, so imported materials are only placeholders.</summary>
    public sealed class ModelImportSettings : AssetPostprocessor
    {
        void OnPreprocessModel()
        {
            if (!assetPath.Replace('\\', '/').Contains("Assets/Resources/Models/")) return;
            var importer = (ModelImporter)assetImporter;
            importer.globalScale = 1f;
            importer.useFileScale = true;
            importer.importCameras = false;
            importer.importLights = false;
            importer.importVisibility = false;
            importer.importAnimation = false;
            importer.animationType = ModelImporterAnimationType.None;
            importer.importBlendShapes = false;
            importer.addCollider = false;
            importer.isReadable = false;
            importer.meshCompression = ModelImporterMeshCompression.Off;
            importer.importNormals = ModelImporterNormals.Import;
            importer.importTangents = ModelImporterTangents.None;
            importer.generateSecondaryUV = false;
            importer.optimizeMeshPolygons = true;
            importer.optimizeMeshVertices = true;
            importer.weldVertices = true;
            importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
        }
    }
}
