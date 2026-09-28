// Riftborn — HTTP requests with async/await (weather, Firebase, Google Maps).
using System.Threading.Tasks;
using UnityEngine.Networking;

namespace Riftborn
{
    public static class Net
    {
        public struct Reply { public long status; public string text; public bool offline; }

        public static Task<Reply> Request(string method, string url, string body = null, string contentType = "application/json", string bearer = null)
        {
            var tcs = new TaskCompletionSource<Reply>();
            var req = new UnityWebRequest(url, method) { downloadHandler = new DownloadHandlerBuffer(), timeout = 20 };
            if (body != null)
            {
                req.uploadHandler = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(body));
                req.SetRequestHeader("Content-Type", contentType);
            }
            if (bearer != null) req.SetRequestHeader("Authorization", "Bearer " + bearer);
            var op = req.SendWebRequest();
            op.completed += (_) =>
            {
                var r = new Reply
                {
                    status = req.responseCode,
                    text = req.downloadHandler != null ? req.downloadHandler.text : "",
                    offline = req.result == UnityWebRequest.Result.ConnectionError,
                };
                req.Dispose();
                tcs.SetResult(r);
            };
            return tcs.Task;
        }
    }
}
