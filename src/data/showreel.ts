import fs from 'node:fs';

/**
 * The studio showreel, shared by Home (HomeShowreel) and Services (ServicesDevice): whichever
 * of these files are in public/videos/ — showreel.mp4 (≤1080p, 30fps), showreel-mobile.mp4
 * (720p, phones), an optional showreel.webm and a poster. Muted everywhere, so no audio track.
 */
const has = (f: string) => fs.existsSync(`public/videos/${f}`);
const file = (f: string) => (has(f) ? `/videos/${f}` : undefined);

export const showreel = {
  src: file('showreel.mp4'),
  mobileSrc: file('showreel-mobile.mp4'),
  webm: file('showreel.webm'),
  poster: file('showreel-poster.jpg'),
};
