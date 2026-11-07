using System.Globalization;
using System.Text;
using Valve.VR;

namespace SullysMiiBongo;

sealed class VrTracker : IDisposable
{
    public event Action<string>? Message;

    public string Status { get; private set; } = "arrêté";

    Thread? _thread;
    volatile bool _running;
    CVRSystem? _system;

    public void Start()
    {
        if (_running) return;
        _running = true;
        _thread = new Thread(Loop) { IsBackground = true, Name = "VrTracker" };
        _thread.Start();
    }

    public void Stop()
    {
        _running = false;
        _thread?.Join(1000);
        _thread = null;
        ShutdownVr();
        Status = "arrêté";
    }

    void Loop()
    {
        var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
        var ev = new VREvent_t();
        uint evSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf<VREvent_t>();
        uint stateSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf<VRControllerState_t>();
        long nextStatus = 0, nextInit = 0;

        while (_running)
        {
            long now = Environment.TickCount64;

            if (_system == null)
            {
                if (now >= nextInit)
                {
                    nextInit = now + 3000;
                    TryInit();
                }
                if (now >= nextStatus) { nextStatus = now + 1000; SendStatus(); }
                Thread.Sleep(100);
                continue;
            }

            try
            {
                while (_system.PollNextEvent(ref ev, evSize))
                {
                    if (ev.eventType == (uint)EVREventType.VREvent_Quit)
                    {
                        _system.AcknowledgeQuit_Exiting();
                        ShutdownVr();
                        Status = "SteamVR fermé";
                        nextInit = now + 5000;
                        break;
                    }
                }
                if (_system == null) continue;

                _system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
                uint left = _system.GetTrackedDeviceIndexForControllerRole(ETrackedControllerRole.LeftHand);
                uint right = _system.GetTrackedDeviceIndexForControllerRole(ETrackedControllerRole.RightHand);

                var sb = new StringBuilder(256);
                sb.Append("{\"t\":\"vr\"");
                AppendPose(sb, "h", poses, OpenVR.k_unTrackedDeviceIndex_Hmd);
                AppendPose(sb, "l", poses, left);
                AppendPose(sb, "r", poses, right);
                AppendTrigger(sb, "tl", left, stateSize);
                AppendTrigger(sb, "tr", right, stateSize);
                sb.Append('}');
                Message?.Invoke(sb.ToString());

                Status = poses[0].bPoseIsValid ? "casque suivi" : "casque non suivi";
                if (now >= nextStatus) { nextStatus = now + 1000; SendStatus(); }
            }
            catch
            {
                ShutdownVr();
                nextInit = now + 3000;
            }
            Thread.Sleep(16);
        }
    }

    void TryInit()
    {
        try
        {
            if (!OpenVR.IsRuntimeInstalled()) { Status = "SteamVR non installé"; return; }
            var err = EVRInitError.None;
            var sys = OpenVR.Init(ref err, EVRApplicationType.VRApplication_Background);
            if (err == EVRInitError.None && sys != null) { _system = sys; Status = "connecté"; }
            else Status = err == EVRInitError.Init_NoServerForBackgroundApp
                ? "en attente de SteamVR"
                : "SteamVR : " + err;
        }
        catch (DllNotFoundException) { Status = "openvr_api.dll introuvable"; }
        catch (Exception ex) { Status = "erreur : " + ex.Message; }
    }

    void ShutdownVr()
    {
        if (_system == null) return;
        try { OpenVR.Shutdown(); } catch { }
        _system = null;
    }

    void SendStatus()
    {
        var s = Status.Replace("\\", "\\\\").Replace("\"", "'");
        Message?.Invoke($"{{\"t\":\"vrs\",\"s\":\"{s}\",\"ok\":{(_system != null ? "true" : "false")}}}");
    }

    static void AppendPose(StringBuilder sb, string key, TrackedDevicePose_t[] poses, uint index)
    {
        if (index >= poses.Length || !poses[index].bPoseIsValid) return;
        var m = poses[index].mDeviceToAbsoluteTracking;
        double tr = m.m0 + m.m5 + m.m10, qw, qx, qy, qz;
        if (tr > 0)
        {
            double s = Math.Sqrt(tr + 1.0) * 2;
            qw = 0.25 * s; qx = (m.m9 - m.m6) / s; qy = (m.m2 - m.m8) / s; qz = (m.m4 - m.m1) / s;
        }
        else if (m.m0 > m.m5 && m.m0 > m.m10)
        {
            double s = Math.Sqrt(1.0 + m.m0 - m.m5 - m.m10) * 2;
            qw = (m.m9 - m.m6) / s; qx = 0.25 * s; qy = (m.m1 + m.m4) / s; qz = (m.m2 + m.m8) / s;
        }
        else if (m.m5 > m.m10)
        {
            double s = Math.Sqrt(1.0 + m.m5 - m.m0 - m.m10) * 2;
            qw = (m.m2 - m.m8) / s; qx = (m.m1 + m.m4) / s; qy = 0.25 * s; qz = (m.m6 + m.m9) / s;
        }
        else
        {
            double s = Math.Sqrt(1.0 + m.m10 - m.m0 - m.m5) * 2;
            qw = (m.m4 - m.m1) / s; qx = (m.m2 + m.m8) / s; qy = (m.m6 + m.m9) / s; qz = 0.25 * s;
        }
        sb.Append(CultureInfo.InvariantCulture,
            $",\"{key}\":[{m.m3:0.####},{m.m7:0.####},{m.m11:0.####},{qx:0.####},{qy:0.####},{qz:0.####},{qw:0.####}]");
    }

    void AppendTrigger(StringBuilder sb, string key, uint index, uint size)
    {
        if (_system == null || index == OpenVR.k_unTrackedDeviceIndexInvalid) return;
        var st = new VRControllerState_t();
        if (_system.GetControllerState(index, ref st, size))
            sb.Append(CultureInfo.InvariantCulture, $",\"{key}\":{st.rAxis1.x:0.##}");
    }

    public void Dispose() => Stop();
}
