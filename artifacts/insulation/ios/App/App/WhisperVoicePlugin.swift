import AVFAudio
import Capacitor
import Foundation
import WhisperKit

@objc(WhisperVoicePlugin)
public class WhisperVoicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WhisperVoicePlugin"
    public let jsName = "WhisperVoice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepareModel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private static let modelName = "large-v3-v20240930_626MB"
    private static let modelRepository = "argmaxinc/whisperkit-coreml"

    private var whisperKit: WhisperKit?
    private var transcriber: AudioStreamTranscriber?
    private var streamTask: Task<Void, Never>?
    private var latestEvent: JSObject = [:]
    private let eventLock = NSLock()
    private var preparingModel = false
    private var startingStream = false

    @objc func prepareModel(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard !preparingModel else {
                call.reject("Model preparation is already running.")
                return
            }
            preparingModel = true
            defer { preparingModel = false }
            do {
                if whisperKit == nil {
                    notifyModelStatus("Downloading or loading the selected model (about 626 MB on first use)…", isPreparing: true)
                    let supportDirectory = try FileManager.default.url(
                        for: .applicationSupportDirectory,
                        in: .userDomainMask,
                        appropriateFor: nil,
                        create: true
                    )
                    var modelDirectory = supportDirectory.appendingPathComponent("WhisperKit", isDirectory: true)
                    try FileManager.default.createDirectory(
                        at: modelDirectory,
                        withIntermediateDirectories: true
                    )
                    var resourceValues = URLResourceValues()
                    resourceValues.isExcludedFromBackup = true
                    try modelDirectory.setResourceValues(resourceValues)

                    // Record the relative model folder only after models AND tokenizer load.
                    // Supplying modelFolder avoids a Hub listing on subsequent offline launches.
                    let manifest = modelDirectory.appendingPathComponent("ready-model.txt")
                    let savedFolder = try? String(contentsOf: manifest, encoding: .utf8)
                    let cachedFolder = savedFolder.map {
                        modelDirectory.appendingPathComponent($0).standardizedFileURL
                    }
                    let modelFolder: URL
                    if let cachedFolder,
                       cachedFolder.path.hasPrefix(modelDirectory.standardizedFileURL.path + "/"),
                       FileManager.default.fileExists(atPath: cachedFolder.path) {
                        modelFolder = cachedFolder
                        notifyModelStatus("Loading the saved model and tokenizer from this iPhone…", isPreparing: true)
                    } else {
                        modelFolder = try await WhisperKit.download(
                            variant: Self.modelName,
                            downloadBase: modelDirectory,
                            useBackgroundSession: false,
                            from: Self.modelRepository,
                            progressCallback: { [weak self] progress in
                                let percent = Int(progress.fractionCompleted * 100)
                                self?.notifyModelStatus("Downloading the on-device model: \(percent)%", isPreparing: true)
                            }
                        )
                    }

                    // WhisperKit downloads the open-source model once and caches it on this iPhone.
                    // The app never sends microphone audio to this or any remote service.
                    notifyModelStatus("Loading the model and tokenizer; first setup may need internet…", isPreparing: true)
                    let preparedKit = try await WhisperKit(
                        model: Self.modelName,
                        downloadBase: modelDirectory,
                        modelRepo: Self.modelRepository,
                        modelFolder: modelFolder.path,
                        tokenizerFolder: modelDirectory,
                        verbose: false,
                        load: true,
                        download: false,
                        useBackgroundDownloadSession: false
                    )
                    let relativeFolder = String(modelFolder.standardizedFileURL.path.dropFirst(
                        modelDirectory.standardizedFileURL.path.count + 1
                    ))
                    try relativeFolder.write(to: manifest, atomically: true, encoding: .utf8)
                    whisperKit = preparedKit
                }
                notifyModelStatus("The selected on-device model is ready. Dictation can now run offline.", isPreparing: false)
                call.resolve(["ready": true, "model": Self.modelName])
            } catch {
                notifyModelStatus("Model setup did not finish. Check the connection for the first download and try again.", isPreparing: false)
                call.reject("Could not prepare the on-device model: \(error.localizedDescription)")
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard !startingStream, transcriber == nil else {
                call.reject("Dictation is already starting or recording.")
                return
            }
            startingStream = true
            defer { startingStream = false }
            guard let whisperKit else {
                call.reject("Prepare the on-device model before starting dictation.")
                return
            }

            guard await requestMicrophonePermission() else {
                call.reject("Microphone permission is required for on-device dictation.")
                return
            }
            guard let tokenizer = whisperKit.tokenizer else {
                call.reject("The selected model did not finish loading its tokenizer.")
                return
            }

            let streamId = UUID().uuidString
            setLatestEvent([
                "streamId": streamId,
                "isRecording": false,
                "currentText": "",
                "confirmedSegments": [],
                "unconfirmedSegments": []
            ])
            let stream = AudioStreamTranscriber(
                audioEncoder: whisperKit.audioEncoder,
                featureExtractor: whisperKit.featureExtractor,
                segmentSeeker: whisperKit.segmentSeeker,
                textDecoder: whisperKit.textDecoder,
                tokenizer: tokenizer,
                audioProcessor: whisperKit.audioProcessor,
                decodingOptions: DecodingOptions(language: "en"),
                useVAD: true,
                stateChangeCallback: { [weak self] _, state in
                    self?.publish(state, streamId: streamId)
                }
            )

            transcriber = stream
            streamTask = Task {
                do {
                    try await stream.startStreamTranscription()
                    if !Task.isCancelled {
                        self.transcriber = nil
                        self.streamTask = nil
                    }
                } catch {
                    await stream.stopStreamTranscription()
                    if !Task.isCancelled {
                        self.transcriber = nil
                        self.streamTask = nil
                        self.notifyError(error.localizedDescription)
                    }
                }
            }
            call.resolve(["streamId": streamId])
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        stopStream(call)
    }

    @objc func stop(_ call: CAPPluginCall) {
        stopStream(call)
    }

    private func stopStream(_ call: CAPPluginCall) {
        Task { @MainActor in
            if let transcriber {
                await transcriber.stopStreamTranscription()
            }
            streamTask?.cancel()
            // Wait for any in-flight decode to finish before taking the final snapshot.
            // Cancellation alone does not join a Swift task.
            await streamTask?.value
            streamTask = nil
            transcriber = nil
            let result = latestEventSnapshot()
            call.resolve(result)
        }
    }

    private func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    private func publish(_ state: AudioStreamTranscriber.State, streamId: String) {
        let confirmed = state.confirmedSegments.map { segment in
            [
                "id": "\(segment.start)-\(segment.end)-\(segment.text)",
                "start": segment.start,
                "end": segment.end,
                "text": segment.text
            ] as [String: Any]
        }
        let unconfirmed = state.unconfirmedSegments.map { segment in
            [
                "id": "\(segment.start)-\(segment.end)-\(segment.text)",
                "start": segment.start,
                "end": segment.end,
                "text": segment.text
            ] as [String: Any]
        }
        let payload: JSObject = [
            "streamId": streamId,
            "isRecording": state.isRecording,
            "currentText": state.currentText,
            "confirmedSegments": confirmed,
            "unconfirmedSegments": unconfirmed
        ]

        setLatestEvent(payload)
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("transcriptionUpdate", data: payload)
        }
    }

    private func setLatestEvent(_ event: JSObject) {
        eventLock.lock()
        latestEvent = event
        eventLock.unlock()
    }

    private func latestEventSnapshot() -> JSObject {
        eventLock.lock()
        defer { eventLock.unlock() }
        return latestEvent
    }

    private func notifyModelStatus(_ message: String, isPreparing: Bool) {
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("modelStatus", data: ["message": message, "isPreparing": isPreparing])
        }
    }

    private func notifyError(_ message: String) {
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("transcriptionError", data: ["message": message])
        }
    }
}
