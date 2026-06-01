"""
Automacao de Pesquisa de Concorrentes - MadeiraMadeira
======================================================

Este script automatiza o processo manual de:
1. Abrir links de produtos da MadeiraMadeira a partir de uma planilha Google Sheets
2. Esperar as extensoes Tampermonkey fazerem a busca no Google Lens e abrir concorrentes
3. Processar cada aba com Insert (baixar imagem) e End (exportar CSV na ultima aba)
4. Voltar ao Sheets e repetir com o proximo produto

USO:
    python automacao.py

CONTROLES:
    - ESC: Para a automacao a qualquer momento
    - O script inicia apos uma contagem regressiva de 5 segundos (tempo para focar no navegador)

PRE-REQUISITOS:
    - Google Sheets aberto na aba 1 (mais a esquerda) do navegador
    - Cursor na celula do primeiro link do produto
    - Extensoes Tampermonkey ativas e funcionando
    - pip install pyautogui keyboard pygetwindow
"""

import time
import sys
import io
import threading
import pyautogui
import keyboard
import pygetwindow as gw

# Forcar stdout para UTF-8 no Windows (evita crash com caracteres especiais)
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ============================================================================
# CONFIGURACOES (ajuste conforme necessario)
# ============================================================================

# Tempo (em segundos) para esperar as extensoes Tampermonkey terminarem.
# Inclui: abrir MadeiraMadeira -> Google Lens -> abrir concorrentes -> fechar invalidas
WAIT_EXTENSIONS = 48

# Tempo (em segundos) apos apertar Insert/End para a aba baixar a imagem e fechar
WAIT_AFTER_KEY = 4

# Tempo (em segundos) para espiar a proxima aba (Ctrl+Tab) e voltar
WAIT_PEEK = 0.7

# Tempo (em segundos) entre acoes rapidas (pequeno delay de seguranca)
WAIT_MICRO = 0.3

# Tempo (em segundos) da contagem regressiva antes de iniciar
COUNTDOWN = 5

# Numero maximo de tentativas ao detectar popup bloqueador
POPUP_RETRY_MAX = 3

# Tempo (em segundos) para verificar se o link abriu apos Alt+Enter
WAIT_AFTER_OPEN = 2

# Tempo (em segundos) de espera entre um produto e outro (para evitar bloqueio dos sites)
WAIT_BETWEEN_PRODUCTS = 40



# Palavras-chave no titulo da janela que indicam que estamos no Google Sheets
SHEETS_KEYWORDS = [
    "google sheets", "google planilhas", "sheets",
    "- planilhas google", "- google sheets"
]

# ============================================================================
# ESTADO GLOBAL
# ============================================================================

stop_event = threading.Event()


# ============================================================================
# FUNCOES AUXILIARES
# ============================================================================

def setup_esc_hook():
    """Registra a tecla ESC como hotkey de parada."""
    keyboard.add_hotkey('esc', lambda: stop_event.set(), suppress=True)


def should_stop():
    """Verifica se o usuario pediu para parar (ESC)."""
    return stop_event.is_set()


def get_active_title():
    """Retorna o titulo da janela ativa do sistema operacional."""
    try:
        window = gw.getActiveWindow()
        if window and window.title:
            return window.title
    except Exception:
        pass
    return ""


def is_sheets_active():
    """Verifica se a janela ativa e o Google Sheets."""
    title = get_active_title().lower()
    return any(kw in title for kw in SHEETS_KEYWORDS)


def print_header(msg):
    """Imprime um cabecalho de status bem visivel."""
    print(f"\n{'=' * 60}")
    print(f"  {msg}")
    print(f"{'=' * 60}")


def print_step(msg):
    """Imprime um passo do processo."""
    print(f"  > {msg}")


def countdown(seconds, msg="Iniciando em"):
    """Contagem regressiva com verificacao de ESC."""
    for i in range(seconds, 0, -1):
        if should_stop():
            return False
        print(f"\r  [{msg} {i}s...]  ", end="", flush=True)
        time.sleep(1)
    print(f"\r  [INICIANDO AGORA!]              ")
    return True


def wait_with_esc(seconds, msg="Aguardando"):
    """Espera N segundos, mas verifica ESC a cada segundo. Mostra contagem regressiva."""
    for i in range(seconds, 0, -1):
        if should_stop():
            return False
        print(f"\r  [{msg}: {i}s restantes...]  ", end="", flush=True)
        time.sleep(1)
    print(f"\r  [{msg}: concluido!]                    ")
    return True


def safe_sleep(seconds):
    """Sleep que verifica ESC."""
    remaining = seconds
    while remaining > 0 and not should_stop():
        chunk = min(remaining, 0.2)
        time.sleep(chunk)
        remaining -= chunk
    return not should_stop()


# ============================================================================
# LOGICA PRINCIPAL
# ============================================================================

def open_link_in_sheets(is_first_product):
    """
    Abre o link da celula atual no Google Sheets.
    - Primeiro produto: apenas Alt+Enter
    - Produtos subsequentes: seta pra baixo + Alt+Enter
    - Detecta popup bloqueador e tenta novamente (ate POPUP_RETRY_MAX vezes)
    """
    if not is_first_product:
        pyautogui.press('down')
        if not safe_sleep(WAIT_MICRO):
            return False

    for attempt in range(1, POPUP_RETRY_MAX + 1):
        pyautogui.hotkey('alt', 'enter')

        # Esperar um pouco para ver se o link abriu (nova aba) ou se ficou no Sheets
        safe_sleep(WAIT_AFTER_OPEN)

        if should_stop():
            return False

        # Se o foco saiu do Sheets, o link abriu com sucesso
        if not is_sheets_active():
            return True

        # Foco ainda no Sheets -> provavelmente popup bloqueador apareceu
        # Pressionar Enter para fechar o dialog "OK"
        print_step(f"Popup bloqueador detectado! Tentativa {attempt}/{POPUP_RETRY_MAX}...")
        pyautogui.press('enter')
        safe_sleep(1)

    # Todas as tentativas falharam
    print_step("AVISO: Nao conseguiu abrir o link apos varias tentativas.")
    print_step("       Verifique se popups estao permitidos para docs.google.com")
    return True  # Retorna True para nao parar o loop, sera tratado no passo 3


def count_tabs_to_process():
    """
    Conta quantas abas precisam ser processadas (Insert/End).
    A partir da aba atual, faz Ctrl+Tab ate chegar no Sheets.
    Apos a contagem, o foco estara no Sheets.

    Retorna o numero total de abas a processar (incluindo a aba inicial),
    ou -1 se falhou/interrompido.
    """
    tabs_after_current = 0

    while not should_stop():
        pyautogui.hotkey('ctrl', 'tab')
        safe_sleep(1)  # Tempo para o Chrome trocar de aba e titulo atualizar

        if is_sheets_active():
            # Chegou no Sheets, contagem concluida
            total = tabs_after_current + 1  # +1 para incluir a aba inicial (MadeiraMadeira)
            return total

        tabs_after_current += 1

        # Seguranca: se passou de 20 abas, algo esta errado
        if tabs_after_current > 20:
            print_step("AVISO: Mais de 20 abas detectadas, abortando contagem.")
            return -1

    return -1


def process_tabs():
    """
    Processa todas as abas abertas (MadeiraMadeira + concorrentes).

    Fluxo:
    1. Conta abas fazendo Ctrl+Tab ate chegar no Sheets
    2. Do Sheets, Ctrl+Tab para ir para a MadeiraMadeira (1a aba a processar)
    3. Insert nas primeiras N-1 abas, End na ultima

    Retorna o numero de abas processadas, ou -1 se interrompido.
    """
    # Passo 1: Contar abas
    print_step("Contando abas abertas...")
    total_tabs = count_tabs_to_process()

    if total_tabs == -1 or should_stop():
        return -1

    if total_tabs == 0:
        print_step("Nenhuma aba para processar.")
        return 0

    print_step(f"{total_tabs} aba(s) para processar.")

    # Passo 2: Estamos no Sheets. Ctrl+Tab para ir para a MadeiraMadeira
    pyautogui.hotkey('ctrl', 'tab')
    safe_sleep(1)

    # Passo 3: Processar cada aba em ordem
    for i in range(1, total_tabs + 1):
        if should_stop():
            return -1

        # Seguranca: se caiu no Sheets antes do esperado, alguma aba fechou sozinha
        if is_sheets_active():
            print_step(f"Voltou ao Sheets antes do esperado (aba {i}/{total_tabs}).")
            return i - 1

        if i == total_tabs:
            # Ultima aba -> End (baixa imagem + gera CSV + fecha)
            print_step(f"Aba {i}/{total_tabs}: [ULTIMA] Apertando END...")
            pyautogui.press('end')
        else:
            # Nao e a ultima -> Insert (baixa imagem + fecha)
            print_step(f"Aba {i}/{total_tabs}: Apertando INSERT...")
            pyautogui.press('insert')

        # Esperar o script Tampermonkey baixar a imagem e fechar a aba
        if not wait_with_esc(WAIT_AFTER_KEY, f"Aba {i}/{total_tabs} processando"):
            return -1

    print_step(f"Todas as {total_tabs} abas processadas!")
    return total_tabs


def cleanup_leftover_tabs():
    """
    Verifica e fecha quaisquer abas restantes alem do Google Sheets.
    Faz Ctrl+Tab para checar se ha outra aba. Se houver, fecha com Ctrl+W.
    Repete ate sobrar apenas o Sheets.
    """
    cleanup_count = 0

    while not should_stop():
        # Garantir que estamos no Sheets primeiro
        if not is_sheets_active():
            print_step("Foco nao esta no Sheets. Fechando aba residual...")
            pyautogui.hotkey('ctrl', 'w')
            safe_sleep(1)
            cleanup_count += 1
            continue

        # Estamos no Sheets. Verificar se existe outra aba
        pyautogui.hotkey('ctrl', 'tab')
        safe_sleep(0.7)

        if is_sheets_active():
            # Ctrl+Tab nos deixou no Sheets = so tem o Sheets. Tudo limpo!
            return cleanup_count

        # Existe outra aba aberta. Fechar.
        print_step("Fechando aba residual...")
        pyautogui.hotkey('ctrl', 'w')
        safe_sleep(1)
        cleanup_count += 1

        # Seguranca: nao ficar em loop infinito
        if cleanup_count > 20:
            print_step("AVISO: Muitas abas residuais. Abortando limpeza.")
            return cleanup_count

    return cleanup_count


def run_automation():
    """Loop principal da automacao."""

    print_header("AUTOMACAO DE PESQUISA DE CONCORRENTES")
    print()
    print("  Controles:")
    print("    ESC = Parar a automacao imediatamente")
    print()
    print("  Pre-requisitos:")
    print("    Google Sheets aberto na 1a aba do navegador")
    print("    Cursor na celula do primeiro link do produto")
    print("    Extensoes Tampermonkey ativas")
    print()
    print(f"  Configuracao:")
    print(f"    Espera para extensoes: {WAIT_EXTENSIONS}s")
    print(f"    Espera apos Insert/End: {WAIT_AFTER_KEY}s")
    print(f"    Cooldown entre produtos: {WAIT_BETWEEN_PRODUCTS}s")
    print()

    # Contagem regressiva para o usuario focar no navegador
    if not countdown(COUNTDOWN, "Iniciando em"):
        print_header("PARADO PELO USUARIO (ESC)")
        return

    product_count = 0
    consecutive_failures = 0

    while not should_stop():
        product_count += 1
        is_first = (product_count == 1)

        # -- PASSO 1: Abrir o link -------------------------------------------
        if is_first:
            print_header(f"PRODUTO #{product_count}")
            print_step("Abrindo primeiro link (Alt+Enter)...")
        else:
            print_header(f"PRODUTO #{product_count}")
            print_step("Movendo para proximo link e abrindo (Alt+Enter)...")

        if not open_link_in_sheets(is_first):
            break

        # -- PASSO 2: Verificar se o link abriu ------------------------------
        if is_sheets_active():
            # Link nao abriu. Tentar recuperacao.
            print_step("Link nao abriu. Tentando recuperacao...")

            # Tentativa 1: Escape (sair de modo edicao) + Alt+Enter
            pyautogui.press('escape')
            safe_sleep(0.5)
            pyautogui.hotkey('alt', 'enter')
            safe_sleep(WAIT_AFTER_OPEN)

            if is_sheets_active():
                # Tentativa 2: Subir + Descer + Alt+Enter
                print_step("Ainda no Sheets. Tentando subir e descer...")
                pyautogui.press('up')
                safe_sleep(0.3)
                pyautogui.press('down')
                safe_sleep(0.3)
                pyautogui.hotkey('alt', 'enter')
                safe_sleep(WAIT_AFTER_OPEN)

            if is_sheets_active():
                # Ainda nao abriu
                consecutive_failures += 1
                print_step(f"Link nao abriu ({consecutive_failures} falha(s) consecutiva(s)).")

                if consecutive_failures >= 2:
                    print_header("FIM DOS LINKS -- Nenhum link encontrado nas ultimas celulas")
                    break

                print_step("Tentando proximo link...")
                continue
            # Se chegou aqui, o link abriu na recuperacao
            print_step("Link abriu na recuperacao!")

        # Link abriu com sucesso, resetar contador de falhas
        consecutive_failures = 0

        # -- PASSO 3: Esperar as extensoes trabalharem -----------------------
        print_step(f"Aguardando extensoes Tampermonkey ({WAIT_EXTENSIONS}s)...")
        if not wait_with_esc(WAIT_EXTENSIONS, "Extensoes trabalhando"):
            break

        # -- PASSO 4: Verificar se abas foram abertas -----------------------
        safe_sleep(0.5)

        if is_sheets_active():
            print_step("AVISO: Foco ainda no Sheets apos espera. Link pode ser invalido.")
            print_step("       Pulando para o proximo produto...")
            continue

        # -- PASSO 5: Processar abas (Insert/End) ---------------------------
        print_step("Iniciando processamento de abas...")
        tabs_processed = process_tabs()

        if tabs_processed == -1:
            break

        # -- PASSO 6: Limpar abas residuais ---------------------------------
        print_step("Verificando se sobrou apenas o Sheets...")
        safe_sleep(0.5)
        leftover = cleanup_leftover_tabs()
        if leftover > 0:
            print_step(f"{leftover} aba(s) residual(is) fechada(s).")
        else:
            print_step("OK, apenas o Sheets esta aberto.")

        # -- PASSO 7: Pronto para o proximo produto -------------------------
        print_step(f"Produto #{product_count} concluido! ({tabs_processed} abas)")

        # -- PASSO 8: Cooldown para evitar bloqueio dos sites ----------------
        # Verificar se e hora da pausa Anti-Ban (Pomodoro)
        if product_count % 40 == 0:
            print_header("PAUSA ANTI-BAN INICIADA")
            print("  Pausa Anti-Ban iniciada. Retornando em 7 minutos...")
            if not wait_with_esc(420, "Pausa Anti-Ban"):
                break
        else:
            print_step(f"Aguardando cooldown de {WAIT_BETWEEN_PRODUCTS}s antes do proximo produto...")
            if not wait_with_esc(WAIT_BETWEEN_PRODUCTS, "Cooldown"):
                break

    # -- FIM ------------------------------------------------------------------
    if should_stop():
        print_header(f"PARADO PELO USUARIO (ESC) -- {product_count} produto(s) processado(s)")
    else:
        print_header(f"AUTOMACAO CONCLUIDA -- {product_count} produto(s) processado(s)")


# ============================================================================
# PONTO DE ENTRADA
# ============================================================================

if __name__ == "__main__":
    # Configurar fail-safe do pyautogui (mover mouse pro canto superior esquerdo aborta)
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.05  # Delay minimo entre acoes do pyautogui

    # Registrar hotkey ESC
    setup_esc_hook()

    try:
        run_automation()
    except KeyboardInterrupt:
        print_header("INTERROMPIDO (Ctrl+C)")
    except pyautogui.FailSafeException:
        print_header("FAIL-SAFE ATIVADO (mouse no canto superior esquerdo)")
    finally:
        # Limpar hotkeys registradas
        keyboard.unhook_all()
        print("\n  Automacao encerrada.\n")
