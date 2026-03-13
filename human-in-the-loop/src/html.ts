import type { InputType } from "./store.js";

const STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  background: #f5f5f5;
  color: #333;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 32px;
  max-width: 480px;
  width: 100%;
}
h1 { font-size: 20px; margin-bottom: 16px; }
.prompt { font-size: 16px; color: #555; margin-bottom: 20px; line-height: 1.5; }
input[type="text"], input[type="password"], textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
  margin-bottom: 16px;
  font-family: inherit;
}
textarea { min-height: 100px; resize: vertical; }
input:focus, textarea:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}
button {
  background: #2563eb;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  width: 100%;
}
button:hover { background: #1d4ed8; }
button:disabled { background: #9ca3af; cursor: not-allowed; }
.timer { font-size: 14px; color: #888; text-align: center; margin-top: 12px; }
.footer { font-size: 12px; color: #999; text-align: center; margin-top: 16px; line-height: 1.5; }
.icon { font-size: 32px; margin-bottom: 16px; }
.success { color: #16a34a; }
.error { color: #dc2626; }
#renew-error { display: none; color: #dc2626; font-size: 14px; text-align: center; margin-top: 8px; }
`;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(title: string, body: string, script?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="card">
    ${body}
  </div>
  ${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}

function inputField(inputType: InputType): string {
  if (inputType === "textarea") {
    return `<textarea name="value" id="value" required autofocus placeholder="Enter your response here"></textarea>`;
  }
  const type = inputType === "password" ? "password" : "text";
  return `<input type="${type}" name="value" id="value" required autofocus placeholder="Enter your response here">`;
}

export function renderForm(
  token: string,
  prompt: string,
  inputType: InputType,
  expiresAt: number,
): string {
  const timerScript = `
(function() {
  var expiresAt = ${expiresAt};
  var timerEl = document.getElementById("timer");
  var formEl = document.getElementById("submit-form");
  var btnEl = document.getElementById("submit-btn");
  function update() {
    var remaining = Math.max(0, Math.floor(expiresAt - Date.now() / 1000));
    var min = Math.floor(remaining / 60);
    var sec = remaining % 60;
    timerEl.textContent = "Expires in " + min + ":" + (sec < 10 ? "0" : "") + sec;
    if (remaining <= 0) {
      timerEl.textContent = "This link has expired.";
      btnEl.disabled = true;
      formEl.onsubmit = function(e) { e.preventDefault(); };
    }
  }
  update();
  setInterval(update, 1000);
})();
`;

  return layout(
    "Secure Information Request",
    `
    <h1>Secure Information Request</h1>
    <p class="prompt">${escapeHtml(prompt)}</p>
    <form id="submit-form" method="POST">
      ${inputField(inputType)}
      <button type="submit" id="submit-btn">Submit</button>
    </form>
    <div class="timer" id="timer"></div>
    <p class="footer">This is a single-use secure link. It will expire after submission or when the timer runs out.</p>
    `,
    timerScript,
  );
}

export function renderSubmitted(): string {
  return layout(
    "Information Received",
    `
    <div class="icon success">&#10003;</div>
    <h1 class="success">Information Received</h1>
    <p class="prompt">Your information has been securely received. You can close this tab.</p>
    `,
  );
}

export function renderExpired(token: string): string {
  const renewScript = `
document.getElementById("renew-btn").addEventListener("click", function() {
  var btn = this;
  btn.disabled = true;
  btn.textContent = "Requesting...";
  fetch("/hitl/request-new/" + "${escapeHtml(token)}", { method: "POST" })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.url) {
        window.location.href = data.url;
      } else {
        document.getElementById("renew-error").style.display = "block";
        btn.textContent = "Request New Link";
        btn.disabled = false;
      }
    })
    .catch(function() {
      document.getElementById("renew-error").style.display = "block";
      btn.textContent = "Request New Link";
      btn.disabled = false;
    });
});
`;

  return layout(
    "Link Expired",
    `
    <h1>Link Expired</h1>
    <p class="prompt">This link has expired or is no longer valid.</p>
    <button id="renew-btn">Request New Link</button>
    <p id="renew-error">Unable to generate a new link. Please ask the sender for a new link.</p>
    <p class="footer">A new link will be generated with the same request.</p>
    `,
    renewScript,
  );
}

export function renderAlreadyUsed(): string {
  return layout(
    "Link Already Used",
    `
    <h1>Link Already Used</h1>
    <p class="prompt">This link has already been used. Each link can only be used once.</p>
    <p class="footer">If you need to submit again, please ask the sender for a new link.</p>
    `,
  );
}
