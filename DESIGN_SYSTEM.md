# Netlify Deal Studio — Design System

Design philosophy: Dieter Rams, Apple, Linear, Stripe. Clean, functional, honest.
NOT Vercel. No grainy gradients, no blur effects.

## Typography

- **Headings**: Poppins (600, 700)
- **Body**: Mulish (400, 500, 600)
- **Code / SKUs**: Menlo (monospace)

## Colors

### Base
| Token       | Value       | Usage                  |
|-------------|-------------|------------------------|
| bg          | `#0e1e25`   | Dark background        |
| surface     | `#15262e`   | Cards, sidebar, inputs |
| border      | `#243640`   | Borders, dividers      |

### Text
| Token       | Value       | Usage                  |
|-------------|-------------|------------------------|
| strong      | `#f0f4f8`   | Headings, names        |
| body        | `#b8c4ce`   | Default text           |
| muted       | `#6e8898`   | Secondary text         |
| faint       | `#4a6475`   | Disabled, hints        |

### Accent
| Token       | Value                    | Usage              |
|-------------|--------------------------|---------------------|
| teal        | `#32e6e2`                | Interactive only    |
| teal-dark   | `#00c7b7`                | Gradient end        |
| teal-muted  | `rgba(50,230,226,.12)`   | Tinted backgrounds  |

### Semantic
| Token   | Value     | Usage     |
|---------|-----------|-----------|
| blue    | `#5cbbf6` | Platform  |
| green   | `#34d399` | Support   |
| amber   | `#f5a623` | Credits   |
| purple  | `#a78bfa` | Addon     |
| red     | `#f87171` | Destructive |

## Components

### Buttons
- **Primary**: teal gradient (`#32e6e2` -> `#00c7b7`), dark text
- **Secondary**: transparent, 1px border
- **Destructive**: red background

### Cards
- 12px border-radius
- 1px border (border color)
- No shadows

### Tables
- 48-56px row height
- Subtle hover: `rgba(255,255,255,.02)`

### Sidebar
- 240px wide
- Surface background
- Teal active state with 4px left border

### Modals
- 14px border-radius
- 28px padding
- max-width: 520px

### Transitions
- 200ms ease

## Icons

Font Awesome 6 Free via CDN.

| Action    | Icon                    |
|-----------|-------------------------|
| Add       | `fa-plus`               |
| Edit      | `fa-pen-to-square`      |
| Delete    | `fa-trash-can`          |
| Duplicate | `fa-copy`               |
| Search    | `fa-magnifying-glass`   |
| Products  | `fa-box`                |
| Pricebooks| `fa-book`               |
| Quotes    | `fa-file-invoice-dollar`|
| Orders    | `fa-cart-shopping`      |
| Check     | `fa-check`              |
| Close     | `fa-xmark`              |
| Settings  | `fa-gear`               |
| Dollar    | `fa-dollar-sign`        |
| Tag       | `fa-tag`                |
| Shield    | `fa-shield-halved`      |
| Bolt      | `fa-bolt`               |
| Server    | `fa-server`             |
| Headset   | `fa-headset`            |
| Credit    | `fa-coins`              |
| Robot     | `fa-robot`              |

## Do NOT Use

- Drop shadows
- Colored section backgrounds
- Emoji as status indicators
- White `#fff` (use `#f0f4f8`)
