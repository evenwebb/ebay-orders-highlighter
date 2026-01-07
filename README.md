# eBay Orders Highlighter Extension

A browser extension for Microsoft Edge, Chrome, and Firefox that enhances the eBay Seller Hub orders page by highlighting orders that need tracking and providing quick selection tools.

## Features

- **Order Highlighting**: Automatically highlights order rows that need tracking:
  - Orders with totals of £9.90 or more (displayed as £9.99)
  - Special delivery orders (Total > Subtotal + £7) with silver highlighting
- **Summary Count**: Displays count of orders needing tracking in the summary area
- **Sticky Banner**: Shows a persistent banner at the top with order counts (hidden when no orders need tracking)
- **Special Delivery Notification**: Popup notification when there are special delivery orders
- **Select Tracking Button**: One-click button to select/deselect all orders needing tracking (including special delivery items)
- **Dynamic Updates**: Works with dynamically loaded content (pagination, filters, etc.)
- **Performance Optimized**: Efficiently handles pages with 200+ orders

## Installation

### For Microsoft Edge or Google Chrome:

1. **Download or clone this repository** to your computer

2. **Rename `manifest-edge.json` to `manifest.json`** (backup or rename the existing `manifest.json` first)

3. **Open Microsoft Edge** and navigate to `edge://extensions/` (or Chrome: `chrome://extensions/`)

4. **Enable Developer mode** by toggling the switch in the bottom-left corner

5. **Click "Load unpacked"** button

6. **Select the folder** containing the extension files

7. The extension should now appear in your extensions list

8. **Navigate to** `https://www.ebay.co.uk/sh/ord/` to see it in action

### For Firefox:

1. **Download or clone this repository** to your computer

2. **Keep `manifest.json` as is** (it's already configured for Firefox)

3. **Open Firefox** and navigate to `about:debugging`

4. **Click "This Firefox"** in the left sidebar

5. **Click "Load Temporary Add-on..."** button

6. **Select the `manifest.json` file** (or any file in the extension folder)

7. The extension should now appear in your extensions list

8. **Navigate to** `https://www.ebay.co.uk/sh/ord/` to see it in action

**Note:** The content scripts (`content.js` and `styles.css`) are identical across all browsers. Only the manifest file format differs:
- **Firefox**: Uses `manifest.json` (Manifest V2)
- **Edge/Chrome**: Uses `manifest-edge.json` (Manifest V3) - rename to `manifest.json` for installation

## How It Works

The extension:
- Runs automatically on eBay Seller Hub orders pages (`https://www.ebay.co.uk/sh/ord/*`)
- Finds the "Total" and "Subtotal" columns in the orders table
- Parses price values from each row
- Highlights rows that need tracking:
  - **Red background**: Orders with totals of £9.90 or more (threshold is £9.90, displayed as £9.99)
  - **Silver background**: Special delivery orders (Total > Subtotal + £7)
- Displays a count in the summary area and a sticky banner at the top
- Shows a popup notification when special delivery orders are detected
- Provides a "Select Tracking" button to quickly select/deselect all orders needing tracking
- Automatically updates when new orders are loaded or when you navigate between pages

## Files

- `manifest.json` - Extension configuration for Firefox (Manifest V2)
- `manifest-edge.json` - Extension configuration for Edge/Chrome (Manifest V3) - rename to `manifest.json` for installation
- `content.js` - Main script that handles highlighting, counting, and selection logic (works in all browsers)
- `styles.css` - Styling for highlighted rows, banner, and popup (works in all browsers)
- `README.md` - This file

**Note:** You only need one manifest file per browser. The default `manifest.json` is for Firefox. For Edge/Chrome, rename `manifest-edge.json` to `manifest.json` before loading the extension.

## Customization

### Change the Threshold

Edit `content.js` and modify the `THRESHOLD` constant:

```javascript
const THRESHOLD = 9.90; // Actual threshold for highlighting
const DISPLAY_THRESHOLD = 9.99; // Text displayed to user
```

### Change Highlight Colors

Edit `styles.css` and modify the background colors:

```css
/* Orders over threshold - red background */
.ebay-highlight-total-column {
    background-color: #ffcdd2 !important; /* Darker red */
}

.ebay-highlight-total-column:hover {
    background-color: #ffebee !important; /* Lighter red on hover */
}

/* Special delivery orders - silver background */
.ebay-highlight-special-delivery {
    background-color: #a8a8a8 !important; /* Darker silver */
}

.ebay-highlight-special-delivery:hover {
    background-color: #c0c0c0 !important; /* Lighter silver on hover */
}
```

## Troubleshooting

- **Extension not working?** Make sure you're on the correct eBay page (`https://www.ebay.co.uk/sh/ord/`)
- **Orders not highlighting?** Check the browser console (F12) for any error messages. The extension uses fallback methods if column detection fails.
- **Button not appearing?** The "Select Tracking" button should appear on the far left of the bulk actions area. Check console for placement messages.
- **Highlighting disappears?** The extension should automatically re-highlight when content loads. Try refreshing the page.
- **Performance issues?** The extension is optimized for 200+ orders. If you experience slowdowns, check the console for any errors.

## Browser Compatibility

- **Microsoft Edge** - Full support (use `manifest-edge.json`, rename to `manifest.json`)
- **Google Chrome** - Full support (use `manifest-edge.json`, rename to `manifest.json`)
- **Firefox** - Full support (use `manifest.json` as-is)
- **Other Chromium-based browsers** - Should work with `manifest-edge.json` (rename to `manifest.json`)

The content scripts (`content.js` and `styles.css`) are identical across all browsers. Only the manifest file format differs:
- **Firefox**: Manifest V2 (`manifest.json`)
- **Edge/Chrome**: Manifest V3 (`manifest-edge.json`)

## License

This extension is provided as-is for personal use.

