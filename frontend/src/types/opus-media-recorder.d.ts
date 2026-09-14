declare module "opus-media-recorder" {
  interface OpusMediaRecorderWorkerOptions {
    encoderWorkerFactory?: () => Worker;
    OggOpusEncoderWasmPath?: string;
    WebMOpusEncoderWasmPath?: string;
  }

  class OpusMediaRecorder extends MediaRecorder {
    constructor(
      stream: MediaStream,
      options?: MediaRecorderOptions,
      workerOptions?: OpusMediaRecorderWorkerOptions
    );
  }

  export default OpusMediaRecorder;
}

