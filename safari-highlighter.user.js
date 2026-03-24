// ==UserScript==
// @name         Safari Highlighter
// @version      1.1.0
// @description  Color Palette Update
// @match        *://*/*
// @grant        none
// ==/UserScript==

/* CHANGE LOG:
  1.1.0 - Updated colors to Yellow, Green, Red, Orange with improved hex codes.
  1.0.0 - Initial stable release.
*/

(function() {
    'use strict';

    const colors = [
        { name: 'Yellow', value: '#FFF382' },
        { name: 'Green', value: '#01DAC3' },
        { name: 'Red', value: '#FF375F' }, 
        { name: 'Orange', value: '#FF9230' }
    ];
    let colorIndex = 0;
    let currentColor = colors[colorIndex].value;
    let history = [];
    let holdTimer = null;
    let cycleInterval = null;
    let isCycling = false;
    let hKeyDown = false;

    const styleId = 'safari-highlighter-styles';
    if (!document.getElementById(styleId)) {
        const css = `
            .safari-hl { color: #000 !important; background-color: var(--hl-color) !important; display: inline !important; position: relative; z-index: 10; }
            .hl-toast { position: fixed; top: 40px; left: 50%; transform: translateX(-50%); background: #1d1d1f; color: white; padding: 10px 20px; border-radius: 25px; font-family: -apple-system; font-size: 14px; z-index: 9999999; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
            #hl-palette { position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: rgba(30, 30, 30, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); padding: 15px 25px; border-radius: 50px; display: flex; gap: 20px; z-index: 9999999; opacity: 0; visibility: hidden; transition: opacity 0.2s; border: 1px solid rgba(255,255,255,0.2); }
            .hl-dot { width: 24px; height: 24px; border-radius: 50%; border: 2px solid transparent; transition: all 0.2s; }
            .hl-dot.active { transform: scale(1.4); border-color: #fff; box-shadow: 0 0 15px var(--dot-color); }
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
        dots.forEach((dot, i) => { dot.classList.toggle('active', i === colorIndex); });
    };

    const highlight = () => {
        const sel = window.getSelection();
        if (!sel.rangeCount || !sel.toString().trim()) return;
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        const start = range.startOffset;
        const end = range.endOffset;
        const highlightNode = node.splitText(start);
        highlightNode.splitText(end - start);
        const span = document.createElement('span');
        span.className = 'safari-hl';
        span.style.setProperty('--hl-color', currentColor);
        highlightNode.parentNode.insertBefore(span, highlightNode);
        span.appendChild(highlightNode);
        history.push([span]);
        sel.removeAllRanges();
    };

    const reverseHighlight = () => {
        const lastBatch = history.pop();
        if (!lastBatch) return;
        lastBatch.forEach(span => {
            if (span.parentNode) {
                const p = span.parentNode;
                while (span.firstChild) p.insertBefore(span.firstChild, span);
                span.remove();
                p.normalize();
            }
        });
    };

    const copyHighlights = () => {
        let fullText = history.map(batch => batch.map(s => s.textContent).join('')).filter(t => t.trim()).join('\n');
        if (!fullText) return;
        navigator.clipboard.writeText(fullText).then(() => {
            let t = document.querySelector('.hl-toast') || document.createElement('div');
            t.className = 'hl-toast'; if (!t.parentNode) document.body.appendChild(t);
            t.textContent = "Copied to Clipboard"; t.style.opacity = '1';
            setTimeout(() => t.style.opacity = '0', 2000);
        });
    };

    document.addEventListener('keydown', e => {
        const key = e.key.toLowerCase();
        const activeEl = document.activeElement;
        const isInput = (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable || activeEl.getAttribute('role') === 'textbox');
        const hasSel = window.getSelection().toString().trim().length > 0;
        if (isInput && !hasSel) return;
        if (key === 'h' && !e.metaKey && !hKeyDown) {
            hKeyDown = true;
            if (hasSel) {
                holdTimer = setTimeout(() => {
                    isCycling = true; palette.style.visibility = 'visible'; palette.style.opacity = '1';
                    updatePaletteUI();
                    cycleInterval = setInterval(() => { colorIndex = (colorIndex + 1) % colors.length; updatePaletteUI(); }, 400);
                }, 600);
            }
        }
        if (key === 'r' && !e.metaKey && !hasSel) { e.preventDefault(); reverseHighlight(); }
        if (key === 'c' && !e.metaKey && !hasSel) { e.preventDefault(); copyHighlights(); }
    }, true);

    document.addEventListener('keyup', e => {
        if (e.key.toLowerCase() === 'h') {
            hKeyDown = false; clearTimeout(holdTimer); if (cycleInterval) clearInterval(cycleInterval);
            if (isCycling) {
                currentColor = colors[colorIndex].value; palette.style.opacity = '0';
                setTimeout(() => { palette.style.visibility = 'hidden'; }, 200);
                isCycling = false; highlight();
            } else if (window.getSelection().toString().trim()) highlight();
        }
    });
})();
