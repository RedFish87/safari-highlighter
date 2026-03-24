// ==UserScript==
// @name         Safari Highlighter
// @version      1.4.0
// @description  Nesting Support & Anti-Freeze Logic
// @match        *://*/*
// @grant        none
// ==/UserScript==

/* CHANGE LOG:
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
        { name: 'Orange', value: '#FF9230' }
    ];
    
    let colorIndex = 0;
    let currentColor = colors[colorIndex].value;
    let history = [];
    let holdTimer = null;
    let cycleInterval = null;
    let isCycling = false;
    let hKeyDown = false;
    let isRestoring = false; // Flag to prevent infinite loops

    const STORAGE_KEY = 'safari_hl_data_' + window.location.hostname;

    const saveToStorage = () => {
        const data = history.map(batch => {
            const activeSpan = batch.find(s => document.body.contains(s));
            if (!activeSpan) return null;
            return {
                text: batch.map(s => s.textContent).join(''),
                color: activeSpan.style.getPropertyValue('--hl-color')
            };
        }).filter(item => item !== null);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    };

    const restoreHighlights = () => {
        if (isRestoring) return;
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        isRestoring = true;
        const highlightedData = JSON.parse(saved);
        highlightedData.forEach(item => { if (item.text) applyHighlightToText(item.text, item.color, false); });
        isRestoring = false;
    };

    const applyHighlightToText = (targetText, color, save = true) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        const batch = [];
        while (node = walker.nextNode()) {
            const index = node.textContent.indexOf(targetText);
            const isSameColor = node.parentNode.classList.contains('safari-hl') && 
                               node.parentNode.style.getPropertyValue('--hl-color') === color;
            if (index !== -1 && !isSameColor) {
                const highlightNode = node.splitText(index);
                highlightNode.splitText(targetText.length);
                const span = document.createElement('span');
                span.className = 'safari-hl';
                span.style.setProperty('--hl-color', color);
                span.addEventListener('dblclick', function(e) {
                    e.stopPropagation();
                    const parent = span.parentNode;
                    if (!parent) return;
                    while (span.firstChild) parent.insertBefore(span.firstChild, span);
                    span.remove();
                    parent.normalize();
                    history = history.filter(b => !b.includes(span));
                    saveToStorage();
                });
                highlightNode.parentNode.insertBefore(span, highlightNode);
                span.appendChild(highlightNode);
                batch.push(span);
            }
        }
        if (batch.length > 0) { history.push(batch); if (save) saveToStorage(); }
    };

    const styleId = 'safari-highlighter-styles';
    if (!document.getElementById(styleId)) {
        const styleSheet = document.createElement("style");
        styleSheet.id = styleId;
        styleSheet.innerText = `.safari-hl { color: #000 !important; background-color: var(--hl-color) !important; display: inline !important; cursor: pointer; position: relative; z-index: 10; }
        .hl-toast { position: fixed; top: 40px; left: 50%; transform: translateX(-50%); background: #1d1d1f; color: white; padding: 10px 20px; border-radius: 25px; font-family: -apple-system; font-size: 14px; z-index: 9999999; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
        #hl-palette { position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: rgba(30, 30, 30, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); padding: 15px 25px; border-radius: 50px; display: flex; gap: 20px; z-index: 9999999; opacity: 0; visibility: hidden; transition: opacity 0.2s; border: 1px solid rgba(255,255,255,0.2); }
        .hl-dot { width: 24px; height: 24px; border-radius: 50%; border: 2px solid transparent; transition: all 0.2s; }
        .hl-dot.active { transform: scale(1.4); border-color: #fff; box-shadow: 0 0 15px var(--dot-color); }`;
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

    const highlight = () => {
        const sel = window.getSelection();
        const text = sel.toString().trim();
        if (sel.rangeCount && text) { applyHighlightToText(text, currentColor, true); sel.removeAllRanges(); }
    };

    const copyHighlights = () => {
        const content = history.map(batch => {
            let text = batch.filter(span => document.body.contains(span)).map(span => span.textContent).join('').trim();
            return text.length > 0 ? text.replace(/^([^a-zA-Z]*)([a-zA-Z])/, (m, s, l) => s + l.toUpperCase()) : null;
        }).filter(t => t).join('\n\n'); 
        if (content) {
            navigator.clipboard.writeText(content).then(() => {
                let t = document.querySelector('.hl-toast') || document.createElement('div');
                t.className = 'hl-toast'; if (!t.parentNode) document.body.appendChild(t);
                t.textContent = "Copied to Clipboard"; t.style.opacity = '1';
                setTimeout(() => t.style.opacity = '0', 2000);
            });
        }
    };

    document.addEventListener('keydown', e => {
        const key = e.key.toLowerCase();
        const isInput = (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable || document.activeElement.getAttribute('role') === 'textbox');
        const hasSel = window.getSelection().toString().trim().length > 0;
        if (isInput && !hasSel) return;
        if (key === 'h' && !e.metaKey && !hKeyDown) {
            hKeyDown = true;
            if (hasSel) {
                holdTimer = setTimeout(() => {
                    isCycling = true; palette.style.visibility = 'visible'; palette.style.opacity = '1';
                    cycleInterval = setInterval(() => { colorIndex = (colorIndex + 1) % colors.length; 
                        palette.querySelectorAll('.hl-dot').forEach((dot, i) => dot.classList.toggle('active', i === colorIndex));
                    }, 400);
                }, 600);
            }
        }
        if (key === 'r' && !e.metaKey && !hasSel && history.length > 0) {
            e.preventDefault(); const lb = history.pop();
            if (lb) { lb.forEach(s => { if (s.parentNode) { const p = s.parentNode; while (s.firstChild) p.insertBefore(s.firstChild, s); s.remove(); p.normalize(); } }); saveToStorage(); }
        }
        if (key === 'c' && !e.metaKey && !hasSel && history.length > 0) { e.preventDefault(); copyHighlights(); }
    }, true);

    document.addEventListener('keyup', e => {
        if (e.key.toLowerCase() === 'h') {
            hKeyDown = false; clearTimeout(holdTimer); clearInterval(cycleInterval);
            if (isCycling) {
                currentColor = colors[colorIndex].value; palette.style.opacity = '0';
                setTimeout(() => palette.style.visibility = 'hidden', 200);
                isCycling = false; highlight();
            } else if (window.getSelection().toString().trim()) highlight();
        }
    });

    const observer = new MutationObserver(() => { if (!isRestoring) restoreHighlights(); });
    observer.observe(document.body, { childList: true, subtree: true });
    restoreHighlights();
})();
