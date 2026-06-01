// ==UserScript==
// @name         Automação Google Lens V5.5 (Busca Concorrentes BR - Auto Fechar)
// @namespace    http://tampermonkey.net/
// @version      5.5
// @description  Clica em "Exatas", abre até 12 links e fecha a aba do Lens automaticamente.
// @author       Você
// @match        *://lens.google.com/*
// @match        *://www.google.com/*
// @grant        GM_openInTab
// @grant        window.close
// ==/UserScript==

(function() {
    'use strict';

    const url = window.location.href;
    if (!url.includes('olud') && !url.includes('lens.google.com') && !url.includes('vsrid=')) {
        return;
    }

    const statusBox = document.createElement('div');
    statusBox.style.position = 'fixed';
    statusBox.style.bottom = '20px';
    statusBox.style.right = '20px';
    statusBox.style.backgroundColor = '#ffeb3b';
    statusBox.style.color = '#000';
    statusBox.style.padding = '10px 15px';
    statusBox.style.borderRadius = '8px';
    statusBox.style.zIndex = '99999999';
    statusBox.style.fontWeight = 'bold';
    statusBox.style.fontFamily = 'Arial, sans-serif';
    statusBox.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    statusBox.innerText = '🤖 Bot Lens: Iniciado...';

    function ensureStatusBox() {
        if (!document.body.contains(statusBox)) {
            document.body.appendChild(statusBox);
        }
    }

    // LISTA DE ALVOS (Amazon restrita ao BR)
    const targetSites = [
        'mercadolivre', 'casasbahia', 'leroymerlin',
        'americanas', 'amazon.com.br', 'magazineluiza'
    ];

    let hasClickedExact = false;
    let hasOpenedLinks = false;
    let linkRetries = 0;

    function updateStatus(text) {
        statusBox.innerText = '🤖 Bot Lens: ' + text;
        console.log('[Bot Lens]', text);
    }

    function findAndClickExactMatch() {
        if (hasClickedExact) return;

        const elements = document.querySelectorAll('span, div, button, a');
        let buttonToClick = null;

        for (let el of elements) {
            if (el.children.length > 2 && el.tagName !== 'BUTTON' && el.tagName !== 'A') continue;

            const text = (el.innerText || el.textContent || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

            if (text === "correspondencias exatas" || text === "correspondencia exata") {
                buttonToClick = el.closest('button') || el.closest('div[role="button"]') || el.closest('div[role="tab"]') || el.closest('a') || el;
                break;
            }
        }

        if (buttonToClick) {
            updateStatus('Aba "Exatas" encontrada! Clicando...');
            buttonToClick.click();
            hasClickedExact = true;
            setTimeout(openTargetLinks, 3000);
        } else {
             updateStatus('Aguardando envio da imagem/resultados...');
        }
    }

    function openTargetLinks() {
        if (hasOpenedLinks) return;

        const allLinks = document.querySelectorAll('a[href]');
        let linksToOpen = new Set();

        for (let a of allLinks) {
            let href = a.href.toLowerCase();
            const isTargetSite = targetSites.some(site => href.includes(site));

            if (isTargetSite && !href.includes('google.com') && !href.includes('google.com.br')) {
                linksToOpen.add(a.href);
            }
        }

        // MANTIDO O LIMITE DE 12 LINKS
        const finalLinks = Array.from(linksToOpen).slice(0, 12);

        if (finalLinks.length > 0) {
            updateStatus(`Abrindo ${finalLinks.length} abas...`);

            finalLinks.forEach((link, index) => {
                setTimeout(() => {
                    GM_openInTab(link, { active: false, insert: true });
                }, index * 300);
            });

            hasOpenedLinks = true;
            updateStatus('✅ Concluído! Fechando o Lens...');

            // CÁLCULO DE TEMPO: Espera o tempo exato das abas abrirem + 1 segundo de folga, e então fecha
            const tempoParaFechar = (finalLinks.length * 300) + 1000;
            setTimeout(() => {
                window.close();
            }, tempoParaFechar);

        } else {
            linkRetries++;
            if (linkRetries <= 6) {
                updateStatus(`Buscando links concorrentes... (${linkRetries}/6)`);
                setTimeout(openTargetLinks, 1500);
            } else {
                // SE NÃO ACHAR NADA: Avisa e também fecha a aba do Lens após 3 segundos
                updateStatus('❌ Nenhum concorrente alvo encontrado. Fechando aba...');
                hasOpenedLinks = true;
                setTimeout(() => {
                    window.close();
                }, 3000);
            }
        }
    }

    const intervalId = setInterval(() => {
        ensureStatusBox();

        if (hasOpenedLinks) {
            clearInterval(intervalId);
        } else if (!hasClickedExact) {
            findAndClickExactMatch();
        }
    }, 1500);

})();