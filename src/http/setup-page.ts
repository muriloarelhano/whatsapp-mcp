const setupPage = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WhatsApp MCP — conectar</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101513; color: #edf4ef; }
      main { width: min(32rem, calc(100% - 2rem)); padding: 2rem; border: 1px solid #304139; border-radius: 1rem; background: #17201b; }
      h1 { margin-top: 0; font-size: 1.5rem; } p { color: #bfcec4; line-height: 1.5; }
      input, button { box-sizing: border-box; width: 100%; padding: .8rem; border-radius: .5rem; font: inherit; }
      input { color: inherit; background: #0f1511; border: 1px solid #52655a; } button { margin-top: .75rem; border: 0; background: #4ade80; color: #06230f; font-weight: 700; cursor: pointer; }
      #qr { display: block; width: min(100%, 26rem); margin: 1.5rem auto 0; background: white; border-radius: .5rem; }
      #state { min-height: 1.5rem; } code { font-size: .9em; }
    </style>
  </head>
  <body>
    <main>
      <h1>Conectar WhatsApp</h1>
      <p>Este painel existe apenas no seu computador. Cole o <code>MCP_AUTH_TOKEN</code> do arquivo <code>.env</code>; ele fica só na memória desta página e autoriza a leitura do QR.</p>
      <input id="token" type="password" autocomplete="off" placeholder="MCP_AUTH_TOKEN" aria-label="MCP_AUTH_TOKEN" />
      <button id="load" type="button">Mostrar QR</button>
      <p id="state" role="status">Aguardando token.</p>
      <img id="qr" alt="QR de pareamento do WhatsApp" hidden />
    </main>
    <script>
      const token = document.getElementById("token");
      const state = document.getElementById("state");
      const qr = document.getElementById("qr");
      async function loadQr() {
        qr.hidden = true;
        state.textContent = "Buscando QR…";
        const response = await fetch("/pair", { headers: { Authorization: "Bearer " + token.value } });
        if (!response.ok) {
          state.textContent = response.status === 404 ? "Ainda não há QR. Inicie o serviço e aguarde alguns segundos." : "Token inválido.";
          return;
        }
        const svg = await response.text();
        qr.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        qr.hidden = false;
        state.textContent = "No WhatsApp: Configurações > Aparelhos conectados > Conectar um aparelho.";
      }
      document.getElementById("load").addEventListener("click", () => void loadQr());
    </script>
  </body>
</html>`;

export function setupPageResponse(): Response {
  return new Response(setupPage, {
    headers: {
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}
