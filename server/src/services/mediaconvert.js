import {
  MediaConvertClient,
  CreateJobCommand,
  GetJobCommand,
} from '@aws-sdk/client-mediaconvert';

/**
 * Where the HLS master playlist lands for a given video. MediaConvert names
 * outputs after the input file, so `uploads/raw/<id>/original.mp4` becomes
 * `videos/hls/<id>/original.m3u8` plus one rendition manifest per bitrate.
 */
export const hlsKeyFor = (videoId) => `videos/hls/${videoId}/original.m3u8`;

function mediaConvertClient() {
  const endpoint = process.env.MEDIACONVERT_ENDPOINT;
  if (!endpoint) throw new Error('MEDIACONVERT_ENDPOINT is not configured');

  return new MediaConvertClient({
    endpoint,
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

export async function submitTranscodeJob(videoId) {
  const roleArn = process.env.MEDIACONVERT_ROLE_ARN;
  const bucket = process.env.S3_BUCKET_NAME;

  if (!roleArn || !bucket) {
    throw new Error('MEDIACONVERT_ROLE_ARN and S3_BUCKET_NAME must be configured');
  }

  const client = mediaConvertClient();

  const input = {
    Role: roleArn,
    Settings: {
      Inputs: [
        {
          FileInput: `s3://${bucket}/uploads/raw/${videoId}/original.mp4`,
          AudioSelectors: { 'Audio Selector 1': { DefaultSelection: 'DEFAULT' } },
        },
      ],
      OutputGroups: [
        {
          Name: 'HLS',
          OutputGroupSettings: {
            Type: 'HLS_GROUP_SETTINGS',
            HlsGroupSettings: {
              Destination: `s3://${bucket}/videos/hls/${videoId}/`,
              SegmentLength: 6,
              MinSegmentLength: 0,
            },
          },
          Outputs: [
            buildHlsOutput('360p', 640, 360, 800_000, 96_000),
            buildHlsOutput('720p', 1280, 720, 2_500_000, 128_000),
            buildHlsOutput('1080p', 1920, 1080, 5_000_000, 192_000),
          ],
        },
        {
          Name: 'Thumbnails',
          OutputGroupSettings: {
            Type: 'FILE_GROUP_SETTINGS',
            FileGroupSettings: {
              Destination: `s3://${bucket}/thumbnails/`,
            },
          },
          Outputs: [
            {
              NameModifier: videoId,
              ContainerSettings: { Container: 'RAW' },
              VideoDescription: {
                Width: 1280,
                Height: 720,
                CodecSettings: {
                  Codec: 'FRAME_CAPTURE',
                  FrameCaptureSettings: {
                    FramerateNumerator: 1,
                    FramerateDenominator: 5,
                    MaxCaptures: 1,
                    Quality: 80,
                  },
                },
              },
            },
          ],
        },
      ],
    },
    UserMetadata: { videoId },
  };

  const command = new CreateJobCommand(input);
  const response = await client.send(command);

  if (!response.Job?.Id) {
    throw new Error('MediaConvert did not return a job ID');
  }

  return response.Job.Id;
}

/**
 * Maps a MediaConvert job to the `videos.transcode_status` vocabulary so the
 * admin UI can show "Processing…" and flip to "Ready" on its own.
 */
export async function getTranscodeJobStatus(jobId) {
  const response = await mediaConvertClient().send(new GetJobCommand({ Id: jobId }));
  const status = response.Job?.Status;

  if (status === 'COMPLETE') return { status: 'ready', raw: status };
  if (status === 'ERROR' || status === 'CANCELED') {
    return { status: 'failed', raw: status, error: response.Job?.ErrorMessage };
  }
  return { status: 'processing', raw: status ?? 'UNKNOWN' };
}

function buildHlsOutput(nameModifier, width, height, videoBitrate, audioBitrate) {
  return {
    NameModifier: `_${nameModifier}`,
    ContainerSettings: { Container: 'M3U8' },
    VideoDescription: {
      Width: width,
      Height: height,
      CodecSettings: {
        Codec: 'H_264',
        H264Settings: {
          Bitrate: videoBitrate,
          RateControlMode: 'CBR',
          CodecProfile: 'HIGH',
          CodecLevel: 'AUTO',
        },
      },
    },
    AudioDescriptions: [
      {
        AudioSourceName: 'Audio Selector 1',
        CodecSettings: {
          Codec: 'AAC',
          AacSettings: {
            Bitrate: audioBitrate,
            SampleRate: 48000,
            CodingMode: 'CODING_MODE_2_0',
          },
        },
      },
    ],
  };
}
