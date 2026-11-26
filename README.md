# MailPulse

Extensão gratuita e open-source de rastreamento de leitura e cliques em links para **Gmail**, disponível para **Google Chrome** e **Mozilla Firefox** — sem assinatura, sem limite de envios e sem precisar configurar servidor ou chave de API.

---

## Como instalar no Google Chrome

1. Baixe o arquivo **`mailpulse-chrome.zip`** na página de [Releases](https://github.com/lucasapolinarioo/mailpulse/releases) (ou baixe este repositório em **Code → Download ZIP**) e extraia a pasta.
2. Abra o Chrome e acesse:
   ```text
   chrome://extensions
   ```
3. No canto superior direito, ative o **Modo do desenvolvedor** (*Developer mode*).
4. Clique em **Carregar sem compactação** (*Load unpacked*).
5. Selecione a pasta extraída (ou **`extension-chrome`** caso tenha baixado o repositório completo).
6. Pronto! Abra o Gmail, clique em **Escrever** e use o botão **MailPulse ativo** ao lado de **Enviar**.

---

## Como instalar no Mozilla Firefox

1. Baixe o arquivo **`mailpulse-firefox.zip`** na página de [Releases](https://github.com/lucasapolinarioo/mailpulse/releases) (ou baixe este repositório em **Code → Download ZIP**) e extraia a pasta.
2. Abra o Firefox e acesse:
   ```text
   about:debugging#/runtime/this-firefox
   ```
3. Clique em **Carregar extensão temporária...** (*Load Temporary Add-on...*).
4. Entre na pasta extraída (ou em **`extension-firefox`**) e selecione o arquivo **`manifest.json`**.
5. Pronto! Abra o Gmail e envie normalmente com o **MailPulse ativo**.

> **Nota sobre o Firefox:** extensões carregadas via `about:debugging` permanecem ativas até você fechar o Firefox. Caso queira uma instalação permanente sem publicar na loja, você pode assinar gratuitamente o `mailpulse-firefox.zip` para uso próprio no [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/addon/submit/distribution) escolhendo a opção **On your own** (gera um `.xpi` instalável definitivo, sem custo).

---

## Estrutura do repositório

- `extension-chrome/` — Extensão Manifest V3 para Google Chrome (`mailpulse-chrome.zip`).
- `extension-firefox/` — Extensão Manifest V3 para Mozilla Firefox (`mailpulse-firefox.zip`).
