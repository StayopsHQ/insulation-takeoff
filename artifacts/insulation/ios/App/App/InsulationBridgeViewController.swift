import Capacitor

class InsulationBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WhisperVoicePlugin())
    }
}
