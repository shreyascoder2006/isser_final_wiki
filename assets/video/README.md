Drop the hero background video here as `hero.mp4` (H.264, muted-friendly, ideally under ~15s looped and under 10MB for web).

`index.html` already points its hero `<video>` source at `assets/video/hero.mp4`. Until that file exists, the hero gracefully falls back to the moss photo (`assets/img/moss-photo.jpg`) as a static background — no code changes needed once the real video is added.
