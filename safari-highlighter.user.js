// ==UserScript==
// @name         Safari Highlighter
// @version      2.0
// @description  Advanced formatting, YELLOW-GREEN-RED-BLUE, highlights delete after refreshing page, double-click to delete
// @match        *://*/*
// @grant        none
// ==/UserScript==

/* CHANGE LOG:
  2.0.0 - Advanced formatting, YELLOW-GREEN-RED-BLUE, highlights delete after refreshing page, double-click to delete
  1.5.0 - Advanced formatting, YELLOW-GREEN-RED-BLUE, one empty line spacing, highlights delete after refreshing page
  1.4.0 - Enabled nesting (highlights within highlights). Added 'isRestoring' flag to prevent infinite loops (anti-freeze).
  1.3.0 - Added Double-Click to Delete.
  1.2.0 - Added LocalStorage persistence.
*/

(function() {
    'use strict';

    const colors = [
        { name: 'Yellow', value: '#FFF382' },
        { name: 'Green', value: '#01DAC3' },
        { name: 'Red', value: '#FF375F' }, 
        { name: 'Blue', value: '#76D6FF' }
    ];
    
    let colorIndex = 0;
    let currentColor = colors[colorIndex].value;
    let history = [];
    let holdTimer = null;
    let cycleInterval = null;
    let isCycling = false;
    let hKeyDown = false;

    // ISOLATED DELETE FUNCTION
    const removeHighlightBatch = (span) => {
        const batch = history.find(b => b.includes(span));
        if (batch) {
            batch.forEach(s => {
                const p = s.parentNode;
                if (p) {
                    while (s.firstChild) p.insertBefore(s.firstChild, s);
                    s.remove();
                    p.normalize();
                }
            });
            history = history.filter(b => b !== batch);
        }
    };

    const styleId = 'safari-highlighter-styles';
    if (!document.getElementById(styleId)) {
        const css = `
            .safari-hl {
                color: #000 !important;
                background-color: var(--hl-color) !important;
                display: inline !important;
                padding: 0 !important;
                margin: 0 !important;
                font: inherit !important;
                line-height: inherit !important;
                vertical-align: baseline !important;
                position: relative;
                z-index: 10;
                cursor: pointer;
            }
            .hl-toast {
                position: fixed;
                top: 40px;
                left: 50%;
                transform: translateX(-50%);
                background: #1d1d1f;
                color: white;
                padding: 10px 20px;
                border-radius: 25px;
                font-family: -apple-system, system-ui, sans-serif;
                font-size: 14px;
                z-index: 9999999;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            #hl-palette {
                position: fixed;
                top: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(30, 30, 30, 0.95);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                padding: 15px 25px;
                border-radius: 50px;
                display: flex;
                gap: 20px;
                z-index: 9999999;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                border: 1px solid rgba(255,255,255,0.2);
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.2s ease;
            }
            .hl-dot {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                border: 2px solid transparent;
                transition: all 0.2s ease;
            }
            .hl-dot.active {
                transform: scale(1.4);
                border-color: #fff;
                box-shadow: 0 0 15px var(--dot-color);
            }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.id = styleId;
        styleSheet.innerText = css;
        document.head.appendChild(styleSheet);
    }

    const palette = document.createElement('div');
    palette.id = 'hl-palette';
    colors.forEach((c) => {
        const dot = document.createElement('div');
        dot.className = 'hl-dot';
        dot.style.background = c.value;
        dot.style.setProperty('--dot-color', c.value);
        palette.appendChild(dot);
    });
    document.body.appendChild(palette);

    const updatePaletteUI = () => {
        const dots = palette.querySelectorAll('.hl-dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === colorIndex);
        });
    };

    const highlight = () => {
        const sel = window.getSelection();
        if (!sel.rangeCount || !sel.toString().trim()) return;

        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const root = container.nodeType === Node.TEXT_NODE ? container.parentNode : container;
        
        const treeWalker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            { 
                acceptNode: (node) => {
                    return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }
        );

        const nodes = [];
        let currentNode = treeWalker.nextNode();
        while (currentNode) {
            nodes.push(currentNode);
            currentNode = treeWalker.nextNode();
        }

        if (nodes.length === 0 && container.nodeType === Node.TEXT_NODE) {
            nodes.push(container);
        }

        const currentBatch = [];
        nodes.forEach(node => {
            let start = (node === range.startContainer) ? range.startOffset : 0;
            let end = (node === range.endContainer) ? range.endOffset : node.textContent.length;
            
            const textToHighlight = node.textContent.slice(start, end);
            if (!textToHighlight.trim()) return;

            try {
                const highlightNode = node.splitText(start);
                highlightNode.splitText(end - start);

                const span = document.createElement('span');
                span.className = 'safari-hl';
                span.style.setProperty('--hl-color', currentColor);
                
                // ADDED: Double click listener for deletion
                span.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    removeHighlightBatch(span);
                });

                highlightNode.parentNode.insertBefore(span, highlightNode);
                span.appendChild(highlightNode);
                currentBatch.push(span);
            } catch (e) {}
        });

        if (currentBatch.length > 0) {
            history.push(currentBatch);
            sel.removeAllRanges();
        }
    };

    const reverseHighlight = () => {
        const lastBatch = history.pop();
        if (!lastBatch) return;
        lastBatch.forEach(span => {
            if (span.parentNode) {
                const parent = span.parentNode;
                while (span.firstChild) parent.insertBefore(span.firstChild, span);
                span.remove();
                parent.normalize();
            }
        });
    };

    const copyHighlights = () => {
        let fullText = history
            .map(batch => {
                let text = batch.filter(span => document.body.contains(span)).map(span => span.textContent).join('');
                text = text.trim();
                if (text.length > 0) {
                    text = text.replace(/^([^a-zA-Z]*)([a-zA-Z])/, (match, symbols, letter) => {
                        return symbols + letter.toUpperCase();
                    });
                }
                return text;
            })
            .filter(text => text.length > 0)
            .join('\n\n');
        
        if (!fullText) return;
        
        navigator.clipboard.writeText(fullText).then(() => {
            let toast = document.querySelector('.hl-toast') || document.createElement('div');
            toast.className = 'hl-toast';
            if (!toast.parentNode) document.body.appendChild(toast);
            toast.textContent = "Copied to Clipboard";
            toast.style.opacity = '1';
            setTimeout(() => { toast.style.opacity = '0'; }, 2000);
        }).catch(err => console.error("Clipboard failed", err));
    };

    document.addEventListener('keydown', e => {
        const key = e.key.toLowerCase();
        const activeEl = document.activeElement;
        const isInput = (
            activeEl.tagName === 'INPUT' || 
            activeEl.tagName === 'TEXTAREA' || 
            activeEl.isContentEditable ||
            activeEl.getAttribute('role') === 'textbox'
        );
        const hasSelection = window.getSelection().toString().trim().length > 0;

        if (isInput && !hasSelection) return;

        if (key === 'h' && !e.metaKey && !e.ctrlKey && !hKeyDown) {
            hKeyDown = true;
            if (hasSelection) {
                holdTimer = setTimeout(() => {
                    isCycling = true;
                    palette.style.visibility = 'visible';
                    palette.style.opacity = '1';
                    updatePaletteUI();
                    cycleInterval = setInterval(() => {
                        colorIndex = (colorIndex + 1) % colors.length;
                        updatePaletteUI();
                    }, 400);
                }, 600);
            }
        }

        if (key === 'r' && !e.metaKey && !e.ctrlKey && !hasSelection) {
            if (history.length > 0) { 
                e.preventDefault(); 
                reverseHighlight(); 
            }
        }

        if (key === 'c' && !e.metaKey && !e.ctrlKey && !hasSelection) {
            if (history.length > 0) { 
                e.preventDefault(); 
                copyHighlights(); 
            }
        }
    }, true);

    document.addEventListener('keyup', e => {
        if (e.key.toLowerCase() === 'h') {
            hKeyDown = false;
            clearTimeout(holdTimer);
            if (cycleInterval) clearInterval(cycleInterval);

            if (isCycling) {
                currentColor = colors[colorIndex].value;
                palette.style.opacity = '0';
                setTimeout(() => { palette.style.visibility = 'hidden'; }, 200);
                isCycling = false;
                highlight();
            } else {
                if (window.getSelection().toString().trim().length > 0) highlight();
            }
        }
    });
})();
