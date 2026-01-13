/**
 * eBay Orders Highlighter
 * Highlights orders needing tracking (≥£9.90) and special delivery items
 * Includes order count display, sticky banner, and quick selection button
 */

(function() {
    'use strict';

    const THRESHOLD = 9.90;
    const DISPLAY_THRESHOLD = 9.99; // Keep GUI display as 9.99
    const HIGHLIGHT_CLASS = 'ebay-highlight-total-column';
    const SPECIAL_DELIVERY_CLASS = 'ebay-highlight-special-delivery';
    const DUPLICATE_BUYER_CLASS = 'ebay-highlight-duplicate-buyer';
    let isProcessing = false;
    
    // Special delivery detection
    const USE_TEST_MODE = false; // Set to false for production (use "Awaiting express delivery")
    // For debugging: use "All orders" to test with actual count on page
    const SPECIAL_DELIVERY_TEXT = USE_TEST_MODE ? 'Awaiting dispatch' : 'Awaiting express delivery';
    let lastSpecialDeliveryCount = -1;
    
    /**
     * Check current URL and determine which features to enable
     * Returns object with flags for each feature
     */
    function getFeatureFlags() {
        const url = window.location.href;
        const urlObj = new URL(url);
        
        // Only run on /sh/ord/ pages
        if (!urlObj.pathname.includes('/sh/ord/')) {
            return {
                enabled: false,
                highlight: false,
                banner: false,
                button: false
            };
        }
        
        // Check filter parameter
        const filter = urlObj.searchParams.get('filter');
        
        // AWAITING_SHIPMENT: highlight + banner + button
        if (filter === 'status:AWAITING_SHIPMENT') {
            return {
                enabled: true,
                highlight: true,
                banner: true,
                button: true
            };
        }
        
        // PAID_SHIPPED: highlight only (no banner, no button)
        if (filter === 'status:PAID_SHIPPED') {
            return {
                enabled: true,
                highlight: true,
                banner: false,
                button: false
            };
        }
        
        // ALL_ORDERS: highlight only (no banner, no button) - for duplicate buyer detection
        if (filter === 'status:ALL_ORDERS') {
            return {
                enabled: true,
                highlight: true,
                banner: false,
                button: false
            };
        }
        
        // Other /sh/ord/ pages: don't run
        return {
            enabled: false,
            highlight: false,
            banner: false,
            button: false
        };
    }

    /**
     * Parse price string to number
     * Handles formats like "£9.99", "£10.00", "£1,234.56"
     */
    function parsePrice(priceText) {
        if (!priceText) return 0;
        
        // Remove currency symbols, spaces, and other non-numeric characters except digits, dots, and commas
        let cleaned = priceText.trim()
            .replace(/£/g, '')
            .replace(/[^\d.,]/g, '');
        
        // Handle comma as thousands separator (UK format)
        // If there's a comma followed by 3 digits before decimal, it's thousands separator
        if (cleaned.includes(',')) {
            // Check if comma is thousands separator (e.g., £1,234.56)
            const parts = cleaned.split('.');
            if (parts.length === 2 && parts[0].includes(',')) {
                // Remove commas from integer part
                cleaned = parts[0].replace(/,/g, '') + '.' + parts[1];
            } else {
                // Might be decimal separator in some locales, but UK uses dot
                cleaned = cleaned.replace(/,/g, '');
            }
        }
        
        const value = parseFloat(cleaned);
        return isNaN(value) ? 0 : value;
    }

    /**
     * Find the index of the Total column
     * Uses multiple strategies to find the column reliably
     */
    function findTotalColumnIndex(table) {
        // Strategy 1: Find by .total-price class (most reliable)
        const firstRow = table.querySelector('tbody tr, tbody > [role="row"], table tr:not(:first-child)');
        if (firstRow) {
            const cells = firstRow.querySelectorAll('td, [role="cell"]');
            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i];
                // Check if this cell contains a total-price div
                if (cell.querySelector('.total-price')) {
                    return i;
                }
            }
        }
        
        // Strategy 2: Find by price-column class (check all rows to be sure)
        const allRows = table.querySelectorAll('tbody tr, tbody > [role="row"]');
        if (allRows.length > 0) {
            const firstDataRow = allRows[0];
            const cells = firstDataRow.querySelectorAll('td, [role="cell"]');
            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i];
                // Check if this cell has price-column class
                if (cell.classList.contains('price-column')) {
                    const cellText = cell.textContent.trim();
                    // Check if it contains .total-price or looks like a total price
                    if (cell.querySelector('.total-price') || (cellText.includes('£') && cellText.length < 20)) {
                        return i;
                    }
                }
            }
        }
        
        // Strategy 3: Find by header text (try multiple header selectors)
        const headerSelectors = [
            'thead th',
            'thead .th-title',
            '.th-title',
            'table th',
            '[role="columnheader"]',
            'thead tr th'
        ];
        
        for (let selector of headerSelectors) {
            const headers = table.querySelectorAll(selector);
            if (headers.length > 0) {
                for (let i = 0; i < headers.length; i++) {
                    const header = headers[i];
                    const text = header.textContent.trim().toLowerCase();
                    
                    // Check if this header contains "Total"
                    if (text.includes('total') && !text.includes('subtotal')) {
                        return i;
                    }
                    
                    // Also check button text inside header
                    const button = header.querySelector('button');
                    if (button) {
                        const buttonText = button.textContent.trim().toLowerCase();
                        if (buttonText.includes('total') && !buttonText.includes('subtotal')) {
                            return i;
                        }
                    }
                }
            }
        }
        
        // Strategy 4: Try to find by looking for cells with £ symbol that might be totals
        if (firstRow) {
            const cells = firstRow.querySelectorAll('td, [role="cell"]');
            // Look from right to left (Total column is usually last or second-to-last)
            for (let i = cells.length - 1; i >= 0; i--) {
                const cell = cells[i];
                const cellText = cell.textContent.trim();
                // Check if it looks like a total price (contains £ and is relatively short)
                if (cellText.includes('£') && cellText.length < 30 && !cellText.includes('Item')) {
                    // Verify it's likely the Total column by checking if it's in a price-column cell
                    if (cell.classList.contains('price-column') || cell.querySelector('.total-price')) {
                        return i;
                    }
                }
            }
        }
        
        console.warn('eBay Highlighter: Could not find Total column. Table structure:', {
            hasTable: !!table,
            hasTbody: !!table.querySelector('tbody'),
            hasRows: table.querySelectorAll('tbody tr, tbody > [role="row"]').length,
            headers: Array.from(table.querySelectorAll('thead th, .th-title')).map(h => h.textContent.trim()),
            firstRowCells: firstRow ? Array.from(firstRow.querySelectorAll('td, [role="cell"]')).map(c => ({
                classes: Array.from(c.classList),
                hasTotalPrice: !!c.querySelector('.total-price'),
                text: c.textContent.trim().substring(0, 50)
            })) : []
        });
        
        return -1;
    }

    /**
     * Find the index of the Subtotal column
     * Uses similar strategies to findTotalColumnIndex
     */
    function findSubtotalColumnIndex(table) {
        const firstRow = table.querySelector('tbody tr, tbody > [role="row"], table tr:not(:first-child)');
        
        // Strategy 1: Find by header text
        const headerSelectors = [
            'thead th',
            'thead .th-title',
            '.th-title',
            'table th',
            '[role="columnheader"]',
            'thead tr th'
        ];
        
        for (let selector of headerSelectors) {
            const headers = table.querySelectorAll(selector);
            if (headers.length > 0) {
                for (let i = 0; i < headers.length; i++) {
                    const header = headers[i];
                    const text = header.textContent.trim().toLowerCase();
                    
                    // Check if this header contains "Subtotal"
                    if (text.includes('subtotal')) {
                        return i;
                    }
                    
                    // Also check button text inside header
                    const button = header.querySelector('button');
                    if (button) {
                        const buttonText = button.textContent.trim().toLowerCase();
                        if (buttonText.includes('subtotal')) {
                            return i;
                        }
                    }
                }
            }
        }
        
        return -1;
    }

    /**
     * Check if an order is a special delivery (Total > Subtotal + £7)
     */
    function isSpecialDeliveryOrder(row, totalIndex, subtotalIndex) {
        if (subtotalIndex === -1 || totalIndex === -1) {
            return false; // Can't determine without both columns
        }
        
        const cells = row.querySelectorAll('td, [role="cell"]');
        if (cells.length <= Math.max(totalIndex, subtotalIndex)) {
            return false;
        }
        
        const totalCell = cells[totalIndex];
        const subtotalCell = cells[subtotalIndex];
        
        const totalPriceDiv = totalCell.querySelector('.total-price');
        const totalText = totalPriceDiv ? totalPriceDiv.textContent.trim() : totalCell.textContent.trim();
        const total = parsePrice(totalText);
        
        const subtotalPriceDiv = subtotalCell.querySelector('.total-price, .subtotal-price');
        const subtotalText = subtotalPriceDiv ? subtotalPriceDiv.textContent.trim() : subtotalCell.textContent.trim();
        const subtotal = parsePrice(subtotalText);
        
        // Special delivery if Total is more than £7 more than Subtotal
        return total > subtotal + 7;
    }

    /**
     * Detect duplicate buyers and calculate totals
     * Returns object with buyer information and totals
     */
    function detectDuplicateBuyers(table, totalColumnIndex) {
        const buyerMap = new Map();
        const rows = table.querySelectorAll('tbody tr, tbody > [role="row"]');
        
        rows.forEach(row => {
            // Skip summary rows
            if (row.classList.contains('totalSummaryTableRow')) {
                return;
            }
            
            // Find buyer wrapper
            const buyerWrapper = row.querySelector('.buyer-modal-trigger-wrapper');
            if (!buyerWrapper) {
                return;
            }
            
            // Extract buyer name and username from button spans
            const button = buyerWrapper.querySelector('button');
            if (!button) {
                return;
            }
            
            const spans = button.querySelectorAll('span');
            if (spans.length < 2) {
                return;
            }
            
            const buyerName = spans[0].textContent.trim();
            const buyerUsername = spans[1].textContent.trim();
            
            if (!buyerUsername) {
                return;
            }
            
            // Extract price from row
            let price = 0;
            if (totalColumnIndex !== -1) {
                const cells = row.querySelectorAll('td, [role="cell"]');
                if (cells.length > totalColumnIndex) {
                    const totalCell = cells[totalColumnIndex];
                    const totalPriceDiv = totalCell.querySelector('.total-price');
                    const priceText = totalPriceDiv ? totalPriceDiv.textContent.trim() : totalCell.textContent.trim();
                    price = parsePrice(priceText);
                }
            }
            
            // Fallback: search for .total-price in row
            if (price === 0) {
                const totalPriceDiv = row.querySelector('.total-price');
                if (totalPriceDiv) {
                    price = parsePrice(totalPriceDiv.textContent.trim());
                }
            }
            
            // Add to buyer map
            if (!buyerMap.has(buyerUsername)) {
                buyerMap.set(buyerUsername, {
                    username: buyerUsername,
                    name: buyerName,
                    count: 0,
                    totalPrice: 0,
                    rows: []
                });
            }
            
            const buyerInfo = buyerMap.get(buyerUsername);
            buyerInfo.count++;
            buyerInfo.totalPrice += price;
            buyerInfo.rows.push(row);
        });
        
        // Filter to get duplicate buyers and buyers needing tracking
        const duplicateBuyers = [];
        const buyersNeedingTracking = [];
        let totalDuplicateOrders = 0;
        
        buyerMap.forEach((buyerInfo, username) => {
            if (buyerInfo.count > 1) {
                duplicateBuyers.push(buyerInfo);
                totalDuplicateOrders += buyerInfo.count;
                
                // Check if total price exceeds threshold
                if (buyerInfo.totalPrice >= THRESHOLD) {
                    buyersNeedingTracking.push(buyerInfo);
                }
            }
        });
        
        return {
            buyerMap,
            duplicateBuyers,
            buyersNeedingTracking,
            totalDuplicateOrders
        };
    }

    /**
     * Create or update the sticky bar at the top
     */
    function updateStickyBar(count, specialDeliveryCount = 0, duplicateBuyersInfo = null) {
        const flags = getFeatureFlags();
        if (!flags.banner) {
            // Remove banner if it exists but shouldn't be shown
            const stickyBar = document.getElementById('ebay-highlighter-sticky-bar');
            if (stickyBar) {
                stickyBar.remove();
                document.body.style.paddingTop = '';
            }
            return;
        }
        let stickyBar = document.getElementById('ebay-highlighter-sticky-bar');
        
        // Hide bar if no items over threshold and no duplicate buyers
        const hasDuplicateBuyers = duplicateBuyersInfo && duplicateBuyersInfo.duplicateBuyers.length > 0;
        if (count === 0 && !hasDuplicateBuyers) {
            if (stickyBar) {
                stickyBar.remove();
            }
            // Remove padding from body
            document.body.style.paddingTop = '';
            return;
        }
        
        if (!stickyBar) {
            // Create the sticky bar
            stickyBar = document.createElement('div');
            stickyBar.id = 'ebay-highlighter-sticky-bar';
            stickyBar.className = 'ebay-highlighter-sticky-bar';
            document.body.insertBefore(stickyBar, document.body.firstChild);
            
            // Add padding to body to account for sticky bar
            document.body.style.paddingTop = '44px';
        }
        
        // Build the text content
        let barText = `Orders Needing Tracking: ${count}`;
        
        // Add special delivery count only if there are special deliveries
        if (specialDeliveryCount > 0) {
            barText += ` | SD: ${specialDeliveryCount}`;
        }
        
        // Add duplicate buyer information if available
        if (hasDuplicateBuyers) {
            const duplicateCount = duplicateBuyersInfo.duplicateBuyers.length;
            const totalDuplicateOrders = duplicateBuyersInfo.totalDuplicateOrders;
            barText += ` | Duplicate Buyers: ${duplicateCount} (${totalDuplicateOrders} orders)`;
        }
        
        // Update the count text and set color to red
        stickyBar.textContent = barText;
        stickyBar.style.color = '#d32f2f'; // Red color
    }

    /**
     * Update the summary area with count of orders >= threshold
     */
    function updateSummaryCount(count) {
        const flags = getFeatureFlags();
        if (!flags.banner) {
            // Remove summary count if it exists but shouldn't be shown
            const countElement = document.querySelector('.ebay-highlight-count');
            if (countElement) {
                countElement.remove();
            }
            return;
        }
        // Find the totalsWrapper or element containing "Total:"
        const totalsWrapper = document.querySelector('#totalsWrapper');
        const totalsContainer = document.querySelector('.totals--container');
        
        let insertTarget = null;
        let insertParent = null;
        
        if (totalsWrapper) {
            insertParent = totalsWrapper.parentElement;
            insertTarget = totalsWrapper.nextSibling;
        } else if (totalsContainer) {
            insertParent = totalsContainer.parentElement;
            insertTarget = totalsContainer.nextSibling;
        } else {
            // Fallback: look for text containing "Total:"
            const allSpans = document.querySelectorAll('span');
            for (let span of allSpans) {
                if (span.textContent.includes('Total:')) {
                    insertParent = span.parentElement;
                    insertTarget = span.nextSibling;
                    break;
                }
            }
        }
        
        if (!insertParent) {
            return;
        }

        // Check if our count element already exists
        let countElement = document.querySelector('.ebay-highlight-count');
        
        if (!countElement) {
            // Create the count element
            countElement = document.createElement('span');
            countElement.className = 'ebay-highlight-count';
            
            // Insert after Total: (after totalsWrapper or totalsContainer)
            if (insertTarget) {
                insertParent.insertBefore(countElement, insertTarget);
            } else {
                insertParent.appendChild(countElement);
            }
        }

        // Update the count text and styling based on count
        if (count > 0) {
            countElement.textContent = `Orders Needing Tracking: ${count}`;
            // Red when there are items over threshold
            countElement.style.cssText = 'margin-left: 10px; font-weight: bold; font-size: 1.05em; color: #d32f2f; background-color: #ffebee; padding: 2px 8px; border-radius: 3px;';
        } else {
            countElement.textContent = 'No Orders Need Tracking';
            // Green when no items - no background color
            countElement.style.cssText = 'margin-left: 10px; font-weight: bold; font-size: 1.05em; color: #2e7d32; padding: 2px 8px;';
        }
    }

    // Cache table and column indices for performance
    let cachedTable = null;
    let cachedColumnIndex = -1;
    let cachedSubtotalIndex = -1;
    
    /**
     * Find the orders table (not the summary table)
     * Returns the table that contains order checkboxes
     */
    function findOrdersTable() {
        // First, try to find table with checkboxes directly
        const tables = document.querySelectorAll('table');
        for (let table of tables) {
            // Skip summary tables
            if (table.querySelector('.totalSummaryTableRow')) {
                continue;
            }
            
            // Check if this table has checkboxes
            const hasCheckboxes = table.querySelector('input[type="checkbox"][data-testid="order-checkbox"]') ||
                                 table.querySelector('input[type="checkbox"].checkbox__control') ||
                                 table.querySelector('input[type="checkbox"][id^="grid-table-bulk-checkbox"]');
            
            if (hasCheckboxes) {
                return table;
            }
        }
        
        // Fallback: try other selectors
        const fallbackTable = document.querySelector('table[role="grid"]') ||
                             document.querySelector('.grid-table') ||
                             document.querySelector('.orders-table') ||
                             document.querySelector('[role="table"]');
        if (fallbackTable && !fallbackTable.querySelector('.totalSummaryTableRow')) {
            return fallbackTable;
        }
        
        // Last resort: find table by looking for one with many rows (not summary)
        for (let table of tables) {
            if (table.querySelector('.totalSummaryTableRow')) {
                continue; // Skip summary tables
            }
            const rows = table.querySelectorAll('tbody tr');
            if (rows.length > 5) { // Orders table should have many rows
                return table;
            }
        }
        
        return null;
    }
    
    /**
     * Highlight rows based on Total column value
     * Optimized for 200+ orders with batching and efficient selectors
     */
    function highlightOrders() {
        const flags = getFeatureFlags();
        if (!flags.highlight) {
            // Remove highlights if they exist but shouldn't be shown
            const highlightedRows = document.querySelectorAll(`tr.${HIGHLIGHT_CLASS}, tr.${SPECIAL_DELIVERY_CLASS}, tr.${DUPLICATE_BUYER_CLASS}`);
            highlightedRows.forEach(row => {
                row.classList.remove(HIGHLIGHT_CLASS);
                row.classList.remove(SPECIAL_DELIVERY_CLASS);
                row.classList.remove(DUPLICATE_BUYER_CLASS);
            });
            return;
        }
        
        if (isProcessing) return;
        isProcessing = true;

        try {
            // Use cached table if still valid, otherwise find it
            if (!cachedTable || !document.contains(cachedTable)) {
                cachedTable = findOrdersTable();
                // Reset column indices when table changes
                if (cachedTable) {
                    cachedColumnIndex = -1;
                    cachedSubtotalIndex = -1;
                }
            }

            if (!cachedTable) {
                isProcessing = false;
                return;
            }

            // Cache column indices if not already cached
            if (cachedColumnIndex === -1) {
                cachedColumnIndex = findTotalColumnIndex(cachedTable);
            }
            
            // Get SD count from "Awaiting express delivery" to optimize scanning
            const expectedSDCount = getSpecialDeliveryCount();
            const shouldCheckSD = expectedSDCount > 0;
            
            // Only find subtotal column if we need to check for SD items
            if (shouldCheckSD && cachedSubtotalIndex === -1) {
                cachedSubtotalIndex = findSubtotalColumnIndex(cachedTable);
            }
            
            let highlightedCount = 0;
            let foundSDCount = 0; // Track how many SD items we've found
            
            // Detect duplicate buyers first (on AWAITING_SHIPMENT and ALL_ORDERS pages)
            const flags = getFeatureFlags();
            let duplicateBuyerRows = new Set();
            let duplicateBuyersInfo = null;
            
            if (flags.highlight) {
                duplicateBuyersInfo = detectDuplicateBuyers(cachedTable, cachedColumnIndex);
                // Create a Set of rows that belong to duplicate buyers for quick lookup
                duplicateBuyersInfo.duplicateBuyers.forEach(buyer => {
                    buyer.rows.forEach(row => {
                        duplicateBuyerRows.add(row);
                    });
                });
            }
            
            // Strategy 1: If we found the column index, use it (most efficient)
            if (cachedColumnIndex !== -1) {
                // Get all data rows - limit scope to table only
                const rows = cachedTable.querySelectorAll('tbody tr, tbody > [role="row"]');
                
                if (rows.length === 0) {
                    isProcessing = false;
                    return;
                }
                
                // For large lists, process in batches; for smaller lists, process all at once
                const BATCH_SIZE = rows.length > 100 ? 50 : rows.length;
                let processed = 0;
                
                const processBatch = () => {
                    const end = Math.min(processed + BATCH_SIZE, rows.length);
                    const batchHighlight = [];
                    const batchHighlightSD = [];
                    const batchDuplicateBuyer = [];
                    const batchUnhighlight = [];
                    
                    // Stop early if we've found all expected SD items
                    const shouldContinueSDCheck = shouldCheckSD && foundSDCount < expectedSDCount;
                    
                    for (let i = processed; i < end; i++) {
                        const row = rows[i];
                        
                        // Priority 1: Check if this row belongs to a duplicate buyer
                        if (duplicateBuyerRows.has(row)) {
                            batchDuplicateBuyer.push(row);
                            continue; // Skip price checking for duplicate buyers
                        }
                        
                        const cells = row.querySelectorAll('td, [role="cell"]');
                        
                        if (cells.length <= cachedColumnIndex) {
                            continue;
                        }

                        const totalCell = cells[cachedColumnIndex];
                        const totalPriceDiv = totalCell.querySelector('.total-price');
                        const priceText = totalPriceDiv ? totalPriceDiv.textContent.trim() : totalCell.textContent.trim();
                        const price = parsePrice(priceText);

                        if (price >= THRESHOLD) {
                            // Check if this is a special delivery order (only if we haven't found all SD items yet)
                            if (shouldContinueSDCheck && isSpecialDeliveryOrder(row, cachedColumnIndex, cachedSubtotalIndex)) {
                                batchHighlightSD.push(row);
                                foundSDCount++;
                                // Stop checking for SD if we've found all expected items
                                if (foundSDCount >= expectedSDCount) {
                                    // Mark remaining rows as regular highlights
                                    for (let j = i + 1; j < end; j++) {
                                        const remainingRow = rows[j];
                                        // Skip if it's a duplicate buyer row
                                        if (duplicateBuyerRows.has(remainingRow)) {
                                            batchDuplicateBuyer.push(remainingRow);
                                            continue;
                                        }
                                        const remainingCells = remainingRow.querySelectorAll('td, [role="cell"]');
                                        if (remainingCells.length > cachedColumnIndex) {
                                            const remainingTotalCell = remainingCells[cachedColumnIndex];
                                            const remainingPriceDiv = remainingTotalCell.querySelector('.total-price');
                                            const remainingPriceText = remainingPriceDiv ? remainingPriceDiv.textContent.trim() : remainingTotalCell.textContent.trim();
                                            const remainingPrice = parsePrice(remainingPriceText);
                                            if (remainingPrice >= THRESHOLD) {
                                                batchHighlight.push(remainingRow);
                                                highlightedCount++;
                                            } else {
                                                batchUnhighlight.push(remainingRow);
                                            }
                                        }
                                    }
                                    break; // Exit loop early
                                }
                            } else {
                                batchHighlight.push(row);
                            }
                            highlightedCount++;
                        } else {
                            batchUnhighlight.push(row);
                        }
                    }
                    
                    processed = end;
                    
                    // Apply changes in batches to reduce reflows
                    if (batchHighlight.length > 0 || batchHighlightSD.length > 0 || batchDuplicateBuyer.length > 0 || batchUnhighlight.length > 0) {
                        requestAnimationFrame(() => {
                            // Remove all highlight classes first
                            batchUnhighlight.forEach(row => {
                                row.classList.remove(HIGHLIGHT_CLASS);
                                row.classList.remove(SPECIAL_DELIVERY_CLASS);
                                row.classList.remove(DUPLICATE_BUYER_CLASS);
                            });
                            // Add duplicate buyer highlight (green) - highest priority
                            batchDuplicateBuyer.forEach(row => {
                                row.classList.remove(HIGHLIGHT_CLASS);
                                row.classList.remove(SPECIAL_DELIVERY_CLASS);
                                row.classList.add(DUPLICATE_BUYER_CLASS);
                            });
                            // Add regular highlight (red)
                            batchHighlight.forEach(row => {
                                row.classList.remove(SPECIAL_DELIVERY_CLASS);
                                row.classList.remove(DUPLICATE_BUYER_CLASS);
                                row.classList.add(HIGHLIGHT_CLASS);
                            });
                            // Add special delivery highlight (silver)
                            batchHighlightSD.forEach(row => {
                                row.classList.remove(HIGHLIGHT_CLASS);
                                row.classList.remove(DUPLICATE_BUYER_CLASS);
                                row.classList.add(SPECIAL_DELIVERY_CLASS);
                            });
                        });
                    }
                    
                    // Continue processing if more rows and we haven't found all SD items yet
                    if (processed < rows.length && (!shouldCheckSD || foundSDCount < expectedSDCount)) {
                        setTimeout(processBatch, 0); // Yield to browser
                    } else {
                        // Final update
                        requestAnimationFrame(() => {
                            updateSummaryCount(highlightedCount);
                            updateStickyBar(highlightedCount, expectedSDCount, duplicateBuyersInfo);
                            isProcessing = false;
                        });
                    }
                };
                
                processBatch();
                return; // Exit early, processing continues asynchronously
                
            } else {
                // Strategy 2: Direct search for .total-price elements (fallback, less efficient)
                // Try within table first, then whole document if needed
                let totalPriceElements = cachedTable.querySelectorAll('.total-price');
                
                if (totalPriceElements.length === 0) {
                    // Fallback: search entire document (in case table structure is unusual)
                    totalPriceElements = document.querySelectorAll('.total-price');
                }
                
                if (totalPriceElements.length === 0) {
                    isProcessing = false;
                    return;
                }
                
                // Detect duplicate buyers first (on AWAITING_SHIPMENT and ALL_ORDERS pages)
                let fallbackDuplicateBuyerRows = new Set();
                let fallbackDuplicateBuyersInfo = null;
                
                if (flags.highlight) {
                    fallbackDuplicateBuyersInfo = detectDuplicateBuyers(cachedTable, cachedColumnIndex);
                    // Create a Set of rows that belong to duplicate buyers for quick lookup
                    fallbackDuplicateBuyersInfo.duplicateBuyers.forEach(buyer => {
                        buyer.rows.forEach(row => {
                            fallbackDuplicateBuyerRows.add(row);
                        });
                    });
                }
                
                // Get SD count from "Awaiting express delivery" to optimize scanning
                const expectedSDCount = getSpecialDeliveryCount();
                const shouldCheckSD = expectedSDCount > 0;
                
                // Only find subtotal column if we need to check for SD items
                if (shouldCheckSD && cachedSubtotalIndex === -1) {
                    cachedSubtotalIndex = findSubtotalColumnIndex(cachedTable);
                }
                
                let foundSDCount = 0; // Track how many SD items we've found
                
                // Batch process for performance
                const BATCH_SIZE = totalPriceElements.length > 100 ? 50 : totalPriceElements.length;
                let processed = 0;
                
                const processBatch = () => {
                    const end = Math.min(processed + BATCH_SIZE, totalPriceElements.length);
                    const batchHighlight = [];
                    const batchHighlightSD = [];
                    const batchDuplicateBuyer = [];
                    const batchUnhighlight = [];
                    
                    // Stop early if we've found all expected SD items
                    const shouldContinueSDCheck = shouldCheckSD && foundSDCount < expectedSDCount;
                    
                    for (let i = processed; i < end; i++) {
                        const priceDiv = totalPriceElements[i];
                        const row = priceDiv.closest('tr');
                        
                        if (!row) continue;
                        
                        // Priority 1: Check if this row belongs to a duplicate buyer
                        if (fallbackDuplicateBuyerRows.has(row)) {
                            batchDuplicateBuyer.push(row);
                            continue; // Skip price checking for duplicate buyers
                        }

                        const priceText = priceDiv.textContent.trim();
                        const price = parsePrice(priceText);

                        if (price >= THRESHOLD) {
                            // Try to detect special delivery if we have column indices and haven't found all SD items yet
                            if (shouldContinueSDCheck && cachedColumnIndex !== -1 && cachedSubtotalIndex !== -1) {
                                if (isSpecialDeliveryOrder(row, cachedColumnIndex, cachedSubtotalIndex)) {
                                    batchHighlightSD.push(row);
                                    foundSDCount++;
                                    // Stop checking for SD if we've found all expected items
                                    if (foundSDCount >= expectedSDCount) {
                                        // Mark remaining elements as regular highlights
                                        for (let j = i + 1; j < end; j++) {
                                            const remainingPriceDiv = totalPriceElements[j];
                                            const remainingRow = remainingPriceDiv.closest('tr');
                                            if (!remainingRow) continue;
                                            // Skip if it's a duplicate buyer row
                                            if (fallbackDuplicateBuyerRows.has(remainingRow)) {
                                                batchDuplicateBuyer.push(remainingRow);
                                                continue;
                                            }
                                            const remainingPriceText = remainingPriceDiv.textContent.trim();
                                            const remainingPrice = parsePrice(remainingPriceText);
                                            if (remainingPrice >= THRESHOLD) {
                                                batchHighlight.push(remainingRow);
                                                highlightedCount++;
                                            } else {
                                                batchUnhighlight.push(remainingRow);
                                            }
                                        }
                                        break; // Exit loop early
                                    }
                                } else {
                                    batchHighlight.push(row);
                                }
                            } else {
                                // Fallback: use regular highlight if we can't detect SD or already found all SD items
                                batchHighlight.push(row);
                            }
                            highlightedCount++;
                        } else {
                            batchUnhighlight.push(row);
                        }
                    }
                    
                    processed = end;
                    
                    // Apply changes in batches to reduce reflows
                    if (batchHighlight.length > 0 || batchHighlightSD.length > 0 || batchDuplicateBuyer.length > 0 || batchUnhighlight.length > 0) {
                        requestAnimationFrame(() => {
                            // Remove all highlight classes first
                            batchUnhighlight.forEach(row => {
                                row.classList.remove(HIGHLIGHT_CLASS);
                                row.classList.remove(SPECIAL_DELIVERY_CLASS);
                                row.classList.remove(DUPLICATE_BUYER_CLASS);
                            });
                            // Add duplicate buyer highlight (green) - highest priority
                            batchDuplicateBuyer.forEach(row => {
                                row.classList.remove(HIGHLIGHT_CLASS);
                                row.classList.remove(SPECIAL_DELIVERY_CLASS);
                                row.classList.add(DUPLICATE_BUYER_CLASS);
                            });
                            // Add regular highlight (red)
                            batchHighlight.forEach(row => {
                                row.classList.remove(SPECIAL_DELIVERY_CLASS);
                                row.classList.remove(DUPLICATE_BUYER_CLASS);
                                row.classList.add(HIGHLIGHT_CLASS);
                            });
                            // Add special delivery highlight (silver)
                            batchHighlightSD.forEach(row => {
                                row.classList.remove(HIGHLIGHT_CLASS);
                                row.classList.remove(DUPLICATE_BUYER_CLASS);
                                row.classList.add(SPECIAL_DELIVERY_CLASS);
                            });
                        });
                    }
                    
                    // Continue processing if more elements and we haven't found all SD items yet
                    if (processed < totalPriceElements.length && (!shouldCheckSD || foundSDCount < expectedSDCount)) {
                        setTimeout(processBatch, 0);
                    } else {
                        requestAnimationFrame(() => {
                            updateSummaryCount(highlightedCount);
                            updateStickyBar(highlightedCount, expectedSDCount, fallbackDuplicateBuyersInfo);
                            isProcessing = false;
                        });
                    }
                };
                
                processBatch();
                return;
            }

        } catch (error) {
            console.error('eBay Highlighter error:', error);
            isProcessing = false;
        }
    }

    /**
     * Find and extract special delivery count from navigation menu
     * Optimized with caching to avoid repeated DOM queries
     * Uses specific selector: span.listbox__value containing "Awaiting express delivery"
     */
    function getSpecialDeliveryCount() {
        // Use efficient selector to find listbox__value spans
        const listboxValues = document.querySelectorAll('span.listbox__value');
        
        for (let span of listboxValues) {
            const text = span.textContent || '';
            if (text.includes(SPECIAL_DELIVERY_TEXT)) {
                // Extract count from parentheses: "Awaiting express delivery (1)" or "Awaiting dispatch (28)"
                const match = text.match(/\((\d+)\)/);
                if (match && match[1]) {
                    return parseInt(match[1], 10);
                }
            }
        }
        
        return 0;
    }
    
    /**
     * Create or update special delivery popup notification
     */
    function updateSpecialDeliveryNotification(count) {
        // Hide if count is 0
        if (count === 0) {
            const existingPopup = document.getElementById('ebay-special-delivery-popup');
            if (existingPopup) {
                existingPopup.remove();
            }
            return;
        }
        
        // Only show if count changed
        if (count === lastSpecialDeliveryCount) {
            return;
        }
        
        lastSpecialDeliveryCount = count;
        
        let popup = document.getElementById('ebay-special-delivery-popup');
        
        if (!popup) {
            // Create popup
            popup = document.createElement('div');
            popup.id = 'ebay-special-delivery-popup';
            popup.className = 'ebay-special-delivery-popup';
            
            const message = document.createElement('div');
            message.className = 'ebay-special-delivery-message';
            message.textContent = `There are ${count} special deliveries today`;
            
            const closeBtn = document.createElement('button');
            closeBtn.className = 'ebay-special-delivery-close';
            closeBtn.textContent = 'Close';
            closeBtn.setAttribute('aria-label', 'Close');
            closeBtn.addEventListener('click', () => {
                popup.remove();
            });
            
            popup.appendChild(message);
            popup.appendChild(closeBtn);
            document.body.appendChild(popup);
        } else {
            // Update existing popup
            const message = popup.querySelector('.ebay-special-delivery-message');
            if (message) {
                message.textContent = `There are ${count} special deliveries today`;
            }
        }
    }
    
    /**
     * Check and update special delivery count (debounced)
     */
    let specialDeliveryTimeout;
    function checkSpecialDeliveries() {
        clearTimeout(specialDeliveryTimeout);
        specialDeliveryTimeout = setTimeout(() => {
            requestAnimationFrame(() => {
                const count = getSpecialDeliveryCount();
                updateSpecialDeliveryNotification(count);
                
                // Also update sticky bar with special delivery count
                const stickyBar = document.getElementById('ebay-highlighter-sticky-bar');
                if (stickyBar) {
                    // Get current orders count from sticky bar text
                    const barText = stickyBar.textContent;
                    const ordersMatch = barText.match(/Orders Needing Tracking: (\d+)/);
                    const ordersCount = ordersMatch ? parseInt(ordersMatch[1], 10) : 0;
                    
                    // Re-detect duplicate buyers to preserve info in banner
                    let duplicateBuyersInfo = null;
                    if (cachedTable && cachedColumnIndex !== -1) {
                        duplicateBuyersInfo = detectDuplicateBuyers(cachedTable, cachedColumnIndex);
                    }
                    
                    updateStickyBar(ordersCount, count, duplicateBuyersInfo);
                }
            });
        }, 500); // Debounce to max once per 500ms
    }
    
    /**
     * Optimized debounced version of highlightOrders
     */
    let highlightTimeout;
    function debouncedHighlight() {
        clearTimeout(highlightTimeout);
        highlightTimeout = setTimeout(() => {
            requestAnimationFrame(highlightOrders);
        }, 100);
    }

    /**
     * Toggle selection of all checkboxes for orders over £9.90 OR special delivery items
     * If all are selected, deselects them. Otherwise, selects them.
     */
    function selectOrdersNeedingTracking() {
        // Find the orders table (not the summary table)
        if (!cachedTable || !document.contains(cachedTable)) {
            cachedTable = findOrdersTable();
            // Reset column indices when table changes
            if (cachedTable) {
                cachedColumnIndex = -1;
                cachedSubtotalIndex = -1;
            }
        }
        
        if (!cachedTable) {
            return 0;
        }
        
        // Find Total and Subtotal column indices if not cached
        if (cachedColumnIndex === -1) {
            cachedColumnIndex = findTotalColumnIndex(cachedTable);
        }
        if (cachedSubtotalIndex === -1) {
            cachedSubtotalIndex = findSubtotalColumnIndex(cachedTable);
        }
        
        // First, collect all checkboxes for orders over threshold OR special delivery
        const eligibleCheckboxes = [];
        
        // Try multiple selectors to find all rows, excluding summary rows
        let allRows = cachedTable.querySelectorAll('tbody tr, tbody > [role="row"]');
        if (allRows.length === 0) {
            // Fallback: try finding rows without tbody constraint
            allRows = cachedTable.querySelectorAll('tr[data-testid]');
        }
        if (allRows.length === 0) {
            // Another fallback: look for any tr
            allRows = cachedTable.querySelectorAll('tr');
        }
        // Also try finding rows by role
        if (allRows.length === 0) {
            allRows = cachedTable.querySelectorAll('[role="row"]');
        }
        
        // Filter out summary rows and rows without checkboxes
        const rows = Array.from(allRows).filter(tr => {
            // Skip summary rows
            if (tr.classList.contains('totalSummaryTableRow')) {
                return false;
            }
            // Only include rows that have checkboxes
            const hasCheckbox = tr.querySelector('input[type="checkbox"][data-testid="order-checkbox"]') ||
                               tr.querySelector('input[type="checkbox"].checkbox__control') ||
                               tr.querySelector('input[type="checkbox"][id^="grid-table-bulk-checkbox"]');
            return !!hasCheckbox;
        });
        
        // If column index not cached, try to find it now
        if (cachedColumnIndex === -1) {
            cachedColumnIndex = findTotalColumnIndex(cachedTable);
        }
        
        // Find subtotal index if needed for special delivery detection
        if (cachedSubtotalIndex === -1 && cachedColumnIndex !== -1) {
            cachedSubtotalIndex = findSubtotalColumnIndex(cachedTable);
        }
        
        // Detect duplicate buyers and their totals
        const duplicateBuyersInfo = detectDuplicateBuyers(cachedTable, cachedColumnIndex);
        const duplicateBuyerRowsSet = new Set();
        
        // Build set of rows from duplicate buyers whose total >= THRESHOLD (to skip in individual check)
        if (duplicateBuyersInfo && duplicateBuyersInfo.buyersNeedingTracking) {
            duplicateBuyersInfo.buyersNeedingTracking.forEach(buyer => {
                if (buyer && buyer.rows) {
                    buyer.rows.forEach(row => {
                        duplicateBuyerRowsSet.add(row);
                    });
                }
            });
            
            // Collect checkboxes from duplicate buyers whose total >= THRESHOLD
            duplicateBuyersInfo.buyersNeedingTracking.forEach(buyer => {
                if (buyer && buyer.rows) {
                    buyer.rows.forEach(row => {
                        const checkbox = row.querySelector('input[type="checkbox"][data-testid="order-checkbox"]') ||
                                       row.querySelector('input[type="checkbox"].checkbox__control') ||
                                       row.querySelector('input[type="checkbox"][id^="grid-table-bulk-checkbox"]');
                        if (checkbox && !eligibleCheckboxes.includes(checkbox)) {
                            eligibleCheckboxes.push(checkbox);
                        }
                    });
                }
            });
        }
        
        // Also collect checkboxes for single orders (non-duplicate) that meet criteria
        rows.forEach(row => {
            // Skip if this row belongs to a duplicate buyer (already handled above)
            if (duplicateBuyerRowsSet.has(row)) {
                return;
            }
            
            let checkbox = row.querySelector('input[type="checkbox"][data-testid="order-checkbox"]') ||
                          row.querySelector('input[type="checkbox"].checkbox__control') ||
                          row.querySelector('input[type="checkbox"][id^="grid-table-bulk-checkbox"]');
            
            if (!checkbox) return;
            
            let isEligible = false;
            let price = 0;
            
            // Check if order is over threshold
            if (cachedColumnIndex !== -1) {
                const cells = row.querySelectorAll('td, [role="cell"]');
                if (cells.length > cachedColumnIndex) {
                    const totalCell = cells[cachedColumnIndex];
                    const totalPriceDiv = totalCell.querySelector('.total-price');
                    const priceText = totalPriceDiv ? totalPriceDiv.textContent.trim() : totalCell.textContent.trim();
                    price = parsePrice(priceText);
                    
                    if (price >= THRESHOLD) {
                        isEligible = true;
                    }
                }
            }
            
            // Fallback: search for .total-price in row
            if (!isEligible) {
                const totalPriceDiv = row.querySelector('.total-price');
                if (totalPriceDiv) {
                    price = parsePrice(totalPriceDiv.textContent.trim());
                    if (price >= THRESHOLD) {
                        isEligible = true;
                    }
                }
            }
            
            // Also check if it's a special delivery order (even if under threshold)
            if (!isEligible && cachedColumnIndex !== -1 && cachedSubtotalIndex !== -1) {
                if (isSpecialDeliveryOrder(row, cachedColumnIndex, cachedSubtotalIndex)) {
                    isEligible = true;
                }
            }
            
            if (isEligible && !eligibleCheckboxes.includes(checkbox)) {
                eligibleCheckboxes.push(checkbox);
            }
        });
        
        if (eligibleCheckboxes.length === 0) {
            return 0;
        }
        
        // Check if all eligible checkboxes are already selected
        const allSelected = eligibleCheckboxes.every(cb => cb.checked);
        
        // Use the eligible checkboxes (includes duplicate buyers + single orders)
        const checkboxes = eligibleCheckboxes;
        const shouldBeChecked = !allSelected;
        
        // Process checkboxes one at a time with delays
        checkboxes.forEach((checkbox, index) => {
            setTimeout(() => {
                if (checkbox.checked === shouldBeChecked) {
                    return;
                }
                
                // Strategy 1: Native click() - try this first
                try {
                    checkbox.click();
                    setTimeout(() => {
                        if (checkbox.checked !== shouldBeChecked) {
                            // Strategy 2: Try clicking parent or label
                            const label = checkbox.closest('label') || document.querySelector(`label[for="${checkbox.id}"]`);
                            const parent = checkbox.parentElement;
                            
                            [label, parent].filter(Boolean).forEach(target => {
                                try {
                                    target.click();
                                } catch (e) {
                                    // Ignore errors
                                }
                            });
                            
                            setTimeout(() => {
                                if (checkbox.checked !== shouldBeChecked) {
                                    // Strategy 3: Direct property + events
                                    try {
                                        checkbox.checked = shouldBeChecked;
                                        ['input', 'change', 'click'].forEach(eventType => {
                                            const event = eventType === 'click'
                                                ? new MouseEvent('click', { bubbles: true, cancelable: false, view: window })
                                                : new Event(eventType, { bubbles: true, cancelable: false });
                                            checkbox.dispatchEvent(event);
                                        });
                                        
                                        if (checkbox.checked !== shouldBeChecked) {
                                            console.warn(`eBay Highlighter: Failed to update checkbox ${index}. Current: ${checkbox.checked}, Expected: ${shouldBeChecked}`);
                                        }
                                    } catch (e) {
                                        console.error(`eBay Highlighter: Error in property manipulation for checkbox ${index}:`, e);
                                    }
                                }
                            }, 100);
                        }
                    }, 150);
                } catch (e) {
                    console.error(`eBay Highlighter: Error clicking checkbox ${index}:`, e);
                }
            }, index * 150); // Stagger by 150ms to avoid overwhelming
        });
        
        return checkboxes.length;
    }

    /**
     * Create button to select orders needing tracking
     */
    function createSelectTrackingButton() {
        const flags = getFeatureFlags();
        if (!flags.button) {
            // Remove button if it exists but shouldn't be shown
            const existingBtn = document.getElementById('ebay-select-tracking-btn');
            const existingContainer = document.getElementById('ebay-select-tracking-container');
            if (existingBtn) existingBtn.remove();
            if (existingContainer) existingContainer.remove();
            return;
        }
        
        // Remove existing button if it exists (to recreate it)
        const existingBtn = document.getElementById('ebay-select-tracking-btn');
        const existingContainer = document.getElementById('ebay-select-tracking-container');
        if (existingBtn) {
            existingBtn.remove();
        }
        if (existingContainer) {
            existingContainer.remove();
        }
        
        // Find where to place the button - look for bulk actions area
        // Try multiple strategies to find the right location
        let insertTarget = null;
        let insertParent = null;
        
        // Strategy 1: Look for bulk-shipping container and place as first child (far left)
        const bulkShippingContainer = document.querySelector('.bulk-shipping.bulk-action');
        if (bulkShippingContainer) {
            insertParent = bulkShippingContainer;
            insertTarget = bulkShippingContainer.firstElementChild;
        }
        
        // Strategy 1b: Look for Postage button and place before it (fallback)
        if (!insertParent) {
            const postageButton = document.querySelector('button[aria-controls*="bulkShippingMenu"], .fake-menu-button.shui-menu-dropdown button');
            if (postageButton) {
                const postageContainer = postageButton.closest('.fake-menu-button') || postageButton.parentElement;
                if (postageContainer) {
                    insertParent = postageContainer.parentElement;
                    insertTarget = postageContainer;
                }
            }
        }
        
        // Strategy 2: Look for pagination wrapper (most reliable location)
        if (!insertParent) {
            const paginationWrapper = document.getElementById('pagination-wrapper');
            if (paginationWrapper) {
                insertParent = paginationWrapper;
                const actionPagination = paginationWrapper.querySelector('.action-pagination');
                insertTarget = actionPagination || paginationWrapper.firstElementChild;
            }
        }
        
        // Strategy 3: Look for action-pagination (pagination area)
        if (!insertParent) {
            const actionPagination = document.querySelector('.action-pagination');
            if (actionPagination) {
                insertParent = actionPagination.parentElement;
                insertTarget = actionPagination;
            }
        }
        
        // Strategy 4: Look for table and insert before it
        if (!insertParent) {
            const table = cachedTable || document.querySelector('table');
            if (table) {
                insertParent = table.parentElement;
                insertTarget = table;
            }
        }
        
        // Strategy 5: Look for page heading and insert after it
        if (!insertParent) {
            const pageHeading = document.querySelector('.app-page-heading');
            if (pageHeading) {
                insertParent = pageHeading.parentElement;
                insertTarget = pageHeading.nextElementSibling;
            }
        }
        
        // Strategy 6: Fallback to main content area
        if (!insertParent) {
            const mainContent = document.querySelector('.sh-core-layout__center') ||
                               document.querySelector('main') ||
                               document.querySelector('#mainContent');
            if (mainContent) {
                insertParent = mainContent;
                insertTarget = mainContent.firstElementChild;
            }
        }
        
        if (!insertParent) {
            // Last resort: append to body
            insertParent = document.body;
            insertTarget = null;
        }
        
        // Create button container (styled like Postage button)
        const buttonContainer = document.createElement('span');
        buttonContainer.className = 'ebay-select-tracking-container fake-menu-button';
        buttonContainer.id = 'ebay-select-tracking-container';
        buttonContainer.style.cssText = 'display: inline-block !important; visibility: visible !important; opacity: 1 !important; position: relative !important; margin-right: 10px !important; vertical-align: middle !important;';
        
        // Remove any SVG icons that might be added by eBay's CSS
        buttonContainer.setAttribute('data-ebay-no-icon', 'true');
        
        // Create button element styled like Postage button
        const button = document.createElement('button');
        button.id = 'ebay-select-tracking-btn';
        button.className = 'btn btn--secondary';
        button.type = 'button';
        button.setAttribute('aria-haspopup', 'false');
        // Explicitly NOT disabled - always enabled
        button.removeAttribute('disabled');
        button.style.cssText = 'cursor: pointer !important; padding: 8px 16px !important; display: inline-block !important; visibility: visible !important; opacity: 1 !important; position: relative !important; background-color: #3665F3 !important; color: white !important; border: 1px solid #3665F3 !important; border-radius: 4px !important;';
        
        // Create btn__cell span (matching Postage button structure)
        const btnCell = document.createElement('span');
        btnCell.className = 'btn__cell';
        
        // Create text span
        const btnText = document.createElement('span');
        btnText.textContent = 'Select Tracking';
        
        // Assemble button (no arrow/SVG icon)
        btnCell.appendChild(btnText);
        button.appendChild(btnCell);
        buttonContainer.appendChild(button);
        
        // Add click handler
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Clear caches to force re-detection
            cachedTable = null;
            cachedColumnIndex = -1;
            cachedSubtotalIndex = -1;
            
            // Small delay to ensure DOM is ready, then select
            setTimeout(() => {
                selectOrdersNeedingTracking();
            }, 100);
        });
        
        // Insert button - try multiple strategies
        let inserted = false;
        
        try {
            // Strategy 1: Insert before pagination if found
            if (insertTarget && insertTarget !== insertParent) {
                if (insertTarget.parentNode === insertParent) {
                    insertParent.insertBefore(buttonContainer, insertTarget);
                    inserted = true;
                } else {
                    insertTarget.parentNode.insertBefore(buttonContainer, insertTarget);
                    inserted = true;
                }
            }
            
            // Strategy 2: Append to parent
            if (!inserted && insertParent) {
                insertParent.appendChild(buttonContainer);
                inserted = true;
            }
            
            // Strategy 3: Last resort - append to body at top
            if (!inserted) {
                const firstChild = document.body.firstChild;
                if (firstChild) {
                    document.body.insertBefore(buttonContainer, firstChild);
                } else {
                    document.body.appendChild(buttonContainer);
                }
                buttonContainer.style.cssText = 'position: fixed; top: 100px; right: 20px; z-index: 999999; background: white; padding: 10px; border: 2px solid #3665F3; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);';
                inserted = true;
            }
            
            if (inserted) {
                // Verify button is actually in DOM and visible
                setTimeout(() => {
                    const btn = document.getElementById('ebay-select-tracking-btn');
                    if (btn) {
                        const rect = btn.getBoundingClientRect();
                        const styles = window.getComputedStyle(btn);
                        
                        // If button exists but is not visible, make it fixed position
                        if (rect.width === 0 || rect.height === 0 || styles.display === 'none' || styles.visibility === 'hidden') {
                            buttonContainer.style.cssText = 'position: fixed !important; top: 100px !important; right: 20px !important; z-index: 999999 !important; background: white !important; padding: 10px !important; border: 2px solid #3665F3 !important; border-radius: 4px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important; display: block !important; visibility: visible !important; opacity: 1 !important;';
                        }
                    } else {
                        console.error('eBay Highlighter: Button not found in DOM after insertion!');
                    }
                }, 500);
            }
        } catch (error) {
            console.error('eBay Highlighter: Error inserting button:', error);
            // Final fallback: try to append to body
            try {
                document.body.appendChild(buttonContainer);
                buttonContainer.style.cssText = 'position: fixed; top: 100px; right: 20px; z-index: 999999; background: white; padding: 10px; border: 2px solid #3665F3; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);';
            } catch (finalError) {
                console.error('eBay Highlighter: Failed to append button to body:', finalError);
            }
        }
    }

    /**
     * Initialize the extension
     */
    function init() {
        // Check if extension should run on this page
        const flags = getFeatureFlags();
        if (!flags.enabled) {
            // Clean up any existing elements if we're on a page that shouldn't have them
            const stickyBar = document.getElementById('ebay-highlighter-sticky-bar');
            if (stickyBar) stickyBar.remove();
            const countElement = document.querySelector('.ebay-highlight-count');
            if (countElement) countElement.remove();
            const existingBtn = document.getElementById('ebay-select-tracking-btn');
            if (existingBtn) existingBtn.remove();
            const existingContainer = document.getElementById('ebay-select-tracking-container');
            if (existingContainer) existingContainer.remove();
            const highlightedRows = document.querySelectorAll(`tr.${HIGHLIGHT_CLASS}, tr.${SPECIAL_DELIVERY_CLASS}, tr.${DUPLICATE_BUYER_CLASS}`);
            highlightedRows.forEach(row => {
                row.classList.remove(HIGHLIGHT_CLASS);
                row.classList.remove(SPECIAL_DELIVERY_CLASS);
                row.classList.remove(DUPLICATE_BUYER_CLASS);
            });
            document.body.style.paddingTop = '';
            return; // Don't run on this page
        }
        
        const initialize = () => {
            // Re-check flags in case URL changed
            const currentFlags = getFeatureFlags();
            if (!currentFlags.enabled) {
                return;
            }
            
            if (currentFlags.highlight) {
                highlightOrders();
                checkSpecialDeliveries();
            }
            if (currentFlags.button) {
                createSelectTrackingButton();
            }
        };
        
        // Run immediately on page load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(initialize, 1000);
                // Retry once after page fully loads
                setTimeout(initialize, 3000);
            });
        } else {
            setTimeout(initialize, 1000);
            // Retry once after page fully loads
            setTimeout(initialize, 3000);
        }

        // Optimized MutationObserver - throttle callbacks
        let observerTimeout;
        const throttledObserverCallback = (mutations) => {
            clearTimeout(observerTimeout);
            observerTimeout = setTimeout(() => {
                const flags = getFeatureFlags();
                if (!flags.enabled) {
                    return; // Don't run on this page
                }
                
                let shouldHighlight = false;
                let summaryChanged = false;
                let navChanged = false;
                
                mutations.forEach((mutation) => {
                    if (mutation.addedNodes.length > 0 || mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                // Check for table changes
                                if (node.tagName === 'TR' || 
                                    node.tagName === 'TBODY' ||
                                    (node.querySelector && node.querySelector('tr, tbody'))) {
                                    shouldHighlight = true;
                                    // Invalidate cache if table structure changed
                                    if (node.tagName === 'TBODY' || node.querySelector('tbody')) {
                                        cachedTable = null;
                                        cachedColumnIndex = -1;
                                    }
                                }
                                // Check if summary area changed
                                if (node.classList && (
                                    node.classList.contains('summary-content') ||
                                    node.id === 'totalsWrapper' ||
                                    (node.querySelector && (
                                        node.querySelector('.summary-content') ||
                                        node.querySelector('#totalsWrapper')
                                    ))
                                )) {
                                    summaryChanged = true;
                                }
                                // Check if navigation menu changed (look for listbox__value)
                                if (node.classList && (
                                    node.classList.contains('listbox__value') ||
                                    (node.querySelector && node.querySelector('span.listbox__value'))
                                )) {
                                    navChanged = true;
                                }
                            }
                        });
                    }
                });

                if (flags.highlight && (shouldHighlight || summaryChanged)) {
                    debouncedHighlight();
                }
                if (navChanged) {
                    checkSpecialDeliveries();
                }
                // Try to create button if it doesn't exist and button is enabled
                if (flags.button && !document.getElementById('ebay-select-tracking-btn')) {
                    createSelectTrackingButton();
                }
            }, 200); // Throttle to max once per 200ms
        };

        // Watch table area specifically (more efficient than watching entire body)
        const tableContainer = document.querySelector('.sh-core-layout__center') || 
                              document.querySelector('main') || 
                              document.body;
        
        const tableObserver = new MutationObserver(throttledObserverCallback);
        tableObserver.observe(tableContainer, {
            childList: true,
            subtree: true
        });

        // Watch for listbox__value changes (where special delivery count appears)
        const navObserver = new MutationObserver((mutations) => {
            const flags = getFeatureFlags();
            if (!flags.enabled) {
                return; // Don't run on this page
            }
            
            let navChanged = false;
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0 || mutation.type === 'childList') {
                    // Check if any added nodes are listbox__value spans
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.classList && node.classList.contains('listbox__value')) {
                                navChanged = true;
                            } else if (node.querySelector && node.querySelector('span.listbox__value')) {
                                navChanged = true;
                            }
                        }
                    });
                }
                // Also check for text changes in existing listbox__value spans
                if (mutation.type === 'characterData' || mutation.type === 'childList') {
                    const target = mutation.target;
                    if (target.classList && target.classList.contains('listbox__value')) {
                        navChanged = true;
                    }
                }
            });
            if (navChanged && flags.highlight) {
                checkSpecialDeliveries();
            }
        });
        
        // Watch document body for listbox__value elements (they can appear in various places)
        navObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true // Watch for text content changes
        });

        // Watch for URL changes (SPA navigation) - throttled
        let lastUrl = location.href;
        let urlCheckTimeout;
        const urlObserver = new MutationObserver(() => {
            clearTimeout(urlCheckTimeout);
            urlCheckTimeout = setTimeout(() => {
                const url = location.href;
                if (url !== lastUrl) {
                    lastUrl = url;
                    // Reset caches on navigation
                    cachedTable = null;
                    cachedColumnIndex = -1;
                    cachedSubtotalIndex = -1;
                    
                    // Check flags for new URL
                    const flags = getFeatureFlags();
                    if (!flags.enabled) {
                        // Clean up if we're on a page that shouldn't have the extension
                        const stickyBar = document.getElementById('ebay-highlighter-sticky-bar');
                        if (stickyBar) stickyBar.remove();
                        const countElement = document.querySelector('.ebay-highlight-count');
                        if (countElement) countElement.remove();
                        const existingBtn = document.getElementById('ebay-select-tracking-btn');
                        if (existingBtn) existingBtn.remove();
                        const existingContainer = document.getElementById('ebay-select-tracking-container');
                        if (existingContainer) existingContainer.remove();
                        const highlightedRows = document.querySelectorAll(`tr.${HIGHLIGHT_CLASS}, tr.${SPECIAL_DELIVERY_CLASS}, tr.${DUPLICATE_BUYER_CLASS}`);
                        highlightedRows.forEach(row => {
                            row.classList.remove(HIGHLIGHT_CLASS);
                            row.classList.remove(SPECIAL_DELIVERY_CLASS);
                            row.classList.remove(DUPLICATE_BUYER_CLASS);
                        });
                        return;
                    }
                    
                    setTimeout(() => {
                        if (flags.highlight) {
                            highlightOrders();
                            checkSpecialDeliveries();
                        }
                        if (flags.button) {
                            createSelectTrackingButton();
                        }
                    }, 1500);
                }
            }, 300);
        });
        urlObserver.observe(document, { subtree: true, childList: true });
    }

    // Initialize when script loads
    init();
})();
