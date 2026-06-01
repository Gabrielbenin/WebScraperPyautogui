// ==UserScript==
// @name         Marketplaces - Matador Definitivo (V11.0 - Blindagem Total)
// @namespace    http://tampermonkey.net/
// @version      11.0
// @description  Text normalizer and Immortal Watcher (MutationObserver) to reliably detect unavailable products and own-brand listings.
// @author       Você
// @match        *://*/*
// @grant        window.close
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const sitesAlvo = [
        "mercadolivre.com.br", "amazon.com.br", "magazineluiza.com.br",
        "americanas.com.br", "leroymerlin.com.br", "casasbahia.com.br"
    ];

    const urlAtual = window.location.hostname.toLowerCase();
    let siteAtual = sitesAlvo.find(site => urlAtual.includes(site));
    if (!siteAtual) return;

    // =====================================================================
    // TRITURADOR DE TEXTO (Remove acentos, espaços e pontuações)
    // =====================================================================
    function padronizarTexto(texto) {
        if (!texto) return "";
        return texto.toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Arranca os acentos (á, ã, é)
                    .replace(/[^a-z0-9]/g, ''); // Arranca espaços, símbolos e pontuações
    }

    // =====================================================================
    // 1. REGRAS DE ESTOQUE COMPACTADAS (Sem espaços e sem acentos)
    // =====================================================================
    const regrasGerais = [
        "produtoindisponivel",
        "estoqueindisponivel",
        "anunciopausado",
        "produtoesgotado",
        "semestoque"
    ];

    const regrasPorSite = {
        "casasbahia.com.br": [
            "vocebuscoupor",
            "infelizmentenaotemosestoquedoproduto" // Encurtado para ser letal
        ],
        "mercadolivre.com.br": [
            "esteprodutoestaindisponivel",
            "vertudo",
            "escolhaoutravariacao"
        ],
        "americanas.com.br": [
            "poxaprodutosemestoque"
        ],
        "leroymerlin.com.br": [
            "filtrosselecionados",
            "itemindisponivel"
        ],
        "magazineluiza.com.br": [
            "verprodutossimilares"
        ],
        "amazon.com.br": [
            "naotemosprevisaodequandoesteprodutoestaradisponivel"
        ]
    };

    const regrasAtivas = (regrasPorSite[siteAtual] || []).concat(regrasGerais);

    // =====================================================================
    // 2. REGRAS DE VENDEDORES (Também compactadas)
    // =====================================================================
    const bannedSellers = ["ownstore", "officialstore", "casatema"];
    const prefixos = ["vendidopor", "vendidoeentreguepor", "lojaoficial", "entreguepor", "vendidoporeentreguepor"];
    let bannedPhrases = [];
    prefixos.forEach(p => bannedSellers.forEach(l => bannedPhrases.push(p + l)));

    const seletoresVendedor = [
        '.product-seller__name', '.seller-name__link', '.product-marketplace-sellers', // Leroy
        '#sellerProfileTriggerId', '#merchant-info a', '#tabular-buybox a', // Amazon
        '.ui-pdp-seller__link-trigger', '.ui-pdp-vendedor', '.ui-pdp-buybox__seller-name', // Meli
        '.prod-seller-name', '[data-testid="seller-name"]', '.seller-info__name', // Casas Bahia
        '.seller-name', '[data-testid="seller-page-link"]' // Magalu e Americanas
    ];

    // =====================================================================
    // O MOTOR DO SCRIPT
    // =====================================================================
    function verificarEFechar() {
        if (!document.body) return;

        let textoVisivel = document.body.innerText || document.body.textContent;
        let textoCompactado = padronizarTexto(textoVisivel);

        // --- CHECAGEM A: SEM ESTOQUE ---
        for (let frase of regrasAtivas) {
            if (textoCompactado.includes(frase)) {
                console.log(`[Matador] Fechado por falta de estoque! Encontrou: "${frase}"`);
                window.close();
                return;
            }
        }

        // --- CHECAGEM B: RAIO-X DE CÓDIGO DO VENDEDOR ---
        const caixinhasVendedor = document.querySelectorAll(seletoresVendedor.join(','));
        for (let caixa of caixinhasVendedor) {
            let textoCaixa = padronizarTexto(caixa.textContent);
            if (bannedSellers.some(seller => textoCaixa.includes(seller))) {
                console.log("[Matador] Loja banida encontrada na caixinha! Fechando...");
                window.close();
                return;
            }
        }

        // --- CHECAGEM C: TEXTO DO VENDEDOR LIVRE ---
        for (let i = 0; i < bannedPhrases.length; i++) {
            if (textoCompactado.includes(bannedPhrases[i])) {
                console.log("[Matador] Loja banida encontrada no texto livre! Fechando...");
                window.close();
                return;
            }
        }
    }

    // Roda a checagem pela primeira vez
    verificarEFechar();

    // =====================================================================
    // O VIGIA IMORTAL (MutationObserver)
    // =====================================================================
    // Fica de olho no código do site. Toda vez que a Americanas ou qualquer loja
    // injetar texto novo na tela, ele roda o moedor de carne instantaneamente.
    const observador = new MutationObserver(() => {
        verificarEFechar();
    });

    if (document.body) {
        observador.observe(document.body, { childList: true, subtree: true });
    }

})();