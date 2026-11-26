# MailPulse

Extensão gratuita e open-source de rastreamento de leitura e cliques em links para **Gmail**, disponível para **Google Chrome** e **Mozilla Firefox** — sem assinatura, sem limite de envios e sem precisar configurar servidor ou chave de API.

---

## Como instalar no Google Chrome

1. Baixe este repositório (botão **Code → Download ZIP** no GitHub e extraia a pasta, ou clone com `git clone https://github.com/lucasapolinarioo/mailpulse.git`).
2. Abra o Chrome e acesse:
   ```text
   chrome://extensions
   ```
3. No canto superior direito, ative o **Modo do desenvolvedor** (*Developer mode*).
4. Clique em **Carregar sem compactação** (*Load unpacked*).
5. Selecione a pasta **`extension-chrome`** dentro do projeto.
6. Pronto! Abra o Gmail, clique em **Escrever** e use o botão **MailPulse ativo** ao lado de **Enviar**.

---

## Como instalar no Mozilla Firefox

1. Baixe este repositório (botão **Code → Download ZIP** no GitHub e extraia a pasta, ou clone com `git clone https://github.com/lucasapolinarioo/mailpulse.git`).
2. Abra o Firefox e acesse:
   ```text
   about:debugging#/runtime/this-firefox
   ```
3. Clique em **Carregar extensão temporária...** (*Load Temporary Add-on...*).
4. Entre na pasta **`extension-firefox`** e selecione o arquivo **`manifest.json`**.
5. Pronto! Abra o Gmail e envie normalmente com o **MailPulse ativo**.

> **Nota sobre o Firefox:** extensões carregadas via `about:debugging` permanecem ativas até você fechar o Firefox. Caso queira uma instalação permanente sem publicar na loja, você pode assinar gratuitamente o `mailpulse-firefox.zip` para uso próprio no [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/addon/submit/distribution) escolhendo a opção **On your own** (gera um `.xpi` instalável definitivo, sem custo).

---

## Estrutura do repositório

- `extension-chrome/` — Extensão Manifest V3 para Google Chrome (`mailpulse-chrome.zip` também disponível na raiz).
- `extension-firefox/` — Extensão Manifest V3 para Mozilla Firefox (`mailpulse-firefox.zip` também disponível na raiz).
- `backend/` — Servidor Node.js (zero dependências externas) pronto para **ShardCloud** (`.shardcloud`), com persistência em JSON, isolamento por token anônimo (`X-Client-Token`) e assinatura HMAC para links.

---

## Rodando seu próprio backend (opcional)

A extensão já vem apontando para o servidor configurado em `DEFAULT_BACKEND_URL` no `background.js`. Se quiser hospedar sua própria instância na **ShardCloud**:

1. Faça upload da pasta `backend/` (ou do `mailpulse-backend.zip`) na ShardCloud.
2. Defina as variáveis de ambiente no painel:
   - `PUBLIC_BASE_URL`: URL pública do seu app (ex.: `https://seu-app.shardweb.app`, sem `/` no final).
   - `SIGNING_SECRET`: uma string aleatória longa para assinar links `/c/:id`.
   - `OPEN_GRACE_MS` *(opcional, padrão `15000`)*: janela em ms para ignorar pré-carregamentos imediatos no envio.
3. Atualize `DEFAULT_BACKEND_URL` em `extension-chrome/background.js` e `extension-firefox/background.js` com a sua URL.

### Testes do backend

```bash
cd backend
npm test
```
