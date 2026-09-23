# Landing page photography

Drop the generated images here with these exact file names. Every slot
renders a designed cream fallback until its file exists, so the page never
looks broken while imagery is still being made. Keep files as JPEG, sRGB,
quality ~80; the page crops with `object-fit: cover`, so exact dimensions
only need to match the aspect ratio.

| File | Aspect | ChatGPT size | Used |
| --- | --- | --- | --- |
| `campus-morning.jpg` | 3:2 | 1536×1024 | Full-bleed parallax band |
| `parent-evening.jpg` | 2:3 | 1024×1536 | "9pm on a Sunday" story split |
| `bulletin-board.jpg` | 3:2 | 1536×1024 | Photo strip |
| `art-room.jpg` | 3:2 | 1536×1024 | Photo strip (cropped to 4:5, anchored right) |
| `front-office.jpg` | 3:2 | 1536×1024 | Photo strip (cropped square, anchored on the stack) |
| `cafeteria.jpg` | 3:2 | 1536×1024 | Photo strip |
| `music-room.jpg` | 3:2 | 1536×1024 | Photo strip (cropped to 4:5, anchored on the piano) |
| `pickup-line.jpg` | 3:2 | 1536×1024 | Photo leaning out of the closing CTA |
| `library-shelves.jpg` | 3:2 | 1536×1024 | Collage, largest print |
| `classroom-window.jpg` | 2:3 | 1024×1536 | Collage, tall print |
| `playground.jpg` | 1:1 | 1024×1024 | Collage front print, and faint behind testimonials |
| `campus-trees.jpg` | 3:2 | 1536×1024 | Faint backdrop behind the product demo |
| `hallway-lockers.jpg` | 3:2 | 1536×1024 | Faint, blurred backdrop behind the "Grounded" deck |

Palette for every prompt: warm cream `#faf8f5`, forest green `#2d3a2e`,
sage `#7a9a7c`, soft morning light, medium-format film look, no legible
text or signage anywhere in frame.

The manifest that maps these files to slots is
`components/landing/landing-images.ts`.
