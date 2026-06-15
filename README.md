# 🔍 eBay Orders Highlighter

A browser extension for Chrome, Edge, and Firefox that enhances the eBay Seller Hub orders page by highlighting orders that need tracking and providing quick selection tools.

## ✨ Features

- **Order Highlighting**: Automatically highlights order rows that need tracking:
  - **Red** — Orders with totals of £9.90 or more (displayed as £9.99)
  - **Silver** — Special delivery orders (Total > Subtotal + £7)
  - **Green** — Duplicate buyer orders (multiple orders from the same buyer)
- **Summary Count**: Displays count of orders needing tracking in the summary area
- **Sticky Banner**: Shows a persistent banner at the top with order counts (hidden when no orders need tracking)
- **Special Delivery Popup**: Popup notification when special delivery orders are detected
- **Select Tracking Button**: One-click button to select/deselect all orders needing tracking (including special delivery and duplicate buyer items)
- **Duplicate Buyer Detection**: Highlights multiple orders from the same buyer whose combined total exceeds the threshold
- **Dynamic Updates**: Works with dynamically loaded content (pagination, filters, SPA navigation)
- **Performance Optimized**: Efficiently handles pages with 200+ orders using batched DOM updates

## 🚀 Installation

### Chrome or Edge

1. Download or clone this repository to your computer
2. Open your browser and navigate to extensions:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked** and select the extension folder (contains `manifest.json`)
5. Navigate to `https://www.ebay.co.uk/sh/ord/` to see it in action

### Firefox

1. Download or clone this repository to your computer
2. Rename `manifest-firefox.json` to `manifest.json` (back up the existing `manifest.json` first)
3. Open Firefox and navigate to `about:debugging`
4. Click **This Firefox** in the left sidebar
5. Click **Load Temporary Add-on…** and select the `manifest.json` file
6. Navigate to `https://www.ebay.co.uk/sh/ord/` to see it in action

> **Note:** The content scripts (`content.js` and `styles.css`) are identical across all browsers. Only the manifest file differs:
> - **Chrome/Edge**: Uses `manifest.json` (Manifest V3) — ready to go
> - **Firefox**: Uses `manifest-firefox.json` (Manifest V2) — rename to `manifest.json` for installation

## 📖 How It Works

The extension:
- Runs automatically on eBay Seller Hub orders pages (`https://www.ebay.co.uk/sh/ord/*`)
- Detects the current filter context (Awaiting Shipment, Paid Shipped, All Orders) and adapts behavior
- Finds the "Total" and "Subtotal" columns in the orders table using multiple fallback strategies
- Parses price values from each row handling UK formatting (£1,234.56)
- Highlights rows that need tracking:
  - **Red background**: Orders with totals of £9.90 or more
  - **Silver background**: Special delivery orders (Total > Subtotal + £7)
  - **Green background**: Duplicate buyer orders where combined total ≥ threshold
- Displays a count in the summary area and a sticky banner at the top
- Shows a popup notification when special delivery orders are detected
- Provides a "Select Tracking" button to quickly select/deselect all orders needing tracking
- Watches for DOM changes and SPA navigation to re-apply highlights automatically

## ⚙️ Customization

### Change the Threshold

Edit `content.js` and modify the `THRESHOLD` constant:

```javascript
const THRESHOLD = 9.90;       // Actual threshold for highlighting
const DISPLAY_THRESHOLD = 9.99; // Text displayed to user
```

### Change Highlight Colors

Edit `styles.css` and modify the background colors for `.ebay-highlight-total-column`, `.ebay-highlight-special-delivery`, and `.ebay-highlight-duplicate-buyer`.

## 📁 Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config for Chrome/Edge (Manifest V3) |
| `manifest-firefox.json` | Extension config for Firefox (Manifest V2) — rename to `manifest.json` |
| `content.js` | Main script: highlighting, counting, duplicate detection, and selection logic |
| `styles.css` | Styling for highlighted rows, banner, popup, and select button |
| `.gitignore` | Git ignore rules |
| `README.md` | This file |

## 🔧 Troubleshooting

- **Extension not working?** Make sure you're on the correct eBay page (`https://www.ebay.co.uk/sh/ord/`)
- **Orders not highlighting?** Check the browser console (F12) for error messages. The extension logs detailed debug info about table structure.
- **Button not appearing?** The "Select Tracking" button appears in the bulk actions area. Check console for placement messages.
- **Highlighting disappears?** The extension watches for DOM and URL changes and should re-apply automatically. Try refreshing the page.
- **Performance issues?** The extension is optimized for 200+ orders with batched `requestAnimationFrame` updates.

## 🌐 Browser Compatibility

| Browser | Manifest | Status |
|---------|----------|--------|
| Chrome | `manifest.json` (MV3) | Full support |
| Edge | `manifest.json` (MV3) | Full support |
| Firefox | `manifest-firefox.json` (MV2) | Full support |
| Other Chromium | `manifest.json` (MV3) | Should work |

## 📄 License

This extension is provided as-is for personal use.
