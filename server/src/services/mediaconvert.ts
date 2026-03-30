import {
  MediaConvertClient,
  CreateJobCommand,
  CreateJobCommandInput,
} from '@aws-sdk/client-mediaconvert';

/**
 * Submit an AWS MediaConvert job to transcode a raw upload to HLS adaptive bitrate.
 *
 * Input:  s3://BUCKET/uploads/raw/{videoId}/original.mp4
 * Output: s3://BUCKET/videos/hls/{videoId}/   (HLS playlist + segments)
 *         s3://BUCKET/thumbnails/{videoId}.jpg (frame at 5s)
 */
export async function submitTranscodeJob(videoId: string): Promise<string> {
  const endpoint = process.env.MEDIACONVERT_ENDPOINT;
  const roleArn = process.env.MEDIACONVERT_ROLE_ARN;
  const bucket = process.env.S3_BUCKET_NAME;

  if (!endpoint || !roleArn || !bucket) {
    throw new Error('MediaConvert env vars not configured');
  }

  const client = new MediaConvertClient({
    endpoint,
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const input: CreateJobCommandInput = {
    Role: roleArn,
    Settings: {
      Inputs: [
        {
          FileInput: `s3://${bucket}/uploads/raw/${videoId}/original.mp4`,
          AudioSelectors: { 'Audio Selector 1': { DefaultSelection: 'DEFAULT' } },
        },
      ],
      OutputGroups: [
        // HLS adaptive bitrate output
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
        // Thumbnail output — extract frame at 5s
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
                    FramerateDenominator: 5, // capture at 5s
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

function buildHlsOutput(
  nameModifier: string,
  width: number,
  height: number,
  videoBitrate: number,
  audioBitrate: number
) {
  return {
    NameModifier: `_${nameModifier}`,
    ContainerSettings: { Container: 'M3U8' as const },
    VideoDescription: {
      Width: width,
      Height: height,
      CodecSettings: {
        Codec: 'H_264' as const,
        H264Settings: {
          Bitrate: videoBitrate,
          RateControlMode: 'CBR' as const,
          CodecProfile: 'HIGH' as const,
          CodecLevel: 'AUTO' as const,
        },
      },
    },
    AudioDescriptions: [
      {
        AudioSourceName: 'Audio Selector 1',
        CodecSettings: {
          Codec: 'AAC' as const,
          AacSettings: {
            Bitrate: audioBitrate,
            SampleRate: 48000,
            CodingMode: 'CODING_MODE_2_0' as const,
          },
        },
      },
    ],
  };
}
