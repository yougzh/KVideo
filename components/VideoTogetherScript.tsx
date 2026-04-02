import Script from 'next/script';

const DEFAULT_VIDEOTOGETHER_SCRIPT_URL =
  'https://fastly.jsdelivr.net/gh/VideoTogether/VideoTogether@latest/release/extension.website.user.js';

export function VideoTogetherScript() {
  if (process.env.VIDEOTOGETHER_ENABLED === 'false') {
    return null;
  }

  const scriptUrl = process.env.VIDEOTOGETHER_SCRIPT_URL?.trim() || DEFAULT_VIDEOTOGETHER_SCRIPT_URL;
  const settingUrl = process.env.VIDEOTOGETHER_SETTING_URL?.trim();

  return (
    <>
      {settingUrl ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `window.videoTogetherWebsiteSettingUrl = ${JSON.stringify(settingUrl)};`,
          }}
        />
      ) : null}
      <Script
        id="videotogether-script"
        src={scriptUrl}
        strategy="afterInteractive"
      />
    </>
  );
}
