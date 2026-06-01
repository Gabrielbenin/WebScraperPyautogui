// ==UserScript==
// @name         Fila Global - Download Sincronizado e InfalÃ­vel (Lojas)
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  Guarantees real physical download of product images via Blobs before recording to CSV and closing tabs. Full e-commerce support.
// @author       VocÃª
// @match        *://*.americanas.com.br/*
// @match        *://*.amazon.com.br/*
// @match        *://*.amazon.com/*
// @match        *://*.mercadolivre.com.br/*
// @match        *://*.leroymerlin.com.br/*
// @match        *://*.casasbahia.com.br/*
// @match        *://*.magazineluiza.com.br/*

// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        window.close
// ==/UserScript==

(function() {
    'use strict';

    const idDestaAba = 'aba_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const ID_BOTAO_PAINEL = 'tm-painel-fila-container';

    // Function to extract the product ID from the current e-commerce page
    function fetchProductId() {
        let elements = document.querySelectorAll('span, p, div, b, strong');
        for (let el of elements) {
            let text = el.innerText || el.textContent;
            if (text && text.includes('ID:')) {
                let match = text.match(/ID:\s*(\d+)/i);
                if (match && match[1]) return match[1];
            }
        }
        return 'ID not found';
    }

    // Busca inteligente da imagem do produto (og:image / Seletores VIP)
    function obterMaiorImagem() {
        let urlImagem = null;

        let metaImage = document.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
        if (metaImage && metaImage.content && metaImage.content.length > 5) {
            let src = metaImage.content;
            if (!src.toLowerCase().includes('logo')) {
                return src.startsWith('//') ? window.location.protocol + src : src;
            }
        }

        const seletoresPrioridade = [
            '[data-testid="product-image"]', '[data-testid="image-selected"]',
            '#landingImage', '#imgBlkFront', '.ui-pdp-gallery__figure__image',
            '.ui-pdp-image', 'picture.src-image img'
        ];

        for (let seletor of seletoresPrioridade) {
            let img = document.querySelector(seletor);
            if (img) {
                let src = img.src || img.getAttribute('data-src') || img.getAttribute('srcset');
                if (src && !src.includes('data:image')) {
                    if (img.getAttribute('srcset')) {
                        let partes = img.getAttribute('srcset').split(',');
                        src = partes[partes.length - 1].trim().split(' ')[0];
                    }
                    return src.startsWith('//') ? window.location.protocol + src : src;
                }
            }
        }

        let imagens = document.querySelectorAll('img');
        let maiorArea = 0;
        const padroesProibidos = ['logo', 'icon', 'sprite', 'banner', 'cupom', 'desconto', 'oferta', 'promocao', 'promo', 'ads', 'utility', 'aproveite', 'goool', 'torcida', 'vuvuzela', 'kabum', 'destaque', 'bis', 'lacta', 'chocolate', 'xtra'];

        imagens.forEach(img => {
            let src = img.src || img.currentSrc || img.getAttribute('data-src') || img.getAttribute('data-lazy');
            if ((!src || src.startsWith('data:image')) && img.getAttribute('srcset')) {
                let srcsetParts = img.getAttribute('srcset').split(',');
                if (srcsetParts.length > 0) src = srcsetParts[srcsetParts.length - 1].trim().split(' ')[0];
            }
            if (!src || src.startsWith('data:image') || src.includes('pixel.gif')) return;

            let srcLower = src.toLowerCase();
            for (let padrao of padroesProibidos) { if (srcLower.includes(padrao)) return; }

            let largura = img.naturalWidth || parseInt(img.getAttribute('width')) || img.clientWidth || 0;
            let altura = img.naturalHeight || parseInt(img.getAttribute('height')) || img.clientHeight || 0;
            let area = largura * altura;

            if (srcLower.includes('produto') || srcLower.includes('product') || srcLower.includes('item')) area += 500000;
            if (area === 0 && src) area = 10000;

            if (area > maiorArea) {
                maiorArea = area;
                urlImagem = src;
            }
        });

        if (urlImagem && urlImagem.startsWith('//')) urlImagem = window.location.protocol + urlImagem;
        return urlImagem || 'Nenhuma imagem encontrada';
    }

    function obterExtensao(url) {
        if (url === 'Nenhuma imagem encontrada') return 'jpg';
        try {
            let path = new URL(url).pathname;
            let ext = path.split('.').pop().toLowerCase();
            if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return ext;
        } catch(e) {}
        return 'jpg';
    }

    // FUNÃ‡ÃƒO MOTOR: Baixa a imagem via XMLHttpRequest (burlar bloqueios) e sÃ³ depois salva na fila global
    function gerenciarDownloadESalvamento(urlImagem, urlPagina, idExtraido, nomeLocalArquivo, caminhoCompletoImagem, proximaAcao) {
        if (urlImagem === 'Nenhuma imagem encontrada') {
            gravarNaFilaGlobal('SEM IMAGEM');
            return;
        }

        // ForÃ§a cabeÃ§alhos vÃ¡lidos da loja para o servidor liberar o download 100% limpo
        GM_xmlhttpRequest({
            method: "GET",
            url: urlImagem,
            responseType: "blob",
            headers: {
                "Referer": window.location.origin,
                "User-Agent": navigator.userAgent
            },
            onload: function(response) {
                if (response.status >= 200 && response.status < 300 && response.response) {
                    let blobUrl = URL.createObjectURL(response.response);

                    // Entrega o arquivo binÃ¡rio direto para o gerenciador do navegador
                    GM_download({
                        url: blobUrl,
                        name: caminhoCompletoImagem,
                        saveAs: false,
                        onload: function() {
                            URL.revokeObjectURL(blobUrl); // Limpa cache
                            gravarNaFilaGlobal(nomeLocalArquivo); // SUCESSO COMPLETO
                        },
                        onerror: function(err) {
                            URL.revokeObjectURL(blobUrl);
                            gravarNaFilaGlobal(`ERRO: Travado no PC (${err.error || 'Permissao'})`);
                        }
                    });
                } else {
                    gravarNaFilaGlobal(`ERRO: Bloqueio Loja (Status ${response.status})`);
                }
            },
            onerror: function() {
                gravarNaFilaGlobal('ERRO: Falha de conexao com imagem');
            },
            ontimeout: function() {
                gravarNaFilaGlobal('ERRO: Tempo limite esgotado');
            },
            timeout: 6000 // Limite de 6 segundos por imagem para nÃ£o travar seu fluxo
        });

        function gravarNaFilaGlobal(resultadoNomeArquivo) {
            let fila = GM_getValue('FILA_CSV_GLOBAL', []);
            fila.push({
                abaId: idDestaAba,
                urlPagina: urlPagina,
                urlImagem: urlImagem,
                nomeArquivo: resultadoNomeArquivo,
                idProduto: idExtraido
            });
            GM_setValue('FILA_CSV_GLOBAL', fila);
            proximaAcao();
        }
    }

    // FunÃ§Ã£o interna para gerar o arquivo CSV consolidado
    function gerarCsvFinal(filaCompleta) {
        let idParaNomeArquivo = '';
        filaCompleta.forEach(item => {
            if (item.idProduto && item.idProduto !== 'ID nÃ£o encontrado' && item.idProduto !== '') {
                idParaNomeArquivo = item.idProduto;
            }
        });

        let nomeFinalCsv = idParaNomeArquivo ? `${idParaNomeArquivo}.csv` : `Relatorio_Imagens_${Date.now()}.csv`;
        let caminhoCompletoCsv = `AbasSalvas/${nomeFinalCsv}`;

        let csvContent = "\uFEFF";
        csvContent += "Page URL;Image URL;Saved File Name;Product ID\n";

        filaCompleta.forEach(item => {
            let urlPagTratada = item.urlPagina.replace(/"/g, '""');
            let urlImgTratada = item.urlImagem.replace(/"/g, '""');
            let nomeTratado = item.nomeArquivo.replace(/"/g, '""');
            let idTratado = (item.idProduto || '').replace(/"/g, '""');
            csvContent += `"${urlPagTratada}";"${urlImgTratada}";"${nomeTratado}";"${idTratado}"\n`;
        });

        let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        let urlBlob = URL.createObjectURL(blob);

        GM_setValue('FILA_CSV_GLOBAL', []); // Reseta cache global

        GM_download({
            url: urlBlob,
            name: caminhoCompletoCsv,
            saveAs: false,
            onload: () => window.close(),
            onerror: () => window.close()
        });

        setTimeout(() => { window.close(); }, 2000);
    }

    function gerenciarPainel() {
        if (document.getElementById(ID_BOTAO_PAINEL)) {
            let fila = GM_getValue('FILA_CSV_GLOBAL', []);
            const txt = document.getElementById('tm-status-text');
            if (txt) txt.innerText = `ðŸ“‹ Fila: ${fila.length} itens`;
            return;
        }

        const painel = document.createElement('div');
        painel.id = ID_BOTAO_PAINEL;
        painel.style = "position:fixed; bottom:20px; right:20px; z-index:9999999; background-color:#2c3e50; color:white; padding:15px; border-radius:10px; box-shadow:0 4px 15px rgba(0,0,0,0.4); font-family:Arial,sans-serif; display:flex; flex-direction:column; gap:8px; min-width:180px;";

        const statusFila = document.createElement('div');
        statusFila.id = 'tm-status-text';
        statusFila.style = "font-weight:bold; text-align:center; font-size:14px;";
        statusFila.innerText = 'ðŸ“‹ Fila: 0 itens';
        painel.appendChild(statusFila);

        const btnAdicionar = document.createElement('button');
        btnAdicionar.id = 'tm-btn-adicionar';
        btnAdicionar.innerText = 'âž• Adicionar (Teclado: Insert)';
        btnAdicionar.style = "padding:8px; background-color:#3498db; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;";
        painel.appendChild(btnAdicionar);

        const btnSalvar = document.createElement('button');
        btnSalvar.id = 'tm-btn-salvar';
        btnSalvar.innerText = 'ðŸ’¾ Baixar CSV e Fechar (Teclado: End)';
        btnSalvar.style = "padding:8px; background-color:#2ecc71; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;";
        painel.appendChild(btnSalvar);

        if (document.body) document.body.appendChild(painel);

        // CLIQUE: Inserir na Fila
        btnAdicionar.addEventListener('click', function() {
            btnAdicionar.innerText = 'â³ Baixando...';
            btnAdicionar.disabled = true;

            let urlPagina = window.location.href;
            let urlImagem = obterMaiorImagem();
            let idExtracted = fetchProductId();
            let nomeLocalArquivo = `IMG_${Date.now()}_${Math.floor(Math.random() * 1000)}.${obterExtensao(urlImagem)}`;

            gerenciarDownloadESalvamento(urlImagem, urlPagina, idExtracted, nomeLocalArquivo, `AbasSalvas/${nomeLocalArquivo}`, function() {
                window.close(); // SÃ³ fecha quando a funÃ§Ã£o terminar de gravar com sucesso
            });
        });

        // CLIQUE: Exportar CSV final
        btnSalvar.addEventListener('click', function() {
            btnSalvar.innerText = 'â³ Concluindo...';
            btnSalvar.disabled = true;

            let fila = GM_getValue('FILA_CSV_GLOBAL', []);
            let jaAdicionado = fila.some(item => item.abaId === idDestaAba);

            if (jaAdicionado) {
                gerarCsvFinal(fila);
            } else {
                let urlPagina = window.location.href;
                let urlImagem = obterMaiorImagem();
                let idExtracted = fetchProductId();
                let nomeLocalArquivo = `IMG_${Date.now()}_${Math.floor(Math.random() * 1000)}.${obterExtensao(urlImagem)}`;

                // Baixa a foto da Ãºltima aba antes de gerar o relatÃ³rio mestre
                gerenciarDownloadESalvamento(urlImagem, urlPagina, idExtracted, nomeLocalArquivo, `AbasSalvas/${nomeLocalArquivo}`, function() {
                    let filaAtualizada = GM_getValue('FILA_CSV_GLOBAL', []);
                    gerarCsvFinal(filaAtualizada);
                });
            }
        });
    }

    // Monitoramento do teclado
    document.addEventListener('keydown', function(event) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable) return;

        if (event.key === 'Insert') {
            event.preventDefault();
            const btn = document.getElementById('tm-btn-adicionar');
            if (btn && !btn.disabled) btn.click();
        }
        if (event.key === 'End') {
            event.preventDefault();
            const btn = document.getElementById('tm-btn-salvar');
            if (btn && !btn.disabled) btn.click();
        }
    });

    setInterval(gerenciarPainel, 1000);

})();
