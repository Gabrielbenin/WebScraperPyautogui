// ==UserScript==
// @name         Product Scraper - Auto Google Lens (Image Focused)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Extracts the main product image and opens Google Lens for visual competitor search
// @author       You
// @match        https://*/*
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    let urlAtual = location.href;
    let jaProcessou = false;

    // Função que foca especificamente em seletores de imagens de produtos
    async function processarImagemPrincipal() {
        console.log("📸 Iniciando busca pela imagem do produto...");

        let imagemProdutoValida = null;

        // AGGRESSIVE SEARCH STRATEGY (Prioritizing product carousel selectors)
        // These are common selectors in e-commerce product carousels that contain the main photo.
        const seletoresAlvo = [
            // Imagem principal ativa no carrossel grande
            '.slick-active.slick-current [data-testid="product-image"] img',
            '[data-testid="product-image"] img', // Qualquer imagem de produto com teste-id
            '.carousel__image-product',          // Classe genérica de imagem de produto
            '.image-product',                    // Outra classe genérica
            'meta[property="og:image"]'         // fallback final: imagem de Open Graph (metadado)
        ];

        // Tenta cada seletor na ordem até encontrar um com fonte válida
        for (const seletor of seletoresAlvo) {
            const elemento = document.querySelector(seletor);

            if (elemento) {
                // Se o elemento for um <meta>, o link tá no content
                const src = elemento.tagName === 'META' ? elemento.content : elemento.src;

                // Ignora se não tiver link ou se for link de imagem quebrada/ícone minúsculo
                if (src && src.length > 5 && !src.includes('base64') && (seletor === 'meta[property="og:image"]' || elemento.naturalWidth > 200)) {
                    imagemProdutoValida = src;
                    console.log(`✅ Imagem encontrada via seletor: ${seletor}`);
                    break; // Achou uma boa, para a busca
                }
            }
        }

        if (imagemProdutoValida) {
            console.log("📸 Link da Imagem:", imagemProdutoValida);

            // 1. Copia o LINK (Garantia)
            GM_setClipboard(imagemProdutoValida, "text");

            // 2. Tenta copiar o ARQUIVO real (Opcional, para Ctrl+V em chats)
            try {
                const resposta = await fetch(imagemProdutoValida);
                const blob = await resposta.blob();
                await navigator.clipboard.write([ new ClipboardItem({ [blob.type]: blob }) ]);
                console.log("📦 Arquivo de imagem copiado.");
            } catch (e) {
                console.log("📦 Não foi possível copiar o arquivo, apenas o link.");
            }

            // 3. ABRE O GOOGLE LENS com a imagem correta
            const linkGoogleLens = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imagemProdutoValida)}`;
            window.open(linkGoogleLens, '_blank');

        } else {
            // Se ainda não carregou, tenta novamente em 1 segundo (a internet pode estar lenta)
            setTimeout(processarImagemPrincipal, 1000);
        }
    }

    // Vigiando mudanças na URL (padrão SPA)
    setInterval(() => {
        if (location.href !== urlAtual) {
            urlAtual = location.href;
            jaProcessou = false; // Reset quando muda a página
        }

        // Se não é a home e ainda não processou
        if (!jaProcessou && location.pathname.length > 2 && location.pathname !== '/') {
            jaProcessou = true;
            console.log("🔄 Nova URL de produto! Aguardando carregamento...");
            // Espera as fotos carregarem
            setTimeout(processarImagemPrincipal, 2500);
        }
    }, 1000);

})();