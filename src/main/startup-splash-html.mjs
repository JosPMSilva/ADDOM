import {
  resolveThemePalette,
} from '../common/ui/theme-color-contract.mjs'

function rgba(channelValue, alpha) {
  return `rgba(${String(channelValue).trim().replaceAll(' ', ', ')}, ${alpha})`
}

export function buildStartupSplashHtml({ resolvedAppearance = 'dark' } = {}) {
  const { colors, channels } = resolveThemePalette(resolvedAppearance)
  const splashBackground = colors.surface
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>ADDOM</title>
      <style>
        html, body {
          margin: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: ${splashBackground};
          color: ${colors.textPrimary};
          font-family: "Geist Sans", Inter, "Segoe UI", sans-serif;
        }
        body {
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .inner {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 32px;
          text-align: center;
          user-select: none;
        }
        .logo {
          width: min(420px, 72vw);
          height: auto;
          display: block;
        }
        .label {
          font-size: 13px;
          line-height: 1.5;
          letter-spacing: 0;
          color: ${rgba(channels.textSecondary, 0.9)};
        }
        .progress {
          width: min(220px, 52vw);
          height: 3px;
          overflow: hidden;
          border-radius: 999px;
          background: ${rgba(channels.accent, 0.11)};
        }
        .progress > span {
          display: block;
          width: 36%;
          height: 100%;
          border-radius: inherit;
          background: ${colors.accentStrong};
          animation: slide 1.1s ease-in-out infinite;
          will-change: transform;
        }
        @keyframes slide {
          0% { transform: translateX(-115%); }
          100% { transform: translateX(315%); }
        }
      </style>
    </head>
    <body>
      <div class="inner" aria-hidden="true">
        <svg class="logo" viewBox="0 0 720 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ADDOM">
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            fill="${colors.accentStrong}"
            d="M 64 14 H 82 L 46 50 L 82 86 H 64 L 28 50 Z M 134 14 H 152 L 118 86 H 100 Z M 172 14 H 190 L 226 50 L 190 86 H 172 L 208 50 Z M 266 14 H 338 V 86 H 320 V 62 H 284 V 86 H 266 Z M 284 30 H 320 V 48 H 284 Z M 362 14 H 411 L 429 32 V 68 L 411 86 H 362 Z M 380 30 H 399 L 411 42 V 58 L 399 70 H 380 Z M 447 14 H 496 L 514 32 V 68 L 496 86 H 447 Z M 465 30 H 484 L 496 42 V 58 L 484 70 H 465 Z M 550 14 H 586 L 604 32 V 68 L 586 86 H 550 L 532 68 V 32 Z M 562 30 H 574 L 586 42 V 58 L 574 70 H 562 L 550 58 V 42 Z M 622 86 V 14 H 640 L 658 40 L 676 14 H 694 V 86 H 676 V 38 L 658 64 L 640 38 V 86 Z"
          />
        </svg>
        <div class="label">Preparing your workspace...</div>
        <div class="progress"><span></span></div>
      </div>
    </body>
  </html>`
}
