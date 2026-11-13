/**
 * The studio's reels, hosted in the S3 bucket (README: "Hosted project videos"), as the
 * site's convention for a hosted video: <name>.webm (the original, VP9 1080p, for desktop),
 * <name>.mp4 (H.264, the fallback), <name>-mobile.mp4 (960 wide, what phones play: they
 * decode H.264 in hardware and VP9 in software) and <name>-poster.jpg (the first frame).
 * Hosted files get ?v=2 (as in components/ui/Media.astro): they are asked for with CORS so
 * bottom-bend.ts may draw them, and a copy the browser saved before the bucket allowed that
 * must not be reused.
 */
const S3_WEB = 'https://hellorobosite.s3.us-east-2.amazonaws.com/web';

export interface Reel {
  /** the WebM original (desktop) */
  webm: string;
  /** the H.264 MP4 (fallback) */
  src: string;
  /** the lighter H.264 MP4 phones play */
  mobileSrc: string;
  /** the first frame, shown until the video loads */
  poster: string;
}

const reel = (name: string): Reel => ({
  webm: `${S3_WEB}/${name}.webm?v=2`,
  src: `${S3_WEB}/${name}.mp4?v=2`,
  mobileSrc: `${S3_WEB}/${name}-mobile.mp4?v=2`,
  poster: `${S3_WEB}/${name}-poster.jpg`,
});

export const reels = {
  /** the studio showreel: Home (HomeShowreel) and the top of Services (ServicesDevice) */
  general: reel('general-reel'),
  /** "Make the world say yes" / "Through branding" */
  brand: reel('brand-reel'),
  /** "Make the operators say yes" / "Through interface" */
  ui: reel('ui-reel'),
  /** "Make the market say yes" / "Through video production" */
  videoProduction: reel('video-production-reel'),
};
