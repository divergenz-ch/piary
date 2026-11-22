// The capture helper: screen and system audio through ScreenCaptureKit, camera
// through AVFoundation. It takes no microphone: the app asks for none and holds
// no entitlement to one, so a recording is the screen and what the Mac plays.
//
// Why a sidecar at all (ADR 0015): the webview's own getDisplayMedia is
// unreliable in a WKWebView, and the native APIs are strictly more capable —
// window-level targeting, system audio, no browser permission UI. And because
// macOS resolves a privacy permission against the RESPONSIBLE PROCESS, which is
// inherited across spawn, a helper inside the app bundle uses the app's grant:
// no second prompt, no second entry in System Settings.
//
// The protocol is JSON lines on stdin and stdout, one object per line. Control
// only: media payloads are deliberately not sent this way (ADR 0015), because
// the parent relays stdout as events and that is the wrong shape for a
// high-bitrate stream.
//
//   in   {"op":"status"}                      → what this machine allows
//   in   {"op":"sources"}                     → displays and windows
//   in   {"op":"devices"}                     → cameras
//   in   {"op":"start","target":…,"audio":…}  → begin a capture
//   in   {"op":"stop"}                        → end it
//   out  {"event":"…", …}
//
// Every reply carries the `op` it answers so the parent can correlate without
// keeping a queue.

import AVFoundation
import Foundation
import ScreenCaptureKit

// MARK: - the wire

/// One line out. Built as a dictionary rather than a Codable type because the
/// shapes are small and varied, and a mismatch here is a protocol bug the
/// parent would have to tolerate anyway.
func emit(_ fields: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: fields),
          let line = String(data: data, encoding: .utf8)
    else { return }
    print(line)
    // stdout is a pipe, and a pipe is block buffered: without the flush a reply
    // can still be unwritten when the parent is already waiting for it.
    fflush(stdout)
}

/// Diagnostics go to stderr, so stdout stays the protocol and nothing else.
func log(_ message: String) {
    FileHandle.standardError.write("capture: \(message)\n".data(using: .utf8)!)
}

// MARK: - permissions

/// What this machine currently allows.
///
/// Screen Recording has no status API: the grant is discovered by attempting
/// the call that needs it, and the app appears in System Settings only after it
/// has tried once. The camera reports directly, without prompting.
func status() async -> [String: Any] {
    var screen = "denied"
    var displays = 0
    var windows = 0
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        screen = "granted"
        displays = content.displays.count
        windows = content.windows.count
    } catch {
        screen = "denied"
        log("screen capture denied: \(error.localizedDescription)")
    }
    return [
        "event": "status",
        "screenRecording": screen,
        "displays": displays,
        "windows": windows,
        "camera": authName(AVCaptureDevice.authorizationStatus(for: .video)),
        // macOS 13 brought system audio to ScreenCaptureKit. Reported so the
        // parent can offer what the machine can do rather than what the build
        // hoped for.
        "systemAudio": true,
    ]
}

func authName(_ status: AVAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "granted"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "undetermined"
    @unknown default: return "unknown"
    }
}

// MARK: - what can be captured

/// The displays and windows available as capture targets.
func sources() async -> [String: Any] {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        let displays = content.displays.map { display in
            [
                "id": display.displayID,
                "width": display.width,
                "height": display.height,
            ] as [String: Any]
        }
        // Windows with no title are usually a process's own offscreen surfaces,
        // which are not a thing anyone means to record.
        let windows = content.windows.compactMap { window -> [String: Any]? in
            guard let title = window.title, !title.isEmpty else { return nil }
            return [
                "id": window.windowID,
                "title": title,
                "app": window.owningApplication?.applicationName ?? "",
            ]
        }
        return ["event": "sources", "displays": displays, "windows": windows]
    } catch {
        return ["event": "error", "op": "sources", "message": error.localizedDescription]
    }
}

/// The cameras this machine has.
func devices() -> [String: Any] {
    // macOS 14 renamed the device type; 13 knows only the older name.
    let external: AVCaptureDevice.DeviceType
    if #available(macOS 14.0, *) {
        external = .external
    } else {
        external = .externalUnknown
    }
    let cameras = AVCaptureDevice.DiscoverySession(
        deviceTypes: [.builtInWideAngleCamera, external],
        mediaType: .video,
        position: .unspecified
    ).devices.map { ["id": $0.uniqueID, "name": $0.localizedName] as [String: Any] }

    return ["event": "devices", "cameras": cameras]
}

// MARK: - capturing

/// Receives a stream's buffers and reports what arrived.
///
/// Only the screen and the system audio are asked for. A microphone, once one
/// is, arrives as SEPARATE buffers with a different format description on its
/// own clock (ADR 0015): it gets its own count here and its own asset-writer
/// input downstream, because writing both into one produces a corrupt file and
/// raises no error.
final class Receiver: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    // Counters are touched only on the one sample-handler queue the stream is
    // given, which is what makes the unchecked conformance true rather than a
    // wish.
    private var frames = 0
    private var audioBuffers = 0
    private var lastReport = Date()

    func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard CMSampleBufferIsValid(buffer) else { return }
        switch type {
        case .screen: frames += 1
        case .audio: audioBuffers += 1
        // What was not asked for does not arrive.
        default: break
        }
        // Progress on a clock rather than per buffer: a 60fps capture would
        // otherwise be sixty lines a second on the control channel, which is
        // the thing ADR 0015 says not to do with it.
        if Date().timeIntervalSince(lastReport) >= 1.0 {
            lastReport = Date()
            emit([
                "event": "progress",
                "frames": frames,
                "audioBuffers": audioBuffers,
                // The capture's own timestamp, carried so a consumer can align
                // streams whose clocks are independent.
                "presentationTime": CMSampleBufferGetPresentationTimeStamp(buffer).seconds,
            ])
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        emit(["event": "stopped", "reason": error.localizedDescription])
    }
}

/// The capture in progress, if any.
///
/// An actor rather than a global: a `var` reached from async functions is a
/// data race the Swift 6 language mode rejects outright, and the isolation is
/// also what actually enforces one-capture-at-a-time — a second would compete
/// for the same grant and the parent has no way to tell their events apart.
actor Capture {
    private var running: SCStream?
    /// Held alongside the stream, and that is load-bearing: `SCStream` keeps its
    /// outputs WEAKLY, so a receiver left as a local in `start` is deallocated
    /// the moment that function returns and not one callback ever fires. The
    /// capture starts cleanly and delivers nothing, which reads as a permission
    /// problem and is not one.
    private var receiver: Receiver?

    func isRunning() -> Bool { running != nil }

    func hold(_ stream: SCStream, _ receiver: Receiver) {
        running = stream
        self.receiver = receiver
    }

    /// Takes the running stream out, so the caller stops exactly one.
    func take() -> SCStream? {
        defer {
            running = nil
            receiver = nil
        }
        return running
    }
}

let capture = Capture()

func start(display: CGDirectDisplayID?, window: CGWindowID?, audio: Bool) async {
    if await capture.isRunning() {
        emit(["event": "error", "op": "start", "message": "a capture is already running"])
        return
    }
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        let filter: SCContentFilter
        // The target's pixel size, which the configuration has to be told:
        // ScreenCaptureKit's default dimensions are zero, and a stream
        // configured that way starts without error and then delivers no frames
        // at all — which looks exactly like a permission problem and is not one.
        var size: (width: Int, height: Int)
        if let window, let match = content.windows.first(where: { $0.windowID == window }) {
            filter = SCContentFilter(desktopIndependentWindow: match)
            size = (Int(match.frame.width), Int(match.frame.height))
        } else if let match = content.displays.first(where: { display == nil || $0.displayID == display }) {
            filter = SCContentFilter(display: match, excludingWindows: [])
            size = (match.width, match.height)
        } else {
            emit(["event": "error", "op": "start", "message": "no such capture target"])
            return
        }

        let config = SCStreamConfiguration()
        config.width = max(size.width, 2)
        config.height = max(size.height, 2)
        // 30fps. Without an interval the stream delivers on its own schedule,
        // which for a static screen can be no frames for seconds at a time.
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        config.capturesAudio = audio
        // Without this the recording contains the app's own output, which for a
        // tool that plays back what it recorded is a feedback loop.
        config.excludesCurrentProcessAudio = true

        let receiver = Receiver()
        let stream = SCStream(filter: filter, configuration: config, delegate: receiver)
        try stream.addStreamOutput(receiver, type: .screen, sampleHandlerQueue: .global(qos: .userInitiated))
        if audio {
            try stream.addStreamOutput(receiver, type: .audio, sampleHandlerQueue: .global(qos: .userInitiated))
        }
        try await stream.startCapture()
        await capture.hold(stream, receiver)
        emit(["event": "started", "audio": audio])
    } catch {
        emit(["event": "error", "op": "start", "message": error.localizedDescription])
    }
}

/// Stops a capture if one is running, saying nothing when none is.
///
/// Shutdown's version of `stop`: "nothing was running" is the ordinary case on
/// the way out, and reporting it as an error would have every clean exit end on
/// a false alarm.
func stopQuietly() async {
    guard let running = await capture.take() else { return }
    try? await running.stopCapture()
}

func stop() async {
    guard let running = await capture.take() else {
        emit(["event": "error", "op": "stop", "message": "nothing is being captured"])
        return
    }
    do {
        try await running.stopCapture()
        emit(["event": "stopped", "reason": "asked"])
    } catch {
        emit(["event": "error", "op": "stop", "message": error.localizedDescription])
    }
}

// MARK: - the loop

/// Reads one JSON object per line from stdin until it closes.
///
/// stdin closing is how the parent says it is finished — a sidecar that
/// outlived its app would hold a capture grant with nobody watching.
///
/// The reading happens on a background thread and the commands come back
/// through a stream, because `readLine` BLOCKS: called on the main thread it
/// starves ScreenCaptureKit's own delivery, and a capture then starts cleanly
/// and produces no frames — which reads as a permission problem and is not one.
/// Verified against a minimal CLI that delivered 92 frames in three seconds
/// while this one delivered none.
func commands() -> AsyncStream<String> {
    AsyncStream { continuation in
        let thread = Thread {
            while let line = readLine(strippingNewline: true) {
                continuation.yield(line)
            }
            continuation.finish()
        }
        thread.start()
    }
}

func run() async {
    emit(["event": "ready"])
    for await line in commands() {
        guard !line.isEmpty,
              let data = line.data(using: .utf8),
              let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let op = message["op"] as? String
        else {
            emit(["event": "error", "message": "not a command"])
            continue
        }
        switch op {
        case "status": emit(await status())
        case "sources": emit(await sources())
        case "devices": emit(devices())
        case "start":
            await start(
                display: (message["display"] as? NSNumber)?.uint32Value,
                window: (message["window"] as? NSNumber)?.uint32Value,
                audio: message["audio"] as? Bool ?? false
            )
        case "stop": await stop()
        case "quit":
            await stopQuietly()
            exit(0)
        default:
            emit(["event": "error", "op": op, "message": "unknown command"])
        }
    }
    // stdin closed: stop anything running before going away.
    await stopQuietly()
    exit(0)
}

await run()
