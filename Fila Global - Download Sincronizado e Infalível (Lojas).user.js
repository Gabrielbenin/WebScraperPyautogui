// ==UserScript==
// @name         Fila Global - Download Sincronizado e Infalível (Lojas)
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  Garante o download físico real das imagens via Blobs antes de registrar no CSV e fechar as abas. Suporte total a MadeiraMadeira.
// @author       Você
// @match        *://*.americanas.com.br/*
// @match        *://*.amazon.com.br/*
// @match        *://*.amazon.com/*
// @match        *://*.mercadolivre.com.br/*
// @match        *://*.leroymerlin.com.br/*
// @match        *://*.casasbahia.com.br/*
// @match        *://*.magazineluiza.com.br/*
// @match        *://*.madeiramadeira.com.br/*
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

    // Função para caçar o ID na MadeiraMadeira
    function buscarIdMadeira() {
        if (!window.location.href.includes('madeiramadeira.com.br')) return '';
        let elementos = document.querySelectorAll('span, p, div, b, strong');
        for (let el of elementos) {
            let texto = el.innerText || el.textContent;
            if (texto && texto.includes('ID:')) {
                let match = texto.match(/ID:\s*(\d+)/i);
                if (match && match[1]) return match[1];
            }
        }
        return 'ID não encontrado';
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

    // FUNÇÃO MOTOR: Baixa a imagem via XMLHttpRequest (burlar bloqueios) e só depois salva na fila global
    function gerenciarDownloadESalvamento(urlImagem, urlPagina, idExtraido, nomeLocalArquivo, caminhoCompletoImagem, proximaAcao) {
        if (urlImagem === 'Nenhuma imagem encontrada') {
            gravarNaFilaGlobal('SEM IMAGEM');
            return;
        }

        // Força cabeçalhos válidos da loja para o servidor liberar o download 100% limpo
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

                    // Entrega o arquivo binário direto para o gerenciador do navegador
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
            timeout: 6000 // Limite de 6 segundos por imagem para não travar seu fluxo
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

    // Função interna para gerar o arquivo CSV consolidado
    function gerarCsvFinal(filaCompleta) {
        let idParaNomeArquivo = '';
        filaCompleta.forEach(item => {
            if (item.idProduto && item.idProduto !== 'ID não encontrado' && item.idProduto !== '') {
                idParaNomeArquivo = item.idProduto;
            }
        });

        let nomeFinalCsv = idParaNomeArquivo ? `${idParaNomeArquivo}.csv` : `Relatorio_Imagens_${Date.now()}.csv`;
        let caminhoCompletoCsv = `AbasSalvas/${nomeFinalCsv}`;

        let csvContent = "\uFEFF";
        csvContent += "Link da Pagina;Link da Imagem;Nome do Arquivo Salvo;ID (MadeiraMadeira)\n";

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
            if (txt) txt.innerText = `📋 Fila: ${fila.length} itens`;
            return;
        }

        const painel = document.createElement('div');
        painel.id = ID_BOTAO_PAINEL;
        painel.style = "position:fixed; bottom:20px; right:20px; z-index:9999999; background-color:#2c3e50; color:white; padding:15px; border-radius:10px; box-shadow:0 4px 15px rgba(0,0,0,0.4); font-family:Arial,sans-serif; display:flex; flex-direction:column; gap:8px; min-width:180px;";

        const statusFila = document.createElement('div');
        statusFila.id = 'tm-status-text';
        statusFila.style = "font-weight:bold; text-align:center; font-size:14px;";
        statusFila.innerText = '📋 Fila: 0 itens';
        painel.appendChild(statusFila);

        const btnAdicionar = document.createElement('button');
        btnAdicionar.id = 'tm-btn-adicionar';
        btnAdicionar.innerText = '➕ Adicionar (Teclado: Insert)';
        btnAdicionar.style = "padding:8px; background-color:#3498db; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;";
        painel.appendChild(btnAdicionar);

        const btnSalvar = document.createElement('button');
        btnSalvar.id = 'tm-btn-salvar';
        btnSalvar.innerText = '💾 Baixar CSV e Fechar (Teclado: End)';
        btnSalvar.style = "padding:8px; background-color:#2ecc71; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;";
        painel.appendChild(btnSalvar);

        if (document.body) document.body.appendChild(painel);

        // CLIQUE: Inserir na Fila
        btnAdicionar.addEventListener('click', function() {
            btnAdicionar.innerText = '⏳ Baixando...';
            btnAdicionar.disabled = true;

            let urlPagina = window.location.href;
            let urlImagem = obterMaiorImagem();
            let idExtraido = buscarIdMadeira();
            let nomeLocalArquivo = `IMG_${Date.now()}_${Math.floor(Math.random() * 1000)}.${obterExtensao(urlImagem)}`;

            gerenciarDownloadESalvamento(urlImagem, urlPagina, idExtraido, nomeLocalArquivo, `AbasSalvas/${nomeLocalArquivo}`, function() {
                window.close(); // Só fecha quando a função terminar de gravar com sucesso
            });
        });

        // CLIQUE: Exportar CSV final
        btnSalvar.addEventListener('click', function() {
            btnSalvar.innerText = '⏳ Concluindo...';
            btnSalvar.disabled = true;

            let fila = GM_getValue('FILA_CSV_GLOBAL', []);
            let jaAdicionado = fila.some(item => item.abaId === idDestaAba);

            if (jaAdicionado) {
                gerarCsvFinal(fila);
            } else {
                let urlPagina = window.location.href;
                let urlImagem = obterMaiorImagem();
                let idExtraido = buscarIdMadeira();
                let nomeLocalArquivo = `IMG_${Date.now()}_${Math.floor(Math.random() * 1000)}.${obterExtensao(urlImagem)}`;

                // Baixa a foto da última aba antes de gerar o relatório mestre
                gerenciarDownloadESalvamento(urlImagem, urlPagina, idExtraido, nomeLocalArquivo, `AbasSalvas/${nomeLocalArquivo}`, function() {
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