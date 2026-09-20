# Landing page media

The hero offers two muted, looping stock clips. These illustrate sports; they are not footage of the actual center.

| Clip          | Source                                                                                 | License                         |
| ------------- | -------------------------------------------------------------------------------------- | ------------------------------- |
| Weightlifting | https://mixkit.co/free-stock-video/strong-woman-training-weightlifting-in-a-gym-44414/ | Mixkit Stock Video Free License |
| Yoga          | https://mixkit.co/free-stock-video/woman-doing-yoga-on-a-deck-1053/                    | Mixkit Stock Video Free License |

Source pages and the license label were checked on 2026-09-16. Videos use the provider's 720p assets. License: https://mixkit.co/license/#videoFree

Update the `films` array in `src/features/public/SportFilm.tsx` to replace clips with center-owned footage. Remote availability depends on the provider. The image remains visible if loading fails. Only the active clip is loaded; reduced-motion and data-saving preferences disable automatic loading/playback. Playback pauses outside the viewport and when the browser tab is hidden. Users can explicitly play or pause the clip.
