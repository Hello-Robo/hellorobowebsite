import fs from 'node:fs';

/**
 * A project's reel for phones: public/videos/projects/<id>-mobile.mp4, a portrait crop of its
 * reel (540×960 H.264, 20s, no sound) — the full reels are 1080p WebM, too heavy for phones.
 * Projects without one play their full reel on phones too.
 * To make one: ffmpeg -t 20 -i <reel> -vf "crop='min(iw,ih*9/16)':ih,scale=540:960:force_original_aspect_ratio=increase,crop=540:960,fps=30"
 *   -an -c:v libx264 -profile:v main -pix_fmt yuv420p -crf 27 -preset slow -movflags +faststart <id>-mobile.mp4
 */
export const mobileReel = (id: string) =>
  fs.existsSync(`public/videos/projects/${id}-mobile.mp4`) ? `/videos/projects/${id}-mobile.mp4` : undefined;
